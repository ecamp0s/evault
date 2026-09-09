import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import { api } from '@/lib/api'
import { decrypt } from '@/lib/vault/crypto'
import { unlockForTest, encryptedItem } from '@/test/vault'
import type { Item, EncryptedItem } from '@/lib/vault/types'
import { useUnsavedWork, hasUnsavedWork } from '@/lib/vault/unsavedWork'
import { ItemDialog } from './ItemDialog'

const VAULT_ID = 'vault-1'

const ITEM: Item = {
  id: 'item-1',
  vaultId: VAULT_ID,
  content: {
    name: 'GitHub',
    username: 'ada@example.com',
    password: 'la-de-siempre',
    url: 'https://github.com',
    notes: 'cuenta personal',
  },
  createdAt: null,
  updatedAt: null,
}

/*
 * Since encryption became real, the item the API returns has to be really encrypted:
 * the data layer decrypts it on receiving it, and a plaintext fixture would show up as
 * unreadable.
 */
let key: CryptoKey

async function itemResponse(): Promise<{ data: { data: { item: EncryptedItem } } }> {
  return { data: { data: { item: await encryptedItem(key, 'item-1', { name: 'GitHub' }, VAULT_ID) } } }
}

function apiError(httpStatus: number): AxiosError {
  const error = new AxiosError('Request failed')
  const headers = new AxiosHeaders()

  error.response = { status: httpStatus, statusText: '', data: {}, headers, config: { headers } }

  return error
}

function renderPage(item: Item | null = null, onClose = vi.fn(), tagsInUse: string[] = []) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ItemDialog vaultId={VAULT_ID} item={item} tagsInUse={tagsInUse} onClose={onClose} />
    </QueryClientProvider>,
  )

  return { ...utils, onClose }
}

beforeEach(async () => {
  vi.restoreAllMocks()
  useUnsavedWork.setState({ count: 0 })
  key = await unlockForTest()
})

