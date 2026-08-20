import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
    nombre: 'GitHub',
    usuario: 'ada@example.com',
    password: 'la-de-siempre',
    url: 'https://github.com',
    notas: 'cuenta personal',
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
  return { data: { data: { item: await encryptedItem(key, 'item-1', { nombre: 'GitHub' }, VAULT_ID) } } }
}

function apiError(httpStatus: number): AxiosError {
  const error = new AxiosError('Request failed')
  const headers = new AxiosHeaders()

  error.response = { status: httpStatus, statusText: '', data: {}, headers, config: { headers } }

  return error
}

function renderPage(item: Item | null = null, onClose = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ItemDialog vaultId={VAULT_ID} item={item} onClose={onClose} />
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

    expect(content).toEqual({ nombre: 'Solo el nombre' })
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
