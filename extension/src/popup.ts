/**
 * The popup, as a skeleton: it says which instance this build talks to and whether the
 * browser can use a passkey at all. Unlocking arrives in #671.
 *
 * It imports from web/src/lib/vault ALREADY, and that is the point of the skeleton: the
 * shared code has to compile and bundle here from the first commit, so the day it
 * stops doing so is a red build and not a surprise in the issue that needs it.
 */
import { isPasskeySupported } from '@/lib/vault/passkey'

function show(id: string, text: string) {
  const element = document.getElementById(id)
  if (element) element.textContent = text
}

show('instance', __INSTANCE_ORIGINS__.join(' · '))
show(
  'passkeys',
  isPasskeySupported()
    ? 'Sí. Queda comprobar que dé PRF, y eso solo se sabe al pedirlo.'
    : 'No: este navegador no puede usar passkeys.',
)
show('status', 'Todavía no se puede desbloquear desde aquí.')
