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
 * under one hostname does not exist under another. THIS INSTANCE ANSWERS TO TWO NAMES
 * by ADR-015 — one on the local network and the tailnet's — so a passkey registered
 * through one of them does not unlock through the other. ADR-021 did not look at that.
 *
 * IT STAYS AS THE CURRENT HOSTNAME, decided in #578, and the alternatives lost on
 * measurements rather than on taste:
 *
 * - Pinning it to one name would have to be configured, and configuring it means either
 *   baking a hostname into the build — which is what #296 removed so that one `dist/`
 *   serves from anywhere — or asking the server for it before unlocking, which adds a
 *   round trip to the one screen that has to work when the server is unreachable.
 * - Related Origin Requests is the feature made for exactly this, is supported
 *   everywhere that matters here (Chrome 128, Safari 18, Firefox 152), AND DOES NOT
 *   HELP: the browser fetches `https://{RP ID}/.well-known/webauthn`, so it has to
 *   reach the RP ID from wherever you came in. The two names are not reachable at the
 *   same time in precisely the cases that justify having two — off the local network
 *   one does not resolve, without the tailnet neither does the other. It works when it
 *   is not needed.
 *
 * WHAT PAYS FOR THE DECISION is that the two names do not cost the same. The local one
 * is served with Caddy's internal CA and needs that CA installed on every device; the
 * tailnet's carries Let's Encrypt and needs nothing, which is why ADR-015 chose it. A
 * device without the CA cannot open the application through the local name at all, so
 * for it there is only ever one name and none of this arises.
 *
 * The consequence is accepted and said out loud where it happens: coming in through the
 * other name, the passkey is not offered. That is consistent with ADR-021 — the master
 * password is the main way in and this is a shortcut — and a shortcut that does not
 * exist on the fallback path breaks nothing.
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
  /**
   * The hostname this credential was registered under, and therefore the only one it
   * unlocks through. See relyingPartyId.
   *
   * It is stored so the screen can say which name a passkey belongs to instead of
   * leaving somebody to work out why theirs stopped existing. Metadata in the clear,
   * of the same order as the label: the server can read it, and #578 accepts that for
   * the same reason ADR-021 §5.2 accepts the label.
   */
  rpId: string
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
    rpId: relyingPartyId(),
  }
}

/**
 * Asks the authenticator to verify the user and hand over the PRF bytes.
 *
 * WITH OR WITHOUT NAMING THE CREDENTIAL, and the difference is the whole reason there
 * is one function and not two. Finishing a registration knows exactly which credential
 * it wants, so it says so and no picker appears. Unlocking does not: on a device where
 * the passkey was synced but never registered there is no id to know, which is what
 * `residentKey: 'required'` bought and what makes the browser offer what it has.
 *
 * Everything else is identical, `userVerification` included, and that is what must not
 * drift: two copies of this would be two places for the guarantee of ADR-021 §2.4 to
 * quietly stop holding on one path.
 */
async function assertForPrfBytes(
  credentialId?: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId: relyingPartyId(),
      ...(credentialId
        ? { allowCredentials: [{ type: 'public-key', id: base64ToBytes(credentialId) }] }
        : {}),
      userVerification: REQUIRED_SELECTION.userVerification,
      extensions: { prf: { eval: { first: toPrfSalt() } } },
    } as PublicKeyCredentialRequestOptions,
  })) as PublicKeyCredential | null

  const prf = assertion ? prfBytesOf(assertion) : undefined

  if (!prf) throw new PasskeyUnsupported()

  return prf
}

/** What an assertion buys: the hash that travels and the key that opens. */
export interface PasskeyAssertion {
  /** Goes to the server in exchange for a token. */
  authHash: string
  /** Opens this account's passkey wrapper. Never leaves the device. */
  wrapKey: CryptoKey
}

/**
 * Verifies the user with a passkey and derives what unlocking needs.
 *
 * IT DOES NOT TALK TO THE SERVER AND IT DOES NOT TOUCH THE VAULT, which is what lets
 * the same function serve the two ways in: online it is followed by exchanging the hash
 * for a token and a wrapper, and offline — ADR-019 — by reading the wrapper this device
 * already has, with no request at all. Splitting it any other way would put the
 * biometric step on two code paths.
 *
 * The email is not asked of the user here: it is what the device already remembers, the
 * same value the cache is indexed by, and it is needed because it is the HKDF salt.
 *
 * Throws PasskeyUnsupported when there is no PRF, and lets a cancelled dialog through
 * as the platform's own error, exactly like registration.
 */
export async function assertPasskey(email: string): Promise<PasskeyAssertion> {
  return derivePasskeyKeys(await assertForPrfBytes(), email)
}

/** The salt as bytes, which is what the extension takes. */
function toPrfSalt(): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(PRF_SALT)
}
