import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { ImportDialog } from './ImportDialog'
import { createQueryClient } from '@/lib/queries'
import { api } from '@/lib/api'
import * as vaultApi from '@/lib/vault/api'
import * as importer from '@/lib/vault/import'
import { ImportError } from '@/lib/vault/import'
import { unlockForTest } from '@/test/vault'
import { hasUnsavedWork, useUnsavedWork } from '@/lib/vault/unsavedWork'
import { useSession } from '@/lib/session'
import type { Item } from '@/lib/vault/types'

const CHROME = `name,url,username,password,note
GitHub,https://github.com,ada,secreto-del-fichero,la del trabajo
Banco,https://banco.es,0001,otra-mas,`

function fileWith(fileContent: string, fileName = 'passwords.csv'): File {
  return new File([fileContent], fileName, { type: 'text/csv' })
}

/*
 * The router is here because the summary leads somewhere: when an import leaves entries
 * with two known passwords, it offers the screen that lists them (#620). A dialog
 * rendered on its own has no router, and `useNavigate` refuses without one.
 */
function renderScreen(items: Item[] = []) {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <ImportDialog vaultId="vault-1" items={items} onClose={() => {}} />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

async function pickFile(fileContent: string) {
  await userEvent.upload(screen.getByLabelText('Fichero'), fileWith(fileContent))
}

beforeEach(async () => {
  vi.restoreAllMocks()

  // With no key in memory, createItem never reaches the network: it encrypts before
  // requesting. With one, what travels in the test is real ciphertext.
  await unlockForTest()

  useSession.setState({ offline: false })
})

describe('the preview', () => {
  it('says how many entries the file brings before writing anything', async () => {
    const createMutation = vi.spyOn(vaultApi, 'createItem')

    renderScreen()
    await pickFile(CHROME)

    expect(await screen.findByText(/2 entradas en el fichero/i)).toBeInTheDocument()
    expect(createMutation).not.toHaveBeenCalled()
  })

  it('warns about the fields that do not fit and will end up in the notes', async () => {
    renderScreen()
    await pickFile('name,login_username,login_password,folder\nGitHub,ada,secreto,Trabajo')

    expect(await screen.findByText(/se guardarán dentro de las notas/i)).toBeInTheDocument()
    expect(screen.getByText(/folder/)).toBeInTheDocument()
  })

  /*
   * `login_totp` USED TO BE THE EXAMPLE IN THE TEST ABOVE, and it stopped being one in
   * #419: the seed now has a field of its own, so it neither lands in the notes nor gets
   * counted among what was moved. Notes are what the search reads, and a seed outlives a
   * password — ADR-017 §4 asked for this by name.
   */
  it('no longer counts the second factor among what does not fit', async () => {
    renderScreen()
    await pickFile(
      'name,login_username,login_password,login_totp\nGitHub,ada,secreto,JBSWY3DPEHPK3PXP',
    )

    expect(await screen.findByText(/1 entrada en el fichero/i)).toBeInTheDocument()
    expect(screen.queryByText(/login_totp/)).not.toBeInTheDocument()
    expect(screen.queryByText(/se guardarán dentro de las notas/i)).not.toBeInTheDocument()
  })

  /*
   * AND ALSO AGAINST THE FILE ITSELF, which is #442: `ADR-011` §2.4 asks for the ones
   * that LOOK repeated to be flagged, and two identical rows in one file look it as much
   * as one colliding with something stored. Firefox is what makes it likely — with no
   * name column, everything for one service collapses onto the same derived name.
   */
  it('shows a row repeated inside the file as a group to decide, with the vault empty', async () => {
    renderScreen([])
    await pickFile(
      'name,url,username,password,note\n' +
        'Correo,https://correo.com,ada,la-vieja,\n' +
        'Correo,https://correo.com,ada,la-nueva,',
    )

    expect(await screen.findByText(/parece repetido/i)).toBeInTheDocument()
    expect(screen.getByText(/dentro del propio fichero/i)).toBeInTheDocument()
    /*
     * ONE, AND NOT TWO. Two rows go in and one entry comes out: that is what merging
     * means, and the button says what will happen rather than how many rows were read.
     */
    expect(screen.getByRole('button', { name: 'Importar 1' })).toBeInTheDocument()
  })

  /*
   * MERGING IS THE DEFAULT, AND IT IS A CHANGE OF STANCE from the tick box this replaces.
   * That one left duplicates OUT, because leaving them out was the only thing it could do
   * without losing something. Since #618 merging loses nothing —what does not win goes to
   * the history— so the safe default is the one that removes the duplicate rather than
   * the one that drops an entry.
   */
  it('merges into the stored entry instead of leaving the file row out', async () => {
    const saved: Item = {
      id: '1',
      vaultId: 'vault-1',
      content: { name: 'GitHub' },
      createdAt: null,
      updatedAt: null,
    }
    const updateMutation = vi.spyOn(vaultApi, 'updateItem').mockResolvedValue(saved)

    // The other row of the file is created, and the creations run first: without this
    // the import fails before it ever reaches the update.
    vi.spyOn(vaultApi, 'createItem').mockResolvedValue({ ...saved, id: '2' })
    const alreadyThere: Item = {
      id: '1',
      vaultId: 'vault-1',
      content: { name: 'GitHub', url: 'https://github.com', username: 'ada', password: 'la-vieja' },
      createdAt: null,
      updatedAt: null,
    }

    renderScreen([alreadyThere])
    await pickFile(CHROME)

    expect(await screen.findByText(/parece repetido|parecen repetidos/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Importar 2' }))

    await waitFor(() => expect(updateMutation).toHaveBeenCalled())
  })

  /*
   * The heuristic can be wrong, and a screen that does not let anybody say so ends up
   * merging two accounts of one service. Saying it turns one entry into two.
   */
  it('lets somebody say they were not the same account', async () => {
    renderScreen([])
    await pickFile(
      'name,url,username,password,note\n' +
        'Correo,https://correo.com,ada,la-vieja,\n' +
        'Correo,https://correo.com,ada,la-nueva,',
    )

    expect(await screen.findByRole('button', { name: 'Importar 1' })).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText(/No son la misma cuenta/i))

    expect(screen.getByRole('button', { name: 'Importar 2' })).toBeInTheDocument()
  })

  /*
   * `audit.ts`'s rule, brought to the one screen where seeing two passwords at once is
   * the task: what is shown is THAT they differ, and each is revealed by an explicit
   * action. Against somebody with the vault already open it protects nothing; against
   * somebody looking over a shoulder it does.
   */
  it('does not paint the passwords until somebody asks', async () => {
    renderScreen([])
    await pickFile(
      'name,url,username,password,note\n' +
        'Correo,https://correo.com,ada,la-vieja,\n' +
        'Correo,https://correo.com,ada,la-nueva,',
    )

    expect(await screen.findByRole('button', { name: /Ver las contraseñas/i })).toBeInTheDocument()
    expect(screen.queryByText('la-vieja')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Ver las contraseñas/i }))

    expect(screen.getByText('la-vieja')).toBeInTheDocument()
    expect(screen.getByText('la-nueva')).toBeInTheDocument()
  })

  /*
   * The formats it names have to be the formats it accepts.
   *
   * #381 taught the import to read Firefox's CSV and this text kept saying «Chrome or
   * Bitwarden» — found while verifying the exit criteria of the iteration, by reading
   * the dialog rather than the code. It is the worst place for it to be wrong: the
   * error names the formats precisely when somebody's file was refused.
   */
  it('names every format it accepts, including the last one added', async () => {
    renderScreen()

    const help = await screen.findByText(/Una copia de eVault/)

    expect(help).toHaveTextContent(/Chrome/)
    expect(help).toHaveTextContent(/Firefox/)
    expect(help).toHaveTextContent(/Bitwarden/)
    expect(help).toHaveTextContent(/NordPass/)
  })

  it('explains what to do when it does not recognise the file', async () => {
    renderScreen()
    await pickFile('una,cosa\n1,2')

    expect(await screen.findByText(/no reconocemos este fichero/i)).toBeInTheDocument()
  })

  /*
   * A file that matches two formats says something different from one that matches none,
   * and the distinction is not cosmetic: «no lo reconocemos» would send somebody to check
   * an export that is perfectly fine. It is mocked because no real file triggers it —
   * `import.test.ts` explains why — and what is being checked here is the dialog, not the
   * detector.
   */
  it('tells a file it understood twice from one it did not understand at all', async () => {
    vi.spyOn(importer, 'parseImportFile').mockRejectedValueOnce(
      new ImportError('formato-ambiguo'),
    )
    renderScreen()
    await pickFile('a,b,c,d\n1,2,3,4')

    const message = await screen.findByText(/encaja con dos formatos/i)

    expect(message).toBeInTheDocument()
    expect(message).not.toHaveTextContent(/no reconocemos/i)
  })
})