describe('creating', () => {
  it('saves a new entry with what was typed', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(await itemResponse())
    const { onClose } = renderPage()

    await userEvent.type(screen.getByLabelText('Nombre'), 'GitHub')
    await userEvent.type(screen.getByLabelText('Usuario'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secretísima')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    /*
     * It waits for `onClose`, which is the LAST thing in the chain, and only then checks
     * the `post`. The other way round — waiting for the post and asserting the close
     * afterwards — the test depends on the mutation's success callback arriving in time,
     * and that is not guaranteed: it failed in the CI of PR #185, after eight green runs
     * in a row locally. See issue #186.
     */
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(post).toHaveBeenCalled()
  })

  /*
   * The criterion that matters most: no field of the entry may leave outside the blob.
   * If somebody ever adds a loose field to the request body, this test stops them.
   */
  it('sends no field in the clear outside the blob', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(await itemResponse())
    renderPage()

    await userEvent.type(screen.getByLabelText('Nombre'), 'GitHub')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secretísima')
    await userEvent.type(screen.getByLabelText('URL'), 'github.com')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(post).toHaveBeenCalled())

    const [url, body] = post.mock.calls[0]

    expect(url).toBe(`/vaults/${VAULT_ID}/items`)
    expect(Object.keys(body as object)).toEqual(['ciphertext', 'iv', 'version'])

    const serialized = JSON.stringify(body)

    expect(serialized).not.toContain('GitHub')
    expect(serialized).not.toContain('secretísima')
    expect(serialized).not.toContain('github.com')
  })

  it('does not allow submitting with no name', async () => {
    const post = vi.spyOn(api, 'post')
    renderPage()

    await userEvent.type(screen.getByLabelText('Usuario'), 'ada@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Escribe un nombre')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('omits from the blob the fields that were not filled in', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(await itemResponse())
    renderPage()

    await userEvent.type(screen.getByLabelText('Nombre'), 'Solo el nombre')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(post).toHaveBeenCalled())

    const body = post.mock.calls[0][1] as { ciphertext: string; iv: string }
    const content: unknown = JSON.parse(
      await decrypt(key, { data: body.ciphertext, iv: body.iv }),
    )

    expect(content).toEqual({ name: 'Solo el nombre' })
  })

  /*
   * The tags, and what is checked is the blob that leaves.
   *
   * Adding one is not a keystroke in a text field: it is an entry in an array that has
   * to survive being serialised, encrypted and sent. Checking the chip on screen would
   * pass even if nothing were stored.
   */
  it('stores in the blob a tag added with Enter', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(await itemResponse())
    renderPage()

    await userEvent.type(screen.getByLabelText('Nombre'), 'Banco')
    await userEvent.type(screen.getByLabelText('Etiquetas'), 'Trabajo{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(post).toHaveBeenCalled())

    const body = post.mock.calls[0][1] as { ciphertext: string; iv: string }
    const content: unknown = JSON.parse(await decrypt(key, { data: body.ciphertext, iv: body.iv }))

    expect(content).toEqual({ name: 'Banco', tags: ['Trabajo'] })
  })

  /*
   * Enter inside a form submits it. Without the editor stopping that, adding a tag
   * would save the entry and close the dialog, which is the opposite of what the person
   * meant.
   */
  it('adding a tag with Enter does not save the entry', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(await itemResponse())
    renderPage()

    await userEvent.type(screen.getByLabelText('Nombre'), 'Banco')
    await userEvent.type(screen.getByLabelText('Etiquetas'), 'Trabajo{Enter}')

    expect(post).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Quitar la etiqueta Trabajo' })).toBeInTheDocument()
  })

  it('leaves the tags out of the blob when none was added', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(await itemResponse())
    renderPage()

    await userEvent.type(screen.getByLabelText('Nombre'), 'Sin etiquetas')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(post).toHaveBeenCalled())

    const body = post.mock.calls[0][1] as { ciphertext: string; iv: string }
    const content = JSON.parse(await decrypt(key, { data: body.ciphertext, iv: body.iv })) as object

    expect('tags' in content).toBe(false)
  })

  /*
   * Suggesting is what keeps tags worth having: two spellings of the same idea are two
   * groups of one entry each, and nothing in the interface would say so.
   */
  it('offers the tags the vault already uses', async () => {
    renderPage(null, vi.fn(), ['Trabajo', 'Banco'])

    await userEvent.click(screen.getByRole('button', { name: 'Trabajo' }))

    expect(screen.getByRole('button', { name: 'Quitar la etiqueta Trabajo' })).toBeInTheDocument()
  })

  it('does not offer a tag the entry already carries', async () => {
    renderPage(null, vi.fn(), ['Trabajo'])

    await userEvent.click(screen.getByRole('button', { name: 'Trabajo' }))

    expect(screen.queryByRole('button', { name: 'Trabajo' })).not.toBeInTheDocument()
  })

  it('does not create a second tag for a different spelling of one in use', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(await itemResponse())
    renderPage(null, vi.fn(), ['Trabajo'])

    await userEvent.type(screen.getByLabelText('Nombre'), 'Banco')
    await userEvent.click(screen.getByRole('button', { name: 'Trabajo' }))
    await userEvent.type(screen.getByLabelText('Etiquetas'), 'trabajo{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(post).toHaveBeenCalled())

    const body = post.mock.calls[0][1] as { ciphertext: string; iv: string }
    const content: unknown = JSON.parse(await decrypt(key, { data: body.ciphertext, iv: body.iv }))

    expect(content).toEqual({ name: 'Banco', tags: ['Trabajo'] })
  })

  /*
   * The reverse of the test above, and the one that gives the whole iteration its
   * point. Until issue #59 the content was read with an atob and no key at all: anybody
   * with access to the request or to the database saw the passwords. This fails if that
   * becomes possible again.
   */
  it('what goes out to the API cannot be read without the key', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(await itemResponse())
    renderPage()

    await userEvent.type(screen.getByLabelText('Nombre'), 'GitHub')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'la-contraseña-secreta')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(post).toHaveBeenCalled())

    const body = post.mock.calls[0][1] as { ciphertext: string; iv: string; version: number }

    // Neither the name nor the password appears in what travels.
    expect(JSON.stringify(body)).not.toContain('GitHub')
    expect(JSON.stringify(body)).not.toContain('la-contraseña-secreta')

    // And decoding the base64 no longer returns anything readable.
    expect(atob(body.ciphertext)).not.toContain('GitHub')
    expect(() => JSON.parse(atob(body.ciphertext))).toThrow()

    expect(body.version).toBe(2)
  })
})

