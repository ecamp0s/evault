import { z } from 'zod'
import { ApiError, api, interpretError } from '@/lib/api'
import { useSession, type User } from '@/lib/session'
import { createVaultKey, deriveKeys } from '@/lib/vault/crypto'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import { VaultUnreachable, unlockVault, unlockVaultFromCache } from '@/lib/vault/unlock'
import { forgetCachedAccount } from '@/lib/vault/deviceCache'

/*
 * Client-side validation. It is the first half of the double guard: the second lives in
 * the API's Form Requests and application services, which do not trust this. It serves
 * to give an immediate answer, not to guarantee anything.
 *
 * The minimum of 8 characters matches RegisterRequest's on purpose: were it laxer, the
 * user would find out about the error after submitting the form.
 */
export const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'Escribe tu nombre').max(255, 'Máximo 255 caracteres'),
    email: z
      .string()
      .trim()
      .min(1, 'Escribe tu correo')
      .max(255, 'Máximo 255 caracteres')
      .email('Esto no parece un correo válido'),
    password: z.string().min(8, 'Mínimo 8 caracteres').max(255, 'Máximo 255 caracteres'),
    passwordConfirmation: z.string().min(1, 'Repite la contraseña'),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'Las contraseñas no coinciden',
    path: ['passwordConfirmation'],
  })

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Escribe tu correo'),
  password: z.string().min(1, 'Escribe tu contraseña'),
})

export type RegisterData = z.infer<typeof registerSchema>
export type LoginData = z.infer<typeof loginSchema>

interface AuthResponse {
  data: {
    user: User
    token: string
  }
}

/**
 * Signs the account up without the master password leaving the device.
 *
 * What happens here, in order, following ADR-008:
 *
 * 1. From the master password and the email are derived the master key, which stays,
 *    and the authentication hash, which is the only thing that travels.
 * 2. The key that will encrypt the vault's content is generated and wrapped with the
 *    master key.
 * 3. The sign-up is sent with the hash in the `password` field and the wrapped key
 *    separately.
 *
 * At no point is the master password sent. The request's `password` field keeps its
 * name because the API's contract does not change, but what it carries is no longer a
 * password.
 *
 * The password confirmation is not sent either: it is an interface check to avoid
 * typos, and the server neither needs nor validates it. It matters more here than it
 * used to, because a typo in the master password is no longer a recoverable access
 * problem.
 */
export async function signUp(data: RegisterData): Promise<void> {
  const { masterKey, authHash } = await deriveKeys(data.password, data.email)
  const { vaultKey, wrapped } = await createVaultKey(masterKey)

  try {
    const { data: body } = await api.post<AuthResponse>('/auth/register', {
      name: data.name,
      email: data.email,
      password: authHash,
      wrapped_key: wrapped.data,
      wrapped_key_iv: wrapped.iv,
    })

    useSession.getState().authenticate(body.data.user, body.data.token)

    /*
     * The key is stored after the sign-up has gone well, and not before. If the server
     * refuses the registration, leaving a live vault key in memory would be leaving
     * unlocked a vault that does not exist.
     */
    useVaultKey.getState().save(vaultKey)
  } catch (error) {
    throw interpretError(error)
  }
}

/**
 * Signs in and unlocks the vault. Two things, and in this order.
 *
 * First the authentication hash is derived from the master password, which is the only
 * thing that travels, and the session is requested with it. With the token in hand the
 * wrapped key is fetched from `GET /api/vaults` and opened with the master key, which
 * has not left here.
 *
 * The contract of `/api/auth/login` does not change: the hash travels in the `password`
 * field, which already existed and was already a string.
 *
 * **The session is published at the end, once it is complete**, and the token travels
 * explicitly until then. It may look like a detour and it is not: the session store is
 * what the guards watch, so leaving the token set before opening the vault fires the
 * navigation to the home page, unmounts this screen, and the unlock error is lost with
 * it. It looks like a form emptying itself without a word. It really happened, and it
 * was only seen by opening the browser.
 *
 * Publishing the whole session or not publishing it also avoids the intermediate state
 * of having a token and no key, which exists legitimately on reload — there it is the
 * vault locking, see ADR-007 — but which here would only be a half-done failure.
 */
export async function logIn(data: LoginData): Promise<void> {
  const { masterKey, authHash } = await deriveKeys(data.password, data.email)

  let session: AuthResponse['data']

  try {
    const { data: body } = await api.post<AuthResponse>('/auth/login', {
      email: data.email,
      password: authHash,
    })

    session = body.data
  } catch (error) {
    const failure = interpretError(error)

    /*
     * `isNetwork` is «no response arrived at all», which is the only thing that may fall
     * back to the cache. A 401 or a 429 DID reach the server and are answers, not
     * silence: falling back on those would turn a wrong password into an attempt at
     * opening the vault anyway, and a rate limit into a way around it.
     *
     * The cache is no way around anything — opening it needs the master key, which needs
     * the right password. But the distinction is made here, explicitly, because getting
     * it wrong would be invisible: everything would keep working.
     */
    if (failure.isNetwork) {
      await openFromCache(masterKey, data.email)

      return
    }

    throw failure
  }

  // If this throws, nothing has been touched: there is no session to undo and no token
  // to clear, and the caller only has to show the error.
  await unlockVault(masterKey, session.token)

  useSession.getState().authenticate(session.user, session.token)
}