describe('importing', () => {
  it('writes one entry for each one selected', async () => {
    const createMutation = vi.spyOn(vaultApi, 'createItem').mockResolvedValue({
      id: 'x',
      vaultId: 'vault-1',
      content: { name: 'X' },
      createdAt: null,
      updatedAt: null,
    })

    renderScreen()
    await pickFile(CHROME)
    await userEvent.click(await screen.findByRole('button', { name: 'Importar 2' }))

    await waitFor(() => expect(createMutation).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(/2 entradas importadas/i)).toBeInTheDocument()
  })

  /*
   * THE GUARANTEE THAT MATTERS MOST ON THIS SCREEN.
   *
   * The file arrives in the clear and with everything inside. It cannot leave the
   * browser: not whole, not in pieces, and not «to validate the format». All that
   * travels are the already encrypted items, one by one, through the usual CRUD.
   */
  it('never sends the file to the server at any point', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: { data: { item: { id: 'x', vault_id: 'v', ciphertext: 'c', iv: 'i', version: 2 } } },
    })

    renderScreen()
    await pickFile(CHROME)
    await userEvent.click(await screen.findByRole('button', { name: 'Importar 2' }))

    await waitFor(() => expect(post).toHaveBeenCalled())

    const sent = JSON.stringify(post.mock.calls)

    expect(sent).not.toContain('secreto-del-fichero')
    expect(sent).not.toContain('otra-mas')
    expect(sent).not.toContain('name,url,username')
    expect(sent).not.toContain('GitHub')
  })

  /*
   * A half-done import cannot stay quiet about how many got in: otherwise the user does
   * not know whether to repeat the whole file, and repeating it would duplicate what did
   * get in.
   */
  it('says how many got in when it is cut short halfway', async () => {
    let recordedCalls = 0

    vi.spyOn(vaultApi, 'createItem').mockImplementation(async () => {
      recordedCalls += 1

      if (recordedCalls > 1) throw new Error('se cayó la red')

      return {
        id: 'x',
        vaultId: 'vault-1',
        content: { name: 'X' },
        createdAt: null,
        updatedAt: null,
      }
    })

    renderScreen()
    await pickFile(CHROME)
    await userEvent.click(await screen.findByRole('button', { name: 'Importar 2' }))

    expect(await screen.findByText(/se han importado 1 de 2/i)).toBeInTheDocument()
  })
})

