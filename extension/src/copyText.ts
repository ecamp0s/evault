import { parseTotp, totpCode } from '@/lib/vault/totp'
import type { Item } from '@/lib/vault/types'

/**
 * What each copy button of a row copies.
 *
 * The code is generated at the moment of copying, with the web's own TOTP, and not shown:
 * a six-digit code is useless half a minute later, and painting a countdown in a popup
 * that closes on the next click would be a screen nobody gets to read.
 */
export type CopyField = 'username' | 'password' | 'code'

/** Which buttons a row gets. A button that would copy nothing is not painted. */
export function copyFieldsOf(item: Item): CopyField[] {
  const { username, password, totp } = item.content
  return [
    ...(username ? (['username'] as const) : []),
    ...(password ? (['password'] as const) : []),
    ...(totp ? (['code'] as const) : []),
  ]
}

/**
 * Whether copying this field has to be cleared from the clipboard afterwards.
 *
 * The username is not a secret, which is the web's rule too (`copyToClipboard`'s second
 * argument): clearing it would wipe whatever the person copied next for no gain.
 */
export function isSecret(field: CopyField): boolean {
  return field !== 'username'
}

export async function textToCopy(item: Item, field: CopyField, nowMs = Date.now()): Promise<string> {
  const { username = '', password = '', totp = '' } = item.content

  if (field === 'username') return username
  if (field === 'password') return password

  return totpCode(parseTotp(totp), nowMs)
}
