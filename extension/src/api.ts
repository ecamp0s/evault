/**
 * The three requests the extension makes, over `fetch`.
 *
 * NOT web/src/lib/api.ts, and not by taste: that one is axios with the SPA's session store
 * and clock-skew tracking wired in, which is the web's shape around the requests and not
 * the requests. The extension needs to tell exactly the same things apart, and this file
 * is where it does.
 *
 * No CORS is involved: #665 measured that the extension reads these responses with no
 * `Access-Control-*` header, because `host_permissions` exempts it (ADR-023 §7).
 */

/** Why a request failed, told apart the way ADR-019 tells silence from an answer. */
export class ApiFailure extends Error {
  /** The HTTP status, when an answer arrived. */
  readonly status: number | null
  /**
   * NO answer arrived at all. The only case that means «no network»: a 401 or a 429 did
   * reach the server, and reading them as a connection problem would hide a revoked
   * passkey or a rate limit behind a wrong excuse.
   */
  readonly isNetwork: boolean

  constructor(message: string, status: number | null, isNetwork: boolean) {
    super(message)
    this.name = 'ApiFailure'
    this.status = status
    this.isNetwork = isNetwork
  }
}

/** What unlocking with a passkey hands back. The shape the web reads as well. */
export interface PasskeySession {
  token: string
  vaultId: string
  wrapped: { data: string; iv: string }
}

async function send(url: string, init: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers },
    })
  } catch {
    // fetch rejects only when nothing came back: no network, DNS, the instance down.
    throw new ApiFailure('no answer from the instance', null, true)
  }

  if (!response.ok) {
    throw new ApiFailure(`the instance answered ${response.status}`, response.status, false)
  }

  return response
}

/**
 * Exchanges the passkey's authentication hash for a token and the wrapper (ADR-021 §2.4).
 *
 * The response is checked field by field because the next step feeds it to AES-GCM: a
 * missing field would otherwise surface as a decryption error, and read as «this passkey
 * does not open this vault» when it was the instance answering something else.
 */
export async function unlockWithPasskeyHash(
  instance: string,
  email: string,
  authHash: string,
): Promise<PasskeySession> {
  const response = await send(`${instance}/api/auth/passkey`, {
    method: 'POST',
    body: JSON.stringify({ email, auth_hash: authHash }),
  })

  const body: unknown = await response.json().catch(() => null)
  const data = (body as { data?: Record<string, unknown> } | null)?.data
  const fields = ['token', 'vault_id', 'wrapped_key', 'wrapped_key_iv'] as const

  if (!data || fields.some((field) => typeof data[field] !== 'string' || data[field] === '')) {
    throw new ApiFailure('the instance answered without a session', response.status, false)
  }

  return {
    token: data.token as string,
    vaultId: data.vault_id as string,
    wrapped: { data: data.wrapped_key as string, iv: data.wrapped_key_iv as string },
  }
}

/**
 * Revokes the token, which is what locking does to it (ADR-023 §2.3).
 *
 * BEST EFFORT, and said where it is called: if it fails the token is orphaned, as a web
 * token is when a browser closes, until the expiry of ADR-018 §2.5 exists. It never
 * throws, because a lock that fails half-way would keep the key it was asked to forget.
 */
export async function revokeToken(instance: string, token: string): Promise<boolean> {
  try {
    await send(`${instance}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    return true
  } catch {
    return false
  }
}
