/**
 * The popup: unlock with the passkey (#671), then search the vault and copy (#672).
 *
 * IT HOLDS NOTHING BETWEEN OPENINGS. The key lives in the custody host and the popup
 * borrows it every time it opens — a popup is destroyed the moment it loses focus,
 * so anything kept here would be gone the next time it is looked at. The entries are
 * fetched and decrypted on each opening for the same reason, and never stored.
 *
 * EVERY TEXT GOES IN WITH textContent. Entry names come from imports of other managers'
 * files and are anything at all; ESLint forbids `innerHTML` in the extension so nobody
 * paints one as markup.
 */
import { SECONDS_UNTIL_CLEAR } from '@/lib/clipboard'
import { ACTIVITY_EVENTS, INACTIVITY_LIMIT_MS } from '@/lib/vault/autoLock'
import { unpack } from '@/lib/vault/payload'
import type { Item } from '@/lib/vault/types'
import { ApiFailure, listEncryptedItems } from './api'
import { copyFieldsOf, isSecret, textToCopy, type CopyField } from './copyText'
import { createCustody } from './custody/client'
import { writeClipboard } from './custody/sweeper'
import type { Held } from './custody/keeper'
import { canFill, select, siteHostOf } from './entries'
import { injectFill } from './fill/inject'
import { platform } from './platform'
import { copiedMessageFor, fillMessageFor, listMessageFor, messageFor, summaryFor } from './popupMessages'
import { UnlockFailed, unlock } from './unlock'

// The first origin is the one the extension talks to; the rest are other names of the
// same instance, only in host_permissions (src/instance.ts).
const INSTANCE = __INSTANCE_ORIGINS__[0]
// A persisted key, in English like every other one (#476). The email is not a secret: it
// is what the web's unlock screen remembers too.
const EMAIL_KEY = 'evault.email'
const BUTTON_LABELS: Record<CopyField, string> = { username: 'Usuario', password: 'Contraseña', code: 'Código' }

const custody = createCustody(platform.custodyHost)

/*
 * THIS PAGE IS ALSO THE UNLOCK TAB, in a browser whose popup cannot ask for the passkey
 * (ADR-025 §2.2): Firefox closes the popup the moment Windows Hello appears, and the
 * request dies with it. So there the popup opens this same page in a tab, marked with
 * `?unlock`, the tab unlocks and hands the key to the custody host, and closes itself.
 */
const IN_UNLOCK_TAB = new URLSearchParams(location.search).has('unlock')

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const views = { loading: element('loading'), locked: element('locked'), unlocked: element('unlocked') }
const emailField = element<HTMLInputElement>('email')
const unlockButton = element<HTMLButtonElement>('unlock')
const searchField = element<HTMLInputElement>('search')
const list = element<HTMLUListElement>('entries')

let items: Item[] = []
let siteHost: string | null = null

function show(view: keyof typeof views) {
  for (const [name, node] of Object.entries(views)) node.hidden = name !== view
}

function say(text: string | null) {
  element('message').textContent = text ?? ''
}

/**
 * The host of the tab the popup was opened over.
 *
 * `activeTab` is what gives the popup this URL, and only for the tab it was opened on, only
 * after the person clicked the icon. Without the permission `tab.url` is simply absent,
 * and the popup falls back to searching — nothing breaks, the site just is not first.
 */
async function openSiteHost(): Promise<string | null> {
  const tab = await platform.openTab()
  return siteHostOf(tab?.url)
}

function render() {
  const query = searchField.value
  const { rows, total, onThisSite } = select(items, query, siteHost)

  element('summary').textContent = summaryFor(total, rows.length, onThisSite, query.trim() !== '')
  list.replaceChildren(...rows.map(row))
}

