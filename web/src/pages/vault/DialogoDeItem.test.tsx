import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import { api } from '@/lib/api'
import { decrypt } from '@/lib/vault/crypto'
import { desbloquearParaTest, itemCifrado } from '@/test/vault'
import type { Item, EncryptedItem } from '@/lib/vault/types'
import { DialogoDeItem } from './DialogoDeItem'

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
let clave: CryptoKey

async function respuestaDeItem(): Promise<{ data: { data: { item: EncryptedItem } } }> {
  return { data: { data: { item: await itemCifrado(clave, 'item-1', { nombre: 'GitHub' }, VAULT_ID) } } }
}

function errorDeApi(estado: number): AxiosError {
  const error = new AxiosError('Request failed')
  const headers = new AxiosHeaders()

  error.response = { status: estado, statusText: '', data: {}, headers, config: { headers } }

  return error
}

function pintar(item: Item | null = null, onCerrar = vi.fn()) {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  const utilidades = render(
    <QueryClientProvider client={cliente}>
      <DialogoDeItem vaultId={VAULT_ID} item={item} onCerrar={onCerrar} />
    </QueryClientProvider>,
  )

  return { ...utilidades, onCerrar }
}

beforeEach(async () => {
  vi.restoreAllMocks()
  clave = await desbloquearParaTest()
})

describe('crear', () => {
  it('guarda una entrada nueva con lo que se ha escrito', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(await respuestaDeItem())
    const { onCerrar } = pintar()

    await userEvent.type(screen.getByLabelText('Nombre'), 'GitHub')
    await userEvent.type(screen.getByLabelText('Usuario'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secretísima')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(onCerrar).toHaveBeenCalled()
  })

  /*
   * El criterio que más importa: ningún campo de la entrada puede salir fuera del
   * blob. Si algún día alguien añade un campo suelto al cuerpo de la petición,
   * este test lo detiene.
   */
  it('no manda ningún campo en claro fuera del blob', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(await respuestaDeItem())
    pintar()

    await userEvent.type(screen.getByLabelText('Nombre'), 'GitHub')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secretísima')
    await userEvent.type(screen.getByLabelText('URL'), 'github.com')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(post).toHaveBeenCalled())

    const [url, cuerpo] = post.mock.calls[0]

    expect(url).toBe(`/vaults/${VAULT_ID}/items`)
    expect(Object.keys(cuerpo as object)).toEqual(['ciphertext', 'iv', 'version'])

    const serializado = JSON.stringify(cuerpo)

    expect(serializado).not.toContain('GitHub')
    expect(serializado).not.toContain('secretísima')
    expect(serializado).not.toContain('github.com')
  })

  it('no deja enviar sin nombre', async () => {
    const post = vi.spyOn(api, 'post')
    pintar()

    await userEvent.type(screen.getByLabelText('Usuario'), 'ada@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Escribe un nombre')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('omite del blob los campos que no se han rellenado', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(await respuestaDeItem())
    pintar()

    await userEvent.type(screen.getByLabelText('Nombre'), 'Solo el nombre')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(post).toHaveBeenCalled())

    const cuerpo = post.mock.calls[0][1] as { ciphertext: string; iv: string }
    const contenido: unknown = JSON.parse(
      await decrypt(clave, { data: cuerpo.ciphertext, iv: cuerpo.iv }),
    )

    expect(contenido).toEqual({ nombre: 'Solo el nombre' })
  })

  /*
   * El reverso del test de arriba, y el que da sentido a la iteración entera. Hasta
   * el issue #59 el contenido se leía con un atob y sin ninguna clave: cualquiera
   * con acceso a la petición o a la base de datos veía las contraseñas. Esto falla
   * si eso vuelve a ser posible.
   */
  it('lo que sale hacia la API no se puede leer sin la clave', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(await respuestaDeItem())
    pintar()

    await userEvent.type(screen.getByLabelText('Nombre'), 'GitHub')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'la-contraseña-secreta')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(post).toHaveBeenCalled())

    const cuerpo = post.mock.calls[0][1] as { ciphertext: string; iv: string; version: number }

    // Ni el nombre ni la contraseña aparecen en lo que viaja.
    expect(JSON.stringify(cuerpo)).not.toContain('GitHub')
    expect(JSON.stringify(cuerpo)).not.toContain('la-contraseña-secreta')

    // Y descodificar el base64 ya no devuelve nada legible.
    expect(atob(cuerpo.ciphertext)).not.toContain('GitHub')
    expect(() => JSON.parse(atob(cuerpo.ciphertext))).toThrow()

    expect(cuerpo.version).toBe(2)
  })
})

