import { api, interpretError } from '@/lib/api'

/**
 * The account's open sessions, against the API of #711. See ADR-018 §2.5.
 *
 * Next to `session.ts` and not inside `lib/vault`: this is about who is signed in to the
 * account, not about the vault's contents, and none of it goes near a key.
 */

/**
 * Which client a session belongs to, as the client said it when it signed in. `null` is a
 * token from before clients said it — the API does not guess, and neither does this.
 */
export type SessionClient = 'web' | 'extension' | 'recovery' | null

export interface OpenSession {
  id: number
  client: SessionClient
  created_at: string | null
  last_used_at: string | null
  expires_at: string | null
  /** The one this screen is using. Closing it here would be signing out. */
  current: boolean
}

export async function listSessions(): Promise<OpenSession[]> {
  try {
    const { data } = await api.get<{ data: OpenSession[] }>('/auth/sessions')

    return data.data
  } catch (error) {
    throw interpretError(error)
  }
}

export async function closeSession(id: number): Promise<void> {
  try {
    await api.delete(`/auth/sessions/${id}`)
  } catch (error) {
    throw interpretError(error)
  }
}

/** Closes every session but this one, and says how many it closed. */
export async function closeOtherSessions(): Promise<number> {
  try {
    const { data } = await api.delete<{ data: { closed: number } }>('/auth/sessions')

    return data.data.closed
  } catch (error) {
    throw interpretError(error)
  }
}