describe('editing', () => {
  it('preloads the current values', () => {
    renderPage(ITEM)

    expect(screen.getByLabelText('Nombre')).toHaveValue('GitHub')
    expect(screen.getByLabelText('Usuario')).toHaveValue('ada@example.com')
    expect(screen.getByLabelText('Contraseña')).toHaveValue('la-de-siempre')
    expect(screen.getByLabelText('URL')).toHaveValue('https://github.com')
    expect(screen.getByLabelText('Notas')).toHaveValue('cuenta personal')
  })

  it('updates against the item\'s identifier, which does not change', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue(await itemResponse())
    renderPage(ITEM)

    await userEvent.clear(screen.getByLabelText('Nombre'))
    await userEvent.type(screen.getByLabelText('Nombre'), 'GitHub del trabajo')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(patch).toHaveBeenCalled())
    expect(patch.mock.calls[0][0]).toBe(`/vaults/${VAULT_ID}/items/item-1`)
  })
})

describe('the password', () => {
  it('starts hidden and can be revealed', async () => {
    renderPage(ITEM)

    const field = screen.getByLabelText('Contraseña')

    expect(field).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar la contraseña' }))

    expect(field).toHaveAttribute('type', 'text')

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar la contraseña' }))

    expect(field).toHaveAttribute('type', 'password')
  })
})

describe('errors', () => {
  /*
   * An explicit criterion of the issue. Losing a freshly typed password over a network
   * failure would be among the most annoying things this screen can do.
   */
  it('an API error does not wipe what was typed', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(apiError(500))
    const { onClose } = renderPage()

    await userEvent.type(screen.getByLabelText('Nombre'), 'GitHub')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secretísima')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('GitHub')
    expect(screen.getByLabelText('Contraseña')).toHaveValue('secretísima')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('tells a network failure from a server error', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new AxiosError('Network Error'))
    renderPage()

    await userEvent.type(screen.getByLabelText('Nombre'), 'GitHub')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No hemos podido conectar')
  })
})

describe('unsaved changes', () => {
  it('warns before closing when there are changes', async () => {
    const { onClose } = renderPage()

    await userEvent.type(screen.getByLabelText('Nombre'), 'a medias')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.getByText('Tienes cambios sin guardar')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('carrying on editing returns to the form with what was typed intact', async () => {
    renderPage()

    await userEvent.type(screen.getByLabelText('Nombre'), 'a medias')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Seguir editando' }))

    expect(screen.getByLabelText('Nombre')).toHaveValue('a medias')
  })

  it('discarding really closes', async () => {
    const { onClose } = renderPage()

    await userEvent.type(screen.getByLabelText('Nombre'), 'a medias')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }))

    expect(onClose).toHaveBeenCalled()
  })

  it('with no changes it closes straight away, without asking', async () => {
    const { onClose } = renderPage(ITEM)

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByText('Tienes cambios sin guardar')).not.toBeInTheDocument()
    expect(onClose).toHaveBeenCalled()
  })
})

describe('what auto-lock would throw away', () => {
  /*
   * WHY THE DIALOG DECLARES IT — #303. Auto-lock discards what is typed here without
   * asking, which is right, and its warning could not say so because nothing outside
   * this component knew there was anything to lose. Declaring it out of `isDirty`
   * keeps one source of truth: the same flag already guards every exit below.
   */

  it('declares nothing while the form is untouched', () => {
    renderPage()

    expect(hasUnsavedWork()).toBe(false)
  })

  it('declares unsaved work as soon as something is typed', async () => {
    renderPage()

    await userEvent.type(screen.getByLabelText('Nombre'), 'a medias')

    expect(hasUnsavedWork()).toBe(true)
  })

  it('stops declaring it when the dialog goes away', async () => {
    /*
     * Unmounting is the case that matters, and not closing: locking navigates away,
     * so this component never gets to run its own exit path.
     */
    const { unmount } = renderPage()

    await userEvent.type(screen.getByLabelText('Nombre'), 'a medias')
    unmount()

    expect(hasUnsavedWork()).toBe(false)
  })
})