describe('editar', () => {
  it('precarga los valores actuales', () => {
    pintar(ITEM)

    expect(screen.getByLabelText('Nombre')).toHaveValue('GitHub')
    expect(screen.getByLabelText('Usuario')).toHaveValue('ada@example.com')
    expect(screen.getByLabelText('Contraseña')).toHaveValue('la-de-siempre')
    expect(screen.getByLabelText('URL')).toHaveValue('https://github.com')
    expect(screen.getByLabelText('Notas')).toHaveValue('cuenta personal')
  })

  it('actualiza contra el identificador del item, que no cambia', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue(await respuestaDeItem())
    pintar(ITEM)

    await userEvent.clear(screen.getByLabelText('Nombre'))
    await userEvent.type(screen.getByLabelText('Nombre'), 'GitHub del trabajo')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(patch).toHaveBeenCalled())
    expect(patch.mock.calls[0][0]).toBe(`/vaults/${VAULT_ID}/items/item-1`)
  })
})

describe('contraseña', () => {
  it('empieza oculta y se puede revelar', async () => {
    pintar(ITEM)

    const campo = screen.getByLabelText('Contraseña')

    expect(campo).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar la contraseña' }))

    expect(campo).toHaveAttribute('type', 'text')

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar la contraseña' }))

    expect(campo).toHaveAttribute('type', 'password')
  })
})

describe('errores', () => {
  /*
   * Criterio explícito del issue. Perder una contraseña recién tecleada por un
   * fallo de red sería de las cosas más molestas que puede hacer esta pantalla.
   */
  it('un error de la API no borra lo escrito', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(errorDeApi(500))
    const { onCerrar } = pintar()

    await userEvent.type(screen.getByLabelText('Nombre'), 'GitHub')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secretísima')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('GitHub')
    expect(screen.getByLabelText('Contraseña')).toHaveValue('secretísima')
    expect(onCerrar).not.toHaveBeenCalled()
  })

  it('distingue el fallo de red del error del servidor', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new AxiosError('Network Error'))
    pintar()

    await userEvent.type(screen.getByLabelText('Nombre'), 'GitHub')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No hemos podido conectar')
  })
})

describe('cambios sin guardar', () => {
  it('avisa antes de cerrar si hay cambios', async () => {
    const { onCerrar } = pintar()

    await userEvent.type(screen.getByLabelText('Nombre'), 'a medias')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.getByText('Tienes cambios sin guardar')).toBeInTheDocument()
    expect(onCerrar).not.toHaveBeenCalled()
  })

  it('seguir editando devuelve al formulario con lo escrito intacto', async () => {
    pintar()

    await userEvent.type(screen.getByLabelText('Nombre'), 'a medias')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Seguir editando' }))

    expect(screen.getByLabelText('Nombre')).toHaveValue('a medias')
  })

  it('descartar cierra de verdad', async () => {
    const { onCerrar } = pintar()

    await userEvent.type(screen.getByLabelText('Nombre'), 'a medias')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }))

    expect(onCerrar).toHaveBeenCalled()
  })

  it('sin cambios cierra directamente, sin preguntar', async () => {
    const { onCerrar } = pintar(ITEM)

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByText('Tienes cambios sin guardar')).not.toBeInTheDocument()
    expect(onCerrar).toHaveBeenCalled()
  })
})
