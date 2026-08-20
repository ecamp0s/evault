import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { ImportDialog } from './ImportDialog'
import { createQueryClient } from '@/lib/queries'
import { api } from '@/lib/api'
import * as vaultApi from '@/lib/vault/api'
import { unlockForTest } from '@/test/vault'
import type { Item } from '@/lib/vault/types'

const CHROME = `name,url,username,password,note
GitHub,https://github.com,ada,secreto-del-fichero,la del trabajo
Banco,https://banco.es,0001,otra-mas,`

function fileWith(fileContent: string, fileName = 'passwords.csv'): File {
  return new File([fileContent], fileName, { type: 'text/csv' })
}

function renderScreen(items: Item[] = []) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ImportDialog vaultId="vault-1" items={items} onClose={() => {}} />
    </QueryClientProvider>,
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
    await pickFile(
      'name,login_username,login_password,login_totp\nGitHub,ada,secreto,JBSWY3DPEHPK3PXP',
    )

    expect(await screen.findByText(/se guardarán dentro de las notas/i)).toBeInTheDocument()
    expect(screen.getByText(/login_totp/)).toBeInTheDocument()
  })

  /*
   * Duplicates are flagged and left out by default, but the decision is the user's: the
   * detection is a heuristic over name and username, and erring towards merging loses
   * data.
   */
  it('leaves out the ones that already look present, and allows putting them back', async () => {
    const alreadyThere: Item = {
      id: '1',
      vaultId: 'vault-1',
      content: { nombre: 'GitHub', usuario: 'ada' },
      createdAt: null,
      updatedAt: null,
    }

    renderScreen([alreadyThere])
    await pickFile(CHROME)

    expect(await screen.findByText(/parece que ya está/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Importar 1' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox'))

    expect(screen.getByRole('button', { name: 'Importar 2' })).toBeInTheDocument()
  })

  it('explains what to do when it does not recognise the file', async () => {
    renderScreen()
    await pickFile('una,cosa\n1,2')

    expect(await screen.findByText(/no reconocemos este fichero/i)).toBeInTheDocument()
  })
})

describe('importing', () => {
  it('writes one entry for each one selected', async () => {
    const createMutation = vi.spyOn(vaultApi, 'createItem').mockResolvedValue({
      id: 'x',
      vaultId: 'vault-1',
      content: { nombre: 'X' },
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
        content: { nombre: 'X' },
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
