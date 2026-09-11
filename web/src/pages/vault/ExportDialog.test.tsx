import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExportDialog } from './ExportDialog'
import { UNREADABLE } from '@/lib/vault/payload'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'
import type { Item, ItemContent } from '@/lib/vault/types'

/**
 * This screen had no test at all — zero of 39 statements, measured — and it is the one
 * that decides when a file with every password readable gets written. What is uncovered
 * here is not painting: it is the gate `ADR-011` demands cannot be crossed out of
 * inertia. See #202.
 */

const SECRETS: ItemContent = { name: 'GitHub', username: 'ada', password: 'secreto' }

function item(content: ItemContent, id = '1'): Item {
  return { id, vaultId: 'vault-1', content, createdAt: null, updatedAt: null }
}

/**
 * The captured downloads, with their real content.
 *
 * jsdom brings no `URL.createObjectURL` and does not navigate when a link is pressed, so
 * without this the component would blow up and the test would prove nothing. The Blob is
 * kept so that assertions can be made about what would have been downloaded and not
 * merely about the fact that it was.
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

describe('the encrypted copy', () => {
  it('does not export with a short password, and says why', async () => {
    renderScreen()
    await fillPassphrase('corta')
    await userEvent.click(screen.getByRole('button', { name: /Descargar copia cifrada/ }))

    expect(screen.getByText('Usa al menos 8 caracteres.')).toBeInTheDocument()
    expect(downloads).toHaveLength(0)
  })

  it('does not export when the repetition does not match, and says why', async () => {
    renderScreen()
    await fillPassphrase('una-passphrase-larga', 'otra-cosa-distinta')
    await userEvent.click(screen.getByRole('button', { name: /Descargar copia cifrada/ }))

    expect(screen.getByText('Las dos no coinciden.')).toBeInTheDocument()
    expect(downloads).toHaveLength(0)
  })

  it('downloads an encrypted file that contains none of the passwords', async () => {
    renderScreen()
    await fillPassphrase('una-passphrase-larga')
    await userEvent.click(screen.getByRole('button', { name: /Descargar copia cifrada/ }))

    await waitFor(() => expect(downloads).toHaveLength(1))
    expect(downloads[0].name).toMatch(/^evault-\d{4}-\d{2}-\d{2}\.evault$/)

    // The same method as #59 and #122: looking in the file for the strings written.
    const written = await downloads[0].blob.text()
    expect(written).not.toContain('secreto')
    expect(written).not.toContain('GitHub')
  })

  it('counts the unreadable entries AFTER downloading, not instead of downloading', async () => {
    // Whoever has a broken entry is exactly who most needs a copy of the rest, so the
    // warning cannot replace the download.
    renderScreen([item(SECRETS, '1'), item(UNREADABLE, '2')])
    await fillPassphrase('una-passphrase-larga')
    await userEvent.click(screen.getByRole('button', { name: /Descargar copia cifrada/ }))

    await waitFor(() => expect(downloads).toHaveLength(1))
    expect(screen.getByRole('status')).toHaveTextContent(/1 entrada no se pudo leer y no está/)
  })
})

describe('the gate of the plaintext export', () => {
  it('the unencrypted export button downloads NOTHING: it only opens the confirmation', async () => {
    // It is ADR-011's criterion and the reason this test file exists. A plaintext export
    // that fires on one click leaves the whole vault readable in the downloads folder.
    renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'Exportar sin cifrar' }))

    expect(downloads).toHaveLength(0)
    expect(
      screen.getByText('Vas a crear un fichero con todas tus contraseñas legibles.'),
    ).toBeInTheDocument()
  })

  it('the confirmation describes what is about to be created, it does not ask whether you are sure', async () => {
    renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'Exportar sin cifrar' }))

    expect(screen.getByText(/Cualquiera que lo abra las verá/)).toBeInTheDocument()
    expect(screen.getByText(/tu carpeta de descargas puede estar sincronizada/)).toBeInTheDocument()
  })

  it('only after confirming does it download, and the CSV does carry the passwords', async () => {
    renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'Exportar sin cifrar' }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Lo entiendo, descargar sin cifrar' }),
    )

    await waitFor(() => expect(downloads).toHaveLength(1))
    expect(downloads[0].name).toMatch(/\.csv$/)

    // Carrying them is its whole point and its risk, which is why there is a gate first.
    expect(await downloads[0].blob.text()).toContain('secreto')
  })

  /*
   * THE WARNING HAS TO ARRIVE BEFORE THE FILE, and that is the whole of ADR-017 §2.3's
   * «not in silence». The plaintext CSV is the format used to LEAVE: it gets imported at
   * the far end, the count looks right, and the origin is deleted. Learning afterwards
   * that the second factors did not travel is learning too late — and unlike a password,
   * a seed cannot be rotated in five minutes, it has to be set up again account by
   * account with its QR code.
   */
  it('says how many entries lose their second factor BEFORE downloading', async () => {
    const seed = 'GEZDGNBVGY3TQOJQ'

    renderScreen([
      item({ name: 'con', totp: seed }, '1'),
      item({ name: 'otra con', totp: seed }, '2'),
      item({ name: 'sin' }, '3'),
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Exportar sin cifrar' }))

    expect(downloads).toHaveLength(0)
    expect(screen.getByText(/2 entradas tienen un segundo factor/)).toBeInTheDocument()
    expect(screen.getByText(/con su código QR/)).toBeInTheDocument()
  })

  it('agrees in number when there is only one', async () => {
    renderScreen([item({ name: 'con', totp: 'GEZDGNBVGY3TQOJQ' })])
    await userEvent.click(screen.getByRole('button', { name: 'Exportar sin cifrar' }))

    expect(screen.getByText(/Una entrada tiene un segundo factor/)).toBeInTheDocument()
  })

  /*
   * WHAT THE FILE CARRIES THAT THE HEADLINE DOES NOT NAME. Promising every readable
   * password was the whole truth until ADR-020; a file that also has card numbers, security codes and
   * PINs in the clear is worth more than the one it describes, and whoever downloads it
   * is deciding where to leave it.
   */
  it('says the cards travel readable too, BEFORE downloading', async () => {
    renderScreen([
      item({ name: 'Visa', type: 'card', number: '4111111111111111' }, '1'),
      item({ name: 'Amex', type: 'card', number: '378282246310005' }, '2'),
      item({ name: 'Un login' }, '3'),
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Exportar sin cifrar' }))

    expect(downloads).toHaveLength(0)
    expect(screen.getByText(/tus 2 tarjetas/)).toBeInTheDocument()
    expect(screen.getByText(/códigos de seguridad y sus PIN en claro/)).toBeInTheDocument()
  })

  it('agrees in number with a single card', async () => {
    renderScreen([item({ name: 'Visa', type: 'card', number: '4111111111111111' })])
    await userEvent.click(screen.getByRole('button', { name: 'Exportar sin cifrar' }))

    expect(screen.getByText(/Va también tu tarjeta/)).toBeInTheDocument()
  })

  /*
   * And it stays quiet when there is no card, because warning about something the file
   * does not contain is its own way of being wrong.
   */
  it('says nothing about cards when the vault has none', async () => {
    renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'Exportar sin cifrar' }))

    expect(screen.queryByText(/tarjeta/)).not.toBeInTheDocument()
  })

  it('says nothing about second factors when no entry has one', async () => {
    renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'Exportar sin cifrar' }))

    expect(screen.queryByText(/segundo factor/)).not.toBeInTheDocument()
  })

  it('repeats it after downloading, for whoever clicked through the warning', async () => {
    renderScreen([item({ name: 'con', totp: 'GEZDGNBVGY3TQOJQ' })])
    await userEvent.click(screen.getByRole('button', { name: 'Exportar sin cifrar' }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Lo entiendo, descargar sin cifrar' }),
    )

    await waitFor(() => expect(downloads).toHaveLength(1))
    expect(screen.getByText(/Una entrada se ha ido sin su segundo factor/)).toBeInTheDocument()
  })

  /*
   * THE PREVIOUS PASSWORDS HAVE A SENTENCE OF THEIR OWN, and this is the measured failure
   * of #625 as a test: an entry with history and no seed was counted —the history is
   * withheld since #618— and then announced as leaving without its second factor, which
   * it never had. What it loses is its previous passwords, and what whoever leaves needs
   * to hear is different too: nothing to set up again, but only the encrypted copy keeps
   * them.
   */
  it('says the previous passwords stay behind, and not that a second factor does', async () => {
    const old = { password: 'la-vieja', date: '2026-01-01T00:00:00.000Z', origin: 'rotation' as const }

    renderScreen([item({ name: 'con historial', history: [old] }, '1'), item({ name: 'sin' }, '2')])
    await userEvent.click(screen.getByRole('button', { name: 'Exportar sin cifrar' }))

    expect(
      screen.getByText(/Una entrada tiene contraseñas anteriores que no van en el fichero/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Solo viajan en la copia cifrada/)).toBeInTheDocument()
    expect(screen.queryByText(/segundo factor/)).not.toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'Lo entiendo, descargar sin cifrar' }),
    )

    await waitFor(() => expect(downloads).toHaveLength(1))
    expect(
      screen.getByText(/Una entrada se ha ido sin sus contraseñas anteriores/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/segundo factor/)).not.toBeInTheDocument()
    expect(await downloads[0].blob.text()).not.toContain('la-vieja')
  })

  it('says both, each with its own count, when both stay behind', async () => {
    const old = { password: 'la-vieja', date: '2026-01-01T00:00:00.000Z', origin: 'import' as const }

    renderScreen([
      item({ name: 'las dos', totp: 'GEZDGNBVGY3TQOJQ', history: [old] }, '1'),
      item({ name: 'otra con historial', history: [old] }, '2'),
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Exportar sin cifrar' }))

    expect(screen.getByText(/Una entrada tiene un segundo factor/)).toBeInTheDocument()
    expect(
      screen.getByText(/2 entradas tienen contraseñas anteriores que no van en el fichero/),
    ).toBeInTheDocument()
  })

  it('cancelling the confirmation goes back without downloading anything', async () => {
    renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'Exportar sin cifrar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mejor no' }))

    expect(downloads).toHaveLength(0)
    expect(screen.getByLabelText('Contraseña del fichero')).toBeInTheDocument()
  })
})

/*
 * Exporting with no network. See ADR-019 §3 and issue #493.
 *
 * THIS IS NOT A CASE TO FIX BUT ONE TO NOT BREAK. Exporting happens entirely here, over
 * items that are already decrypted in memory: it asks the server for nothing, so it works
 * offline by construction.
 *
 * The test exists because that is easy to lose. The obvious way to «make the application
 * behave offline» is to disable everything that looks like an action, and this one has no
 * reason to go with them — being able to get your passwords out is worth MORE when the
 * server is not answering, not less.
 */
describe('with an offline session', () => {
  beforeEach(() => {
    useSession.setState({ offline: true })
  })

  afterEach(() => {
    useSession.setState({ offline: false })
  })

  it('still exports, and asks the server for nothing', async () => {
    const get = vi.spyOn(api, 'get')
    const post = vi.spyOn(api, 'post')

    renderScreen()
    await fillPassphrase('una-passphrase-larga')
    await userEvent.click(screen.getByRole('button', { name: /Descargar copia cifrada/ }))

    await waitFor(() => expect(downloads).toHaveLength(1))
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })
})