/**
 * That the inactivity warning knows this dialog is holding a decision. See #329.
 *
 * What a lock takes away here is not the file — that gets picked again — but the
 * exclusions ticked by hand over forty entries, and the passphrase of an encrypted
 * file. Both have to be redone by someone who was told nothing.
 */
describe('while there is something read on screen', () => {
  beforeEach(() => {
    useUnsavedWork.setState({ count: 0, kinds: { 'text': 0, 'recovery-key': 0 } })
  })

  it('declares nothing before a file has been read', () => {
    renderScreen()

    expect(hasUnsavedWork()).toBe(false)
  })

  it('declares work once the file has been read', async () => {
    renderScreen()

    await pickFile(CHROME)
    // The button carries the count, which is the unambiguous sign that the file was read.
    await screen.findByRole('button', { name: /^Importar 2$/ })

    expect(hasUnsavedWork()).toBe(true)
  })

  it('stops declaring it once the import has finished', async () => {
    vi.spyOn(api, 'post').mockImplementation((_url, body) =>
      Promise.resolve({ data: { data: { item: { id: 'nuevo', vault_id: 'vault-1', ...(body as object), created_at: null, updated_at: null } } } }),
    )
    renderScreen()

    await pickFile(CHROME)
    await userEvent.click(await screen.findByRole('button', { name: /^Importar 2$/ }))
    await screen.findByText(/entradas importadas/)

    expect(hasUnsavedWork()).toBe(false)
  })
})

