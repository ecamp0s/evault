import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExportDialog } from './ExportDialog'
import { UNREADABLE } from '@/lib/vault/payload'
import type { Item, ItemContent } from '@/lib/vault/types'

/**
 * Esta pantalla no tenía ningún test —cero de 39 sentencias, medido— y es la que
 * decide cuándo se escribe un fichero con todas las contraseñas legibles. Lo que
 * está sin cubrir aquí no es pintado: es la puerta que `ADR-011` exige que no se
 * pueda cruzar por inercia. Ver #202.
 */

const SECRETS: ItemContent = { nombre: 'GitHub', usuario: 'ada', password: 'secreto' }

function item(content: ItemContent, id = '1'): Item {
  return { id, vaultId: 'vault-1', content, createdAt: null, updatedAt: null }
}

/**
 * Las descargas capturadas, con su contenido de verdad.
 *
 * jsdom no trae `URL.createObjectURL` ni navega al pulsar un enlace, así que sin
 * esto el componente reventaría y el test no probaría nada. Se guarda el Blob para
 * poder afirmar sobre lo que se habría descargado y no solo sobre que se descargó.
 */
let downloads: { name: string; blob: Blob }[] = []

beforeEach(() => {
  downloads = []
  let pending: Blob | null = null

  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: (blob: Blob) => {
      pending = blob

      return 'blob:test'
    },
    revokeObjectURL: () => {},
  })

  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    if (pending) downloads.push({ name: this.download, blob: pending })
    pending = null
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function renderScreen(items: Item[] = [item(SECRETS)]) {
  return render(<ExportDialog items={items} onClose={() => {}} />)
}

async function fillPassphrase(passphrase: string, repeat = passphrase) {
  await userEvent.type(screen.getByLabelText('Contraseña del fichero'), passphrase)
  await userEvent.type(screen.getByLabelText('Repítela'), repeat)
}

describe('la copia cifrada', () => {
  it('no exporta con una contraseña corta, y dice por qué', async () => {
    renderScreen()
    await fillPassphrase('corta')
    await userEvent.click(screen.getByRole('button', { name: /Descargar copia cifrada/ }))

    expect(screen.getByText('Usa al menos 8 caracteres.')).toBeInTheDocument()
    expect(downloads).toHaveLength(0)
  })

  it('no exporta si la repetición no coincide, y dice por qué', async () => {
    renderScreen()
    await fillPassphrase('una-passphrase-larga', 'otra-cosa-distinta')
    await userEvent.click(screen.getByRole('button', { name: /Descargar copia cifrada/ }))

    expect(screen.getByText('Las dos no coinciden.')).toBeInTheDocument()
    expect(downloads).toHaveLength(0)
  })

  it('descarga un fichero cifrado que no contiene las contraseñas', async () => {
    renderScreen()
    await fillPassphrase('una-passphrase-larga')
    await userEvent.click(screen.getByRole('button', { name: /Descargar copia cifrada/ }))

    await waitFor(() => expect(downloads).toHaveLength(1))
    expect(downloads[0].name).toMatch(/^evault-\d{4}-\d{2}-\d{2}\.evault$/)

    // El mismo método que #59 y #122: buscar en el fichero las cadenas escritas.
    const written = await downloads[0].blob.text()
    expect(written).not.toContain('secreto')
    expect(written).not.toContain('GitHub')
  })

  it('cuenta las entradas ilegibles DESPUÉS de descargar, no en vez de descargar', async () => {
    // Quien tiene una entrada rota es justo quien más necesita la copia de las
    // demás, así que el aviso no puede sustituir a la descarga.
    renderScreen([item(SECRETS, '1'), item(UNREADABLE, '2')])
    await fillPassphrase('una-passphrase-larga')
    await userEvent.click(screen.getByRole('button', { name: /Descargar copia cifrada/ }))

    await waitFor(() => expect(downloads).toHaveLength(1))
    expect(screen.getByRole('status')).toHaveTextContent(/1 entrada no se pudo leer y no está/)
  })
})

describe('la puerta del export en claro', () => {
  it('el botón de exportar sin cifrar NO descarga nada: solo abre la confirmación', async () => {
    // Es el criterio de ADR-011 y la razón de ser de este fichero de test. Un
    // export en claro que se dispara de un clic deja la vault entera legible en la
    // carpeta de descargas.
    renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'Exportar sin cifrar' }))

    expect(downloads).toHaveLength(0)
    expect(
      screen.getByText('Vas a crear un fichero con todas tus contraseñas legibles.'),
    ).toBeInTheDocument()
  })

  it('la confirmación describe lo que se va a crear, no pregunta si estás seguro', async () => {
    renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'Exportar sin cifrar' }))

    expect(screen.getByText(/Cualquiera que lo abra las verá/)).toBeInTheDocument()
    expect(screen.getByText(/tu carpeta de descargas puede estar sincronizada/)).toBeInTheDocument()
  })

  it('solo después de confirmar se descarga, y el CSV sí lleva las contraseñas', async () => {
    renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'Exportar sin cifrar' }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Lo entiendo, descargar sin cifrar' }),
    )

    await waitFor(() => expect(downloads).toHaveLength(1))
    expect(downloads[0].name).toMatch(/\.csv$/)

    // Que las lleve es su razón de ser y su riesgo, y por eso hay una puerta antes.
    expect(await downloads[0].blob.text()).toContain('secreto')
  })

  it('cancelar la confirmación vuelve atrás sin descargar nada', async () => {
    renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'Exportar sin cifrar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mejor no' }))

    expect(downloads).toHaveLength(0)
    expect(screen.getByLabelText('Contraseña del fichero')).toBeInTheDocument()
  })
})