function row(item: Item): HTMLLIElement {
  const li = document.createElement('li')
  const who = document.createElement('div')
  who.className = 'who'

  const name = document.createElement('p')
  name.textContent = item.content.name
  name.title = item.content.name
  who.append(name)

  if (item.content.username) {
    const username = document.createElement('p')
    username.className = 'muted'
    username.textContent = item.content.username
    who.append(username)
  }

  const actions = document.createElement('div')
  actions.className = 'actions'

  if (canFill(item, siteHost)) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'fill'
    button.textContent = 'Rellenar'
    button.setAttribute('aria-label', `Rellenar la página con ${item.content.name}`)
    button.addEventListener('click', () => void fill(item))
    actions.append(button)
  }

  for (const field of copyFieldsOf(item)) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = BUTTON_LABELS[field]
    button.setAttribute('aria-label', `Copiar ${BUTTON_LABELS[field].toLowerCase()} de ${item.content.name}`)
    button.addEventListener('click', () => void copy(item, field))
    actions.append(button)
  }

  li.append(who, actions)
  return li
}

/**
 * Fills the open tab with this entry, on the person's click and at no other moment
 * (ADR-023 §2.4). No content script exists: the code enters the page here, and in
 * src/fill/ is what keeps it out of frames, other hosts and plain http.
 */
async function fill(item: Item) {
  const tab = await platform.openTab()
  const outcome = tab?.id === undefined ? 'unreachable' : await injectFill(platform.scripting, tab.id, item)

  custody.touch()

  const message = fillMessageFor(outcome)
  if (message === null) {
    window.close()
    return
  }
  say(message)
}

async function copy(item: Item, field: CopyField) {
  // A code comes from a seed that may not parse; that and a refused copy say the same.
  const copied = await textToCopy(item, field).then(writeClipboard, () => false)

  if (!copied) {
    say('No se ha podido copiar.')
    return
  }

  if (isSecret(field)) custody.copied()
  say(copiedMessageFor(field, SECONDS_UNTIL_CLEAR))
}

async function loadEntries(held: Held) {
  element('summary').textContent = 'Descifrando…'
  list.replaceChildren()

  let encrypted
  try {
    encrypted = await listEncryptedItems(held.instance, held.token, held.vaultId)
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 401) {
      custody.forget('expired')
      say(listMessageFor('expired'))
      return
    }
    say(listMessageFor(error instanceof ApiFailure && error.isNetwork ? 'offline' : 'failed'))
    element('summary').textContent = ''
    return
  }

  items = await Promise.all(
    encrypted.map(async (entry) => ({
      id: entry.id,
      vaultId: entry.vault_id,
      content: await unpack(held.key, entry),
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
    })),
  )
  render()
}

async function showState() {
  const held = await custody.ask()

  if (held) {
    element('account').textContent = held.email
    show('unlocked')
    searchField.focus()
    siteHost = await openSiteHost()
    await loadEntries(held)
    return
  }

  items = []
  list.replaceChildren()
  element('summary').textContent = ''
  searchField.value = ''
  const remembered = await platform.storage.get(EMAIL_KEY)
  if (typeof remembered === 'string' && !emailField.value) emailField.value = remembered
  show('locked')
}

views.locked.addEventListener('submit', async (event) => {
  event.preventDefault()
  say(null)

  const email = emailField.value.trim()
  unlockButton.disabled = true

  if (platform.unlockIn === 'tab' && !IN_UNLOCK_TAB) {
    // The tab reads the email from where the popup remembers it, and starts on its own.
    await platform.storage.set(EMAIL_KEY, email)
    await platform.openUnlockTab()
    window.close()
    return
  }

  try {
    const held = await unlock(email, INSTANCE, platform.sessionClient)
    await custody.hold(held)
    await platform.storage.set(EMAIL_KEY, email)
    if (IN_UNLOCK_TAB) {
      // Done: the key is in the host, and the popup will find it the next time it opens.
      await platform.closeThisTab()
      return
    }
    await showState()
  } catch (error) {
    say(error instanceof UnlockFailed ? messageFor(error.problem) : messageFor('failed'))
  } finally {
    unlockButton.disabled = false
  }
})

searchField.addEventListener('input', render)

element('lock').addEventListener('click', async () => {
  custody.forget('manual')
  say(null)
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

/*
 * The unlock tab asks for the passkey as soon as it opens: the person already pressed
 * «Desbloquear» in the popup, and a second button for the same thing would be a step for
 * nothing. If the browser wants a gesture first, the request fails like a dismissed dialog
 * —which says nothing— and the button is right there.
 */
void showState().then(() => {
  if (IN_UNLOCK_TAB && !views.locked.hidden && emailField.value) (views.locked as HTMLFormElement).requestSubmit()
})