/**
 * That a file it cannot read does not leave the dialog mute. See #355.
 *
 * Found while measuring the import of Iteration 11: the browser handed over a file it
 * could not read, and the screen said nothing at all — no error, no preview, «Importar
 * 0» greyed out. `read()` translates every problem it knows into a sentence, but
 * `file.text()` sat one line ABOVE its try, so its rejection reached nobody.
 */
describe('a file that cannot be read', () => {
  /** A File whose text() rejects, which is what a pulled-out USB looks like. */
  function unreadableFile(): File {
    const file = fileWith('da igual')

    Object.defineProperty(file, 'text', {
      value: () => Promise.reject(new DOMException('NotFoundError')),
    })

    return file
  }

  it('says so instead of staying silent', async () => {
    renderScreen()

    await userEvent.upload(screen.getByLabelText('Fichero'), unreadableFile())

    expect(await screen.findByText(/no hemos podido leer el fichero/i)).toBeInTheDocument()
  })

  it('tells it apart from a format it does not recognise', async () => {
    /*
     * Two different problems and two different things to do about them: one is «this is
     * not a file I read», the other is «I could not get at this file». Sending both to
     * the same sentence would send somebody to convert a file that was fine.
     */
    renderScreen()

    // Two lines, so it gets as far as looking at the headers: one line alone is «empty
    // file», which is a third problem with a third sentence.
    await userEvent.upload(screen.getByLabelText('Fichero'), fileWith('columna,otra\nvalor,otro'))

    expect(await screen.findByText(/no reconocemos este fichero/i)).toBeInTheDocument()
  })
})

/**
 * That the wait says how it is going. See #353.
 *
 * It used to say «Importando…» and nothing else for the whole operation — four minutes
 * back then. #352 brought that down to about sixteen seconds for 370 entries, which is
 * still long enough to wonder whether it has hung.
 */
