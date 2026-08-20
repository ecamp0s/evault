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
 * Desde el cifrado real hay que cifrar de verdad el item que devuelve la API: la
 * capa de datos lo descifra al recibirlo, y un fixture en claro se vería ilegible.
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

describe('crear', () => {
  it('guarda una entrada nueva con lo que se ha escrito', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(await itemResponse())
    const { onClose } = renderPage()

    await userEvent.type(screen.getByLabelText('Nombre'), 'GitHub')
    await userEvent.type(screen.getByLabelText('Usuario'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secretísima')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    /*
     * Se espera a `onClose`, que es lo ÚLTIMO de la cadena, y solo después se
     * comprueba el `post`. Al revés —esperar al post y afirmar el cierre a
     * continuación— el test depende de que el callback de éxito de la mutación
     * llegue a tiempo, y eso no está garantizado: falló en el CI del PR #185, con
     * ocho pasadas seguidas en verde en local. Ver el issue #186.
     */
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(post).toHaveBeenCalled()
  })

  /*
   * El criterio que más importa: ningún campo de la entrada puede salir fuera del
   * blob. Si algún día alguien añade un campo suelto al cuerpo de la petición,
   * este test lo detiene.
   */
  it('no manda ningún campo en claro fuera del blob', async () => {
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

  it('no deja enviar sin nombre', async () => {
    const post = vi.spyOn(api, 'post')
    renderPage()

    await userEvent.type(screen.getByLabelText('Usuario'), 'ada@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Escribe un nombre')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('omite del blob los campos que no se han rellenado', async () => {
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
   * El reverso del test de arriba, y el que da sentido a la iteración entera. Hasta
   * el issue #59 el contenido se leía con un atob y sin ninguna clave: cualquiera
   * con acceso a la petición o a la base de datos veía las contraseñas. Esto falla
   * si eso vuelve a ser posible.
   */
  it('lo que sale hacia la API no se puede leer sin la clave', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(await itemResponse())
    renderPage()

    await userEvent.type(screen.getByLabelText('Nombre'), 'GitHub')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'la-contraseña-secreta')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(post).toHaveBeenCalled())

    const body = post.mock.calls[0][1] as { ciphertext: string; iv: string; version: number }

    // Ni el nombre ni la contraseña aparecen en lo que viaja.
    expect(JSON.stringify(body)).not.toContain('GitHub')
    expect(JSON.stringify(body)).not.toContain('la-contraseña-secreta')

    // Y descodificar el base64 ya no devuelve nada legible.
    expect(atob(body.ciphertext)).not.toContain('GitHub')
    expect(() => JSON.parse(atob(body.ciphertext))).toThrow()

    expect(body.version).toBe(2)
  })
})

describe('editar', () => {
  it('precarga los valores actuales', () => {
    renderPage(ITEM)

    expect(screen.getByLabelText('Nombre')).toHaveValue('GitHub')
    expect(screen.getByLabelText('Usuario')).toHaveValue('ada@example.com')
    expect(screen.getByLabelText('Contraseña')).toHaveValue('la-de-siempre')
    expect(screen.getByLabelText('URL')).toHaveValue('https://github.com')
    expect(screen.getByLabelText('Notas')).toHaveValue('cuenta personal')
  })

  it('actualiza contra el identificador del item, que no cambia', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue(await itemResponse())
    renderPage(ITEM)

    await userEvent.clear(screen.getByLabelText('Nombre'))
    await userEvent.type(screen.getByLabelText('Nombre'), 'GitHub del trabajo')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(patch).toHaveBeenCalled())
    expect(patch.mock.calls[0][0]).toBe(`/vaults/${VAULT_ID}/items/item-1`)
  })
})

describe('contraseña', () => {
  it('empieza oculta y se puede revelar', async () => {
    renderPage(ITEM)

    const field = screen.getByLabelText('Contraseña')

    expect(field).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar la contraseña' }))

    expect(field).toHaveAttribute('type', 'text')

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar la contraseña' }))

    expect(field).toHaveAttribute('type', 'password')
  })
})

describe('errores', () => {
  /*
   * Criterio explícito del issue. Perder una contraseña recién tecleada por un
   * fallo de red sería de las cosas más molestas que puede hacer esta pantalla.
   */
  it('un error de la API no borra lo escrito', async () => {
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

  it('distingue el fallo de red del error del servidor', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new AxiosError('Network Error'))
    renderPage()

    await userEvent.type(screen.getByLabelText('Nombre'), 'GitHub')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No hemos podido conectar')
  })
})

describe('cambios sin guardar', () => {
  it('avisa antes de cerrar si hay cambios', async () => {
    const { onClose } = renderPage()

    await userEvent.type(screen.getByLabelText('Nombre'), 'a medias')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.getByText('Tienes cambios sin guardar')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('seguir editando devuelve al formulario con lo escrito intacto', async () => {
    renderPage()

    await userEvent.type(screen.getByLabelText('Nombre'), 'a medias')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Seguir editando' }))

    expect(screen.getByLabelText('Nombre')).toHaveValue('a medias')
  })

  it('descartar cierra de verdad', async () => {
    const { onClose } = renderPage()

    await userEvent.type(screen.getByLabelText('Nombre'), 'a medias')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }))

    expect(onClose).toHaveBeenCalled()
  })

  it('sin cambios cierra directamente, sin preguntar', async () => {
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
