/**
 * The popup: unlock with the passkey, see that the vault is open, lock it (#671).
 *
 * IT HOLDS NOTHING. The key, once unlocked, goes to the offscreen document and this page
 * asks for the state every time it opens — a popup is destroyed the moment it loses focus,
 * so anything kept here would be gone the next time it is looked at.
 */
import { ACTIVITY_EVENTS, INACTIVITY_LIMIT_MS } from '@/lib/vault/autoLock'
import { createCustody } from './custody/client'
import { messageFor } from './popupMessages'
import { UnlockFailed, unlock } from './unlock'

// The first origin is the one the extension talks to; the rest are other names of the
// same instance, only in host_permissions (src/instance.ts).
const INSTANCE = __INSTANCE_ORIGINS__[0]
// A persisted key, in English like every other one (#476). The email is not a secret: it
// is what the web's unlock screen remembers too.
const EMAIL_KEY = 'evault.email'

const custody = createCustody()

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const views = { loading: element('loading'), locked: element('locked'), unlocked: element('unlocked') }
const emailField = element<HTMLInputElement>('email')
const unlockButton = element<HTMLButtonElement>('unlock')

function show(view: keyof typeof views) {
  for (const [name, node] of Object.entries(views)) node.hidden = name !== view
}

function say(text: string | null) {
  element('message').textContent = text ?? ''
}

async function showState() {
  const held = await custody.ask()

  if (held) {
    element('account').textContent = held.email
    show('unlocked')
    return
  }

  const { [EMAIL_KEY]: remembered } = await chrome.storage.local.get(EMAIL_KEY)
  if (typeof remembered === 'string' && !emailField.value) emailField.value = remembered
  show('locked')
}

views.locked.addEventListener('submit', async (event) => {
  event.preventDefault()
  say(null)

  const email = emailField.value.trim()
  unlockButton.disabled = true

  try {
    const held = await unlock(email, INSTANCE)
    await custody.hold(held)
    await chrome.storage.local.set({ [EMAIL_KEY]: email })
    await showState()
  } catch (error) {
    say(error instanceof UnlockFailed ? messageFor(error.problem) : messageFor('failed'))
  } finally {
    unlockButton.disabled = false
  }
})

element('lock').addEventListener('click', async () => {
  custody.forget('manual')
  await showState()
})

custody.onForgotten((reason) => {
  if (reason === 'inactivity') say('Se ha bloqueado por no usarla.')
  if (reason === 'system-locked') say('Se ha bloqueado al bloquear el equipo.')
  void showState()
})

// Using the popup is activity, with the web's own definition of it.
for (const type of ACTIVITY_EVENTS) {
  document.addEventListener(type, () => {
    if (!views.unlocked.hidden) custody.touch()
  })
}

element('instance').textContent = INSTANCE
element('limit').textContent = String(INACTIVITY_LIMIT_MS / 60_000)
void showState()