describe('while it is importing', () => {
  it('says how many are in of how many are going', async () => {
    /*
     * The writes are held open on purpose so the count can be read mid-flight. Letting
     * them resolve would race the assertion against the end of the import.
     */
    // Typed as a function from the start, not as «function or null»: TypeScript narrows
    // it to null after the initialiser and then refuses to call it.
    let letOneThrough: () => void = () => {}
    const nextWrite = () => new Promise<void>((resolve) => { letOneThrough = resolve })
    let pending = nextWrite()

    vi.spyOn(api, 'post').mockImplementation(async (_url, body) => {
      await pending
      pending = nextWrite()

      return { data: { data: { item: { id: `nuevo-${Math.random()}`, vault_id: 'vault-1', ...(body as object), created_at: null, updated_at: null } } } }
    })

    renderScreen()
    await pickFile(CHROME)
    await userEvent.click(await screen.findByRole('button', { name: /^Importar 2$/ }))

    expect(await screen.findByRole('button', { name: /Importando 0 de 2/ })).toBeInTheDocument()

    letOneThrough()

    expect(await screen.findByRole('button', { name: /Importando 1 de 2/ })).toBeInTheDocument()

    const bar = screen.getByRole('progressbar')

    expect(bar).toHaveAttribute('aria-valuenow', '1')
    expect(bar).toHaveAttribute('aria-valuemax', '2')

    letOneThrough()
    await screen.findByText(/entradas importadas/)
  })

  it('shows no progress bar once there is nothing in flight', async () => {
    renderScreen()

    await pickFile(CHROME)

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})

/*
 * Importing while the session is reading the copy on this device. See ADR-019 §3 and
 * issue #493.
 *
 * WHY IT NEEDED ITS OWN GO, having been closed for the entry dialogs in #467: this one
 * was left out, so an import would have failed with «the connection failed» — a sentence
 * that invites trying again, over something that will refuse every entry until the
 * session reconnects.
 *
 * AND WHY IT IS SAID ON OPENING rather than when it fails: by the time it failed, a file
 * has been chosen, its entries reviewed and the duplicates ticked. All of that for
 * nothing.
 */
describe('with an offline session', () => {
  beforeEach(() => {
    useSession.setState({ offline: true })
  })

  it('says so as soon as the dialog opens', () => {
    renderScreen()

    expect(screen.getByText(/no se puede importar/i)).toBeInTheDocument()
  })

  it('says nothing of the sort with an ordinary session', () => {
    useSession.setState({ offline: false })

    renderScreen()

    expect(screen.queryByText(/no se puede importar/i)).not.toBeInTheDocument()
  })

  /*
   * The file still gets read and previewed: that part happens entirely here, and seeing
   * what would be imported is useful even when it cannot be imported yet.
   */
  it('still reads the file and shows what it found', async () => {
    renderScreen()
    await pickFile(CHROME)

    expect(await screen.findByText(/2 entradas en el fichero/i)).toBeInTheDocument()
  })

  it('explains the reason instead of blaming the connection', async () => {
    renderScreen()
    await pickFile(CHROME)

    await userEvent.click(await screen.findByRole('button', { name: 'Importar 2' }))

    expect(await screen.findByText(/No se puede importar mientras/i)).toBeInTheDocument()
    expect(screen.queryByText(/ha fallado la conexión/i)).not.toBeInTheDocument()
  })

  /*
   * THE ONE THAT MATTERS MOST. The refusal happens on the first entry, so nothing reaches
   * the server — and the message says «nothing has been saved». If that ever stopped
   * being true, the message would be a lie in the one place somebody has to trust it.
   */
  it('writes nothing at all', async () => {
    const post = vi.spyOn(api, 'post')

    renderScreen()
    await pickFile(CHROME)

    await userEvent.click(await screen.findByRole('button', { name: 'Importar 2' }))

    await waitFor(() => expect(screen.getByText(/No se ha guardado nada/i)).toBeInTheDocument())
    expect(post).not.toHaveBeenCalled()
  })
})

/*
 * The three numbers of #620 on screen. «Importado» on its own is what makes somebody
 * delete the source without checking.
 */
describe('what the dialog says when it has finished', () => {
  const withConflict =
    'name,url,username,password,note\n' +
    'Correo,https://correo.com,ada,la-vieja,\n' +
    'Correo,https://correo.com/entrar,ada,la-nueva,'

  beforeEach(() => {
    vi.spyOn(vaultApi, 'createItem').mockResolvedValue({
      id: 'x',
      vaultId: 'vault-1',
      content: { name: 'X' },
      createdAt: null,
      updatedAt: null,
    })
  })

  it('says how many were merged and how many are left to review', async () => {
    renderScreen()
    await pickFile(withConflict)
    await userEvent.click(await screen.findByRole('button', { name: 'Importar 1' }))

    expect(await screen.findByText(/1 entrada importada/i)).toBeInTheDocument()
    expect(screen.getByText(/se ha unido con otra/i)).toBeInTheDocument()
    expect(screen.getByText(/nadie ha dicho cuál vale/i)).toBeInTheDocument()
  })

  /*
   * A number that leads nowhere is a number nobody acts on, so it comes with the way to
   * the screen that lists them.
   */
  it('offers the way to the ones that need reviewing', async () => {
    renderScreen()
    await pickFile(withConflict)
    await userEvent.click(await screen.findByRole('button', { name: 'Importar 1' }))

    expect(
      await screen.findByRole('button', { name: /Ver las que hay que revisar/i }),
    ).toBeInTheDocument()
  })

  /*
   * And it says nothing of the sort when there is nothing to say: a summary that always
   * shows «0 pendientes» teaches people to skip the line where the number lives.
   */
  it('says nothing about merging or reviewing when neither happened', async () => {
    renderScreen()
    await pickFile('name,url,username,password,note\nBanco,https://banco.es,ada,x,')
    await userEvent.click(await screen.findByRole('button', { name: 'Importar 1' }))

    expect(await screen.findByText(/1 entrada importada/i)).toBeInTheDocument()
    expect(screen.queryByText(/se ha unido/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/nadie ha dicho/i)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Ver las que hay que revisar/i }),
    ).not.toBeInTheDocument()
  })
})
