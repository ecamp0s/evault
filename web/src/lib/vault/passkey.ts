import {
  type Encrypted,
  base64ToBytes,
  bytesToBase64,
  derivePasskeyKeys,
  randomBytes,
  rewrap,
} from '@/lib/vault/crypto'

/**
 * Opening the vault with a passkey. See ADR-021.
 *
 * WHAT WEBAUTHN IS DOING HERE IS NOT AUTHENTICATION. The authenticator is used as a
 * key derivation function with a biometric check in front of it: its PRF extension
 * returns 32 deterministic bytes for a given credential and salt, and those bytes wrap
 * the vault key exactly as the master password and the recovery key already do.
 *
 * That is why nothing in this file talks to a server about signatures, and why there is
 * no challenge worth verifying. The reasoning is in ADR-021 §2.4, and it rests on one
 * property that lives in THIS file and nowhere else: `userVerification: 'required'`.
 * Take it away and the PRF stops proving that a person was in front of the device, and
 * the whole decision stops holding.
 */

/**
 * The PRF salt. Public, fixed and the same for every credential of every account.
 *
 * It is not a secret and does not need to be: what makes the output unguessable is the
 * credential, which never leaves the authenticator. What this string does is scope the
 * derivation to eVault, so the same passkey used by another site's PRF yields unrelated
 * bytes.
 *
 * NEVER CHANGE IT. It is an input to the authenticator, so a different salt is a
 * different 32 bytes, and every wrapper already stored stops opening. The `-v1` is
 * there to make that visible rather than to invite a `-v2`.
 */
export const PRF_SALT = 'evault-passkey-prf-v1'

/**
 * The relying party this credential belongs to, in ONE place on purpose.
 *
 * A passkey is scoped to its RP ID and to nothing else, so a credential registered
 * under one hostname does not exist under another. THAT IS A PROBLEM THIS PROJECT
 * ALREADY HAS AND ADR-021 DID NOT LOOK AT: by ADR-015 the instance answers to two
 * names — `evault.local` on the local network and the tailnet's — so a passkey
 * registered through one of them will not unlock through the other.
 *
 * Deriving it from the current hostname is what a browser does when `rp.id` is omitted,
 * so this is today's behaviour written down rather than a choice. It is here, alone, so
 * that whoever decides what to do about it has a single line to change. See #578.
 */
function relyingPartyId(): string {
  return location.hostname
}

/**
 * The authenticator cannot do what this needs, and no retry will change that.
 *
 * Told apart from every other failure because what the user can do about it is
 * different: there is nothing to try again. Either the browser has no PRF — Firefox on
 * the desktop, an older Chrome — or the authenticator is one iOS refuses to pass
 * extension data to, which is every external security key.
 *
 * It is NOT the error for a cancelled dialog. Somebody who dismissed Face ID has not
 * hit a limitation, they changed their mind, and the interface has to keep quiet about
 * it. That case arrives as the platform's own `NotAllowedError` and travels through.
 */
export class PasskeyUnsupported extends Error {
  constructor(message = 'Este dispositivo no puede desbloquear la vault con un passkey') {
    super(message)
    this.name = 'PasskeyUnsupported'
  }
}

/** What the caller has to store after registering: the id, the hash and the wrapper. */
export interface RegisteredPasskey {
  /**
   * The credential's own id, as the authenticator returned it, in base64.
   *
   * Base64 and not base64url, unlike most WebAuthn examples. It is opaque to us — we
   * store it and hand it back to the browser — so the only thing that matters is that
   * the two directions agree, and the project already has these two conversions in
   * crypto.ts. Adding a third encoding to match a convention nobody here reads would
   * be a second place to get it wrong.
   */
  credentialId: string
  /** Derived from the PRF. What travels to the server to buy a token later. */
  authHash: string
  /** The vault key, wrapped so that only this passkey opens it. */
  wrappedKey: Encrypted
}

/**
 * What `navigator.credentials` hands back for the PRF extension.
 *
 * Declared here because the DOM types shipped with TypeScript do not describe this
 * extension yet, and the shape is small enough that guessing it wrong would be caught
 * by the first real run.
 */
interface PrfExtensionResults {
  prf?: {
    enabled?: boolean
    results?: { first?: ArrayBuffer }
  }
}

/** The PRF bytes out of a credential's extension results, or nothing. */
function prfBytesOf(credential: PublicKeyCredential): Uint8Array<ArrayBuffer> | undefined {
  const results = credential.getClientExtensionResults() as PrfExtensionResults
  const first = results.prf?.results?.first

  return first ? new Uint8Array(first) : undefined
}