/**
 * THE DIALOG HAS TO BE ABLE TO SCROLL ON ITS OWN. See #437.
 *
 * It is centred with `-translate-y-1/2` and Base UI locks the body's scroll while it is
 * open, so a dialog taller than the viewport spills equally above and below with no way
 * to reach either end. On a phone that means the save button cannot be pressed at all —
 * found using the real vault from an iPhone while verifying #412.
 *
 * WHAT THIS TEST CAN AND CANNOT DO, and it is written here rather than assumed: jsdom
 * applies no CSS and does no layout, so it cannot see a height, an overflow or a button
 * out of reach. It checks the DECLARATION and nothing more. What actually measured the
 * bug and the fix was a browser at a phone's viewport height: 844px of dialog in 664px
 * of window, `top: -90`, and afterwards 632px with the save button reachable by
 * scrolling inside.
 */
describe('the dialog fits on a small screen', () => {
  it('declares a maximum height and its own scroll', () => {
    renderPage()

    const dialog = screen.getByRole('dialog')

    expect(dialog.className).toMatch(/max-h-\[calc\(100dvh/)
    expect(dialog.className).toContain('overflow-y-auto')
  })

  /*
   * `dvh` and not `vh`, which only matters on the device that has the problem: on iOS
   * Safari the address bar grows and shrinks as you scroll, and `vh` is pinned to the
   * LARGE viewport — the one with the bar collapsed. Sized with `vh`, the dialog is
   * still taller than what can be seen the moment it opens, which is when the buttons
   * are needed.
   */
  it('measures against the small viewport, which is the one a phone shows first', () => {
    renderPage()

    expect(screen.getByRole('dialog').className).not.toMatch(/max-h-\[calc\(100vh/)
  })
})

describe('the kind of entry', () => {
  /** The blob that actually left, decrypted. Checking the screen would prove nothing. */
  async function sentContent(post: ReturnType<typeof vi.spyOn>): Promise<unknown> {
    const body = post.mock.calls[0][1] as { ciphertext: string; iv: string }

    return JSON.parse(await decrypt(key, { data: body.ciphertext, iv: body.iv }))
  }

  async function createWith(choice: string): Promise<unknown> {
    const post = vi.spyOn(api, 'post').mockResolvedValue(await itemResponse())

    renderPage()

    if (choice !== 'Inicio de sesión') {
      await userEvent.click(screen.getByRole('radio', { name: choice }))
    }

    await userEvent.type(screen.getByLabelText('Nombre'), 'Lo nuevo')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(post).toHaveBeenCalled())

    return sentContent(post)
  }

  /*
   * CREATING A LOGIN COSTS NOTHING EXTRA, which is the constraint the chooser had to
   * respect: 370 of the 370 entries in the real vault are logins, so putting a question
   * in front of the commonest action charges everybody for what almost nobody does. It
   * arrives already chosen, and the test types a name and saves without touching it.
   */
  it('creates a login without anybody choosing anything', async () => {
    expect(await createWith('Inicio de sesión')).toEqual({ name: 'Lo nuevo' })
  })

  /*
   * AND IT WRITES NO `type`, which is the same assertion read the other way and the one
   * that keeps the 370 existing entries out of any migration: a login is an entry with
   * the key ABSENT, not one saying «login». See ADR-020 §4.
   */
  it('writes no type for a login, because absence is what a login is', async () => {
    expect(await createWith('Inicio de sesión')).not.toHaveProperty('type')
  })

  it.each([
    ['Tarjeta', 'card'],
    ['Nota', 'note'],
  ])('writes the type when %s is chosen', async (label, stored) => {
    expect(await createWith(label)).toEqual({ name: 'Lo nuevo', type: stored })
  })

  /*
   * The type is fixed at creation, so editing must not offer it. The title is what says
   * which kind it is instead, and between the two there is nothing to click.
   */
  it('does not offer to change the type of an entry that already exists', () => {
    renderPage(ITEM)

    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('says in the title which kind is being edited', () => {
    renderPage({ ...ITEM, content: { ...ITEM.content, type: 'card' } })

    expect(screen.getByRole('heading', { name: 'Editar tarjeta' })).toBeInTheDocument()
  })
})

describe('the fields of a card', () => {
  /** Opens the dialog on a new card, which is what all of these start from. */
  async function newCard() {
    renderPage()

    await userEvent.click(screen.getByRole('radio', { name: 'Tarjeta' }))
  }

  it('shows the five a card has, in the order they are printed', async () => {
    await newCard()

    const labels = ['Número', 'Titular', 'Caducidad', 'Código de seguridad', 'PIN']

    for (const label of labels) {
      expect(screen.getByLabelText(label), `falta «${label}»`).toBeInTheDocument()
    }
  })

  /*
   * A card has no username, no password and no URL, and no second factor either.
   * Leaving them on screen would invite filling in a login's fields on a card, and
   * `toContent` would store exactly what was typed.
   */
  it.each(['Usuario', 'Contraseña', 'URL', 'Verificación en dos pasos'])(
    'does not show «%s», which belongs to a login',
    async (label) => {
      await newCard()

      expect(screen.queryByLabelText(label)).not.toBeInTheDocument()
    },
  )

  /*
   * Nothing about a card is chosen by whoever types it in: it is read off a piece of
   * plastic somebody else issued.
   */
  it('offers no password generator', async () => {
    await newCard()

    expect(screen.queryByRole('button', { name: 'Generar una contraseña' })).not.toBeInTheDocument()
  })

  /*
   * WHERE THE LINE IS DRAWN, which is what #534 decided and is the part worth a test:
   * hidden is what ALONE completes a payment or opens a cash machine, and the number —
   * which merely identifies the card, and is the one field you need to READ rather than
   * copy — opens readable.
   *
   * The three are still secrets in every other sense, and those guarantees are tested
   * where they live: not painted in the list (ItemList), not searched (search), copied
   * with the clipboard cleared (copy).
   */
  it('opens the number readable and keeps the code and the PIN hidden', async () => {
    await newCard()

    expect(screen.getByLabelText('Número')).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText('Código de seguridad')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('PIN')).toHaveAttribute('type', 'password')
  })

  it.each([
    ['Número', 'el número'],
    ['Código de seguridad', 'el código de seguridad'],
    ['PIN', 'el PIN'],
  ])('lets «%s» be hidden and shown either way', async (label, subject) => {
    await newCard()

    const before = screen.getByLabelText(label).getAttribute('type')
    const action = before === 'password' ? 'Mostrar' : 'Ocultar'

    await userEvent.click(screen.getByRole('button', { name: `${action} ${subject}` }))

    expect(screen.getByLabelText(label)).not.toHaveAttribute('type', before)
  })

  /*
   * THE MASK, AND WHAT IT MAY NOT DO. `ADR-020` §6 forbids refusing what somebody has
   * printed on the card in their hand; writing a separator while digits are typed
   * refuses nothing, and the second case here is the one that proves it.
   */
  it('writes the slash of the expiry while digits are typed', async () => {
    await newCard()

    await userEvent.type(screen.getByLabelText('Caducidad'), '0924')

    expect(screen.getByLabelText('Caducidad')).toHaveValue('09/24')
  })

  /*
   * ADR-020 §6 AS A TEST: what somebody writes is what gets stored, whatever shape it
   * has. This is the assertion that separates a mask from a validation.
   *
   * THE INPUT MATTERS AND WAS CHOSEN AFTER FAILING TO CHOOSE IT. The first version typed
   * «09/2024» and proved nothing: typed one key at a time, a mask that strips every
   * non-digit ALSO ends up at «09/2024», so the test passed with the property and
   * without it. A value that is not a date at all is what tells the two apart — the
   * greedy version turns it into «20/29».
   */
  it.each([['mayo 2029'], ['09-2024'], ['caduca pronto']])(
    'stores «%s» exactly as it was written',
    async (written) => {
      await newCard()

      await userEvent.type(screen.getByLabelText('Caducidad'), written)

      expect(screen.getByLabelText('Caducidad')).toHaveValue(written)
    },
  )

  it('leaves a pasted date alone', async () => {
    await newCard()

    const field = screen.getByLabelText('Caducidad')

    field.focus()
    await userEvent.paste('09/2024')

    expect(field).toHaveValue('09/2024')
  })

  /*
   * Deleting into a formatted date leaves a value with a slash in it, so nothing puts
   * the slash back and fights the deletion. It is the case a mask usually gets wrong.
   */
  it('does not fight a backspace', async () => {
    await newCard()

    const field = screen.getByLabelText('Caducidad')

    await userEvent.type(field, '0924')
    await userEvent.type(field, '{backspace}{backspace}')

    expect(field).toHaveValue('09/')
  })

  /*
   * `inputMode` and not `type="number"`: the numeric keypad on a phone without the
   * silent refusal that a number input brings, which would be ADR-020 §6 broken by the
   * choice of an input type.
   */
  it.each(['Número', 'Caducidad', 'Código de seguridad', 'PIN'])(
    'asks for the numeric keypad on «%s»',
    async (label) => {
      await newCard()

      expect(screen.getByLabelText(label)).toHaveAttribute('inputmode', 'numeric')
    },
  )

  /*
   * THE CASE THE WHOLE ITERATION TURNS ON, end to end and not at the schema: an American
   * Express security code is FOUR digits, and a field bounded at three would keep the
   * first three and say nothing. The card that no longer works is discovered at the
   * checkout.
   *
   * It checks the blob that actually left, because a value correct on screen and
   * truncated on the way out looks identical from the outside.
   */
  it('stores a four-digit security code whole, and a fifteen-digit number', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(await itemResponse())

    await newCard()

    await userEvent.type(screen.getByLabelText('Nombre'), 'Amex')
    await userEvent.type(screen.getByLabelText('Número'), '378282246310005')
    await userEvent.type(screen.getByLabelText('Código de seguridad'), '1234')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(post).toHaveBeenCalled())

    const body = post.mock.calls[0][1] as { ciphertext: string; iv: string }
    const content: unknown = JSON.parse(await decrypt(key, { data: body.ciphertext, iv: body.iv }))

    expect(content).toEqual({
      name: 'Amex',
      type: 'card',
      number: '378282246310005',
      csc: '1234',
    })
  })
})

describe('the fields of a note', () => {
  async function newNote() {
    renderPage()

    await userEvent.click(screen.getByRole('radio', { name: 'Nota' }))
  }

  /*
   * A note is a name and a body. Everything else on this screen belongs to something
   * else, and an empty field on screen is an invitation to fill it in.
   */
  it.each([
    'Usuario',
    'Contraseña',
    'URL',
    'Verificación en dos pasos',
    'Número',
    'Titular',
    'Caducidad',
    'Código de seguridad',
    'PIN',
  ])('does not show «%s»', async (label) => {
    await newNote()

    expect(screen.queryByLabelText(label)).not.toBeInTheDocument()
  })

  it('shows the name, the body and the tags, and that is all', async () => {
    await newNote()

    expect(screen.getByLabelText('Nombre')).toBeInTheDocument()
    expect(screen.getByLabelText('Notas')).toBeInTheDocument()
    expect(screen.getByLabelText('Etiquetas')).toBeInTheDocument()
  })

  /*
   * On a note the body IS the entry, so it opens with the room to be one.
   *
   * IT CHECKS THE MINIMUM HEIGHT AND NOT `rows`, and the first version of this test
   * checked `rows` and was worthless: `Textarea` carries `field-sizing-content`, so the
   * browser sizes the box to its content and ignores the attribute. Measured in a real
   * browser, `rows={12}` left the field 90 px tall — the test went green over a change
   * that did nothing at all.
   *
   * A class name is a proxy for a height, which jsdom cannot compute; it is the same
   * proxy the dialog's own viewport tests use, and it is the thing that actually does
   * the work.
   */
  it('opens the body with the room of a main field, not of a footnote', async () => {
    renderPage()

    expect(screen.getByLabelText('Notas').className).not.toContain('min-h-48')

    cleanup()
    await newNote()

    expect(screen.getByLabelText('Notas').className).toContain('min-h-48')
  })

  /*
   * THE BLOB OF A NOTE CARRIES NOTHING IT DOES NOT HAVE. The form still holds the empty
   * values of every field the note does not show, and `toContent` is what keeps them out
   * — the contract of FOUNDATION.md is absent keys and not empty strings, so a note that
   * stored nine of them would be paying for a login's shape on every load.
   */
  it('stores no empty keys for the fields it does not have', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(await itemResponse())

    await newNote()

    await userEvent.type(screen.getByLabelText('Nombre'), 'La combinación')
    await userEvent.type(screen.getByLabelText('Notas'), 'izquierda 12, derecha 4')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(post).toHaveBeenCalled())

    const body = post.mock.calls[0][1] as { ciphertext: string; iv: string }
    const content: unknown = JSON.parse(await decrypt(key, { data: body.ciphertext, iv: body.iv }))

    expect(content).toEqual({
      name: 'La combinación',
      type: 'note',
      notes: 'izquierda 12, derecha 4',
    })
  })
})