/**
 * Opens the vault from this device when the server did not answer. See ADR-019.
 *
 * IF THERE IS NO COPY HERE, WHAT IS REPORTED IS THE LACK OF NETWORK AND NOT THE LACK OF
 * CACHE. Being told «this device has no copy of the vault» after typing a password with
 * the Wi-Fi off describes the least useful of the two facts: the copy is missing
 * BECAUSE nobody ever cached, and what has to be fixed is the connection.
 */
async function openFromCache(masterKey: CryptoKey, email: string): Promise<void> {
  const { rememberedUser } = useSession.getState()

  try {
    await unlockVaultFromCache(masterKey, email)
  } catch (error) {
    if (error instanceof VaultUnreachable) {
      throw new ApiError(null, {}, 'No hay conexión con el servidor y este dispositivo no guarda una copia de la vault')
    }

    throw error
  }

  /*
   * The name from what this browser remembered, if it is the same person. Falling back
   * to the email is not decoration: signing in offline from a device that cached under
   * another account has to greet somebody, and the email is the only true thing to hand.
   */
  const name = rememberedUser?.email === email ? rememberedUser.name : email

  useSession.getState().authenticateOffline({ name, email })
}

/**
 * Signs out, revoking the token on the server too.
 *
 * The local state is cleared whatever happens to the request. If the server does not
 * answer, leaving the session open in the browser would be the worse of the two
 * options: the user believes they have signed out and they have not. A token that
 * survives on the server is recoverable; a session the user believes closed and that is
 * still open on a shared computer is not.
 */
export async function logOut(): Promise<void> {
  // Read before anything is cleared: afterwards there is nobody left to name.
  const leaving = leavingAccount()

  try {
    await api.post('/auth/logout')
  } catch {
    // No retry and nothing propagated: the user is leaving anyway.
  } finally {
    useSession.getState().clearSession()

    /*
     * And the vault locks. Signing out while leaving the key alive in memory would be
     * worse than not signing out: the screen would say nobody is inside while the
     * material everything is decrypted with is still within reach of any script running
     * in the tab.
     */
    useVaultKey.getState().forget()

    /*
     * AND THE COPY ON THIS DEVICE GOES WITH IT, which locking deliberately does NOT do.
     * That difference is the whole of `ADR-007` applied to `ADR-019`: reloading is a lock
     * and has to leave the vault readable without a network, while signing out is «I am
     * done on this machine» — and leaving an encrypted vault behind on a computer whose
     * user believes they left is the failure this clears.
     *
     * ONLY THIS ACCOUNT'S. The other one on this instance may be using the same browser,
     * and its copy is not this session's to remove.
     */
    if (leaving) await forgetCachedAccount(leaving)
  }
}

/**
 * Whoever is leaving, by the only name this browser reliably has.
 *
 * `user` is null in an offline session — the server never answered — so `rememberedUser`
 * is what remains. Reading only the first would quietly skip clearing the cache in
 * exactly the case where the cache is the whole point.
 */
function leavingAccount(): string | undefined {
  const { user, rememberedUser } = useSession.getState()

  return user?.email ?? rememberedUser?.email
}

/**
 * Removes this account from this browser: the remembered email, the key, and the copy.
 *
 * It exists so that «olvidar esta cuenta en este dispositivo» goes through the same door
 * as signing out. Calling the store's `forgetUser` straight from the screen would forget
 * the email and leave the encrypted vault sitting there — which is the opposite of what
 * the button says, and nothing would have failed.
 */
export async function forgetAccountOnThisDevice(): Promise<void> {
  const leaving = leavingAccount()

  useSession.getState().forgetUser()
  useVaultKey.getState().forget()

  if (leaving) await forgetCachedAccount(leaving)
}

/**
 * Unlocks the vault of whoever is already remembered in this browser.
 *
 * It is `entrar` without the email field: the user is still the same and the only thing
 * missing is the master password. That it does a full login underneath is an
 * implementation detail and not something the interface should tell: to the user, what
 * happens is that their vault opens.
 *
 * It replaces the old `hidratarSesion`, which verified against `/auth/me` the token
 * recovered from localStorage. There is no token to recover any more, so there is
 * nothing to verify: on startup, either it unlocks or there is no session.
 */
export async function unlock(masterPassword: string): Promise<void> {
  const { rememberedUser } = useSession.getState()

  if (!rememberedUser) {
    /*
     * It should not happen: the unlock screen is only shown when there is a remembered
     * user. If it does, an error beats trying to sign in with an empty email and getting
     * a «wrong credentials» that would mislead.
     */
    throw new Error('No hay ninguna cuenta recordada en este navegador')
  }

  return logIn({ email: rememberedUser.email, password: masterPassword })
}