/**
 * Whether the credential says the extension is available at all.
 *
 * SEPARATE FROM READING THE BYTES, and that is the whole reason this function exists.
 * `enabled: true` with no `results` is a documented outcome in Apple's own tooling, so
 * treating the flag as if it were the bytes would produce a derivation from
 * `undefined` — which is to say a wrapper nobody can ever open.
 */
function prfIsEnabled(credential: PublicKeyCredential): boolean {
  return (credential.getClientExtensionResults() as PrfExtensionResults).prf?.enabled === true
}

/**
 * The two options that are not configurable, gathered so there is one copy of them.
 *
 * `userVerification: 'required'` is what ADR-021 §2.4 rests on, as the file header
 * says. `residentKey: 'required'` is what lets a device that never registered the
 * credential find it anyway — the criterion that proves keeping the wrapper on the
 * server was the right call.
 */
const REQUIRED_SELECTION = {
  userVerification: 'required',
  residentKey: 'required',
} as const satisfies AuthenticatorSelectionCriteria

/**
 * Registers a passkey for this account and wraps the vault key with it.
 *
 * It takes the master key and the ordinary wrapper rather than the vault key, for the
 * reason `wrapVaultKeyForRecovery` already gives: the vault key is imported as not
 * extractable, so its material cannot be read back from outside crypto.ts. Opening the
 * wrapper that already exists is what keeps that guarantee intact.
 *
 * WHY IT MAY ASK FOR THE FINGER TWICE, which looks like a bug and is not. Some
 * authenticators return the PRF bytes straight from registration; others only say the
 * extension is enabled and hand over bytes on the next assertion. There is no way to
 * know which kind is in front of us without asking, so this asks for the bytes at
 * registration and falls back to one immediate assertion when they do not come. The
 * alternative — always doing two steps — would charge every device for the slowest one.
 *
 * Throws PasskeyUnsupported when no PRF is available, and lets the platform's own
 * errors through: a cancelled dialog is not a limitation.
 */
export async function registerPasskey(
  email: string,
  masterKey: CryptoKey,
  wrapped: Encrypted,
): Promise<RegisteredPasskey> {
  const credential = (await navigator.credentials.create({
    publicKey: {
      /*
       * Random, and nobody verifies it. By ADR-021 §2.4 the server never sees this
       * assertion, so the challenge has no one to prove anything to. It is here because
       * the API demands it, and it is random rather than constant so that nothing
       * downstream can start depending on a fixed value.
       */
      challenge: randomBytes(32),
      rp: { id: relyingPartyId(), name: 'eVault' },
      user: {
        /*
         * The email, and it is the one piece of this that is not opaque. Whoever holds
         * the device can list its passkeys and read it, which is true of every site
         * that uses them and worth knowing before deciding this is private.
         */
        id: new TextEncoder().encode(email),
        name: email,
        displayName: email,
      },
      // ES256 first and RS256 as a fallback, which is what every authenticator has.
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: REQUIRED_SELECTION,
      extensions: { prf: { eval: { first: toPrfSalt() } } },
    } as PublicKeyCredentialCreationOptions,
  })) as PublicKeyCredential | null

  if (!credential) throw new PasskeyUnsupported()
  if (!prfIsEnabled(credential) && !prfBytesOf(credential)) throw new PasskeyUnsupported()

  const credentialId = bytesToBase64(new Uint8Array(credential.rawId))
  const prf = prfBytesOf(credential) ?? (await assertForPrfBytes(credentialId))

  const { wrapKey, authHash } = await derivePasskeyKeys(prf, email)

  return {
    credentialId,
    authHash,
    wrappedKey: await rewrap(masterKey, wrapped, wrapKey),
  }
}

/**
 * Asks the authenticator for the PRF bytes of a credential we already know.
 *
 * The second half of the two-step case above. It names the credential explicitly
 * instead of letting the browser offer a choice, because at this point there is exactly
 * one right answer and a picker would invite the wrong one.
 */
async function assertForPrfBytes(credentialId: string): Promise<Uint8Array<ArrayBuffer>> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId: relyingPartyId(),
      allowCredentials: [{ type: 'public-key', id: base64ToBytes(credentialId) }],
      userVerification: REQUIRED_SELECTION.userVerification,
      extensions: { prf: { eval: { first: toPrfSalt() } } },
    } as PublicKeyCredentialRequestOptions,
  })) as PublicKeyCredential | null

  const prf = assertion ? prfBytesOf(assertion) : undefined

  if (!prf) throw new PasskeyUnsupported()

  return prf
}

/** The salt as bytes, which is what the extension takes. */
function toPrfSalt(): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(PRF_SALT)
}
