import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { unlockForTest, encryptedItem as encryptItem } from '@/test/vault'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import type { EncryptedItem, ItemContent, Vault } from '@/lib/vault/types'
import { AuditList } from './AuditList'

const VAULT: Vault = {
  id: 'vault-1',
  name: 'Personal',
  is_personal: true,
  role: 'owner',
  wrapped_key: 'clave-envuelta-de-prueba',
  wrapped_key_iv: 'nonce-de-prueba',
}

/** A password with nothing to report, so only the case under test flags anything. */
const CLEAN = 'Abcdef23456!xyz'

let vaultKey: CryptoKey
let nextId = 0

function encryptedItem(content: ItemContent): Promise<EncryptedItem> {
  nextId += 1

  return encryptItem(vaultKey, `item-${nextId}`, content, VAULT.id)
}

function apiReturning(items: EncryptedItem[]) {
  return vi.spyOn(api, 'get').mockImplementation((url: string) =>
    url === '/vaults'
      ? Promise.resolve({ data: { data: { vaults: [VAULT] } } })
      : Promise.resolve({ data: { data: { items } } }),
  )
}

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <AuditList />
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  vaultKey = await unlockForTest()
  nextId = 0
  vi.restoreAllMocks()
})

describe('the headline', () => {
  it('says how many entries have something to correct, over the ones with a password', async () => {
    apiReturning([
      await encryptedItem({ nombre: 'Banco', password: 'corta' }),
      await encryptedItem({ nombre: 'Correo', password: CLEAN }),
      // No password: nothing to audit, and it must not swell the denominator.
      await encryptedItem({ nombre: 'Una nota', notas: 'sin contraseña' }),
    ])

    renderScreen()

    expect(await screen.findByText(/de tus 2 contraseñas/)).toBeInTheDocument()
  })

  it('says so plainly when there is nothing to correct', async () => {
    apiReturning([await encryptedItem({ nombre: 'Correo', password: CLEAN })])

    renderScreen()

    expect(await screen.findByText(/Ninguna de tus 1 contraseñas/)).toBeInTheDocument()
  })

  it('says something else when there are no passwords at all', async () => {
    apiReturning([await encryptedItem({ nombre: 'Una nota', notas: 'sin contraseña' })])

    renderScreen()

    expect(await screen.findByText(/Todavía no hay contraseñas que revisar/)).toBeInTheDocument()
  })
})

describe('the findings', () => {
  it('groups them by problem and counts each group', async () => {
    apiReturning([
      await encryptedItem({ nombre: 'Banco', password: CLEAN }),
      await encryptedItem({ nombre: 'Correo', password: CLEAN }),
      await encryptedItem({ nombre: 'Foro', password: 'solominusculas' }),
    ])

    renderScreen()

    expect(await screen.findByRole('heading', { name: /Repetidas/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /De un solo tipo/ })).toBeInTheDocument()
  })

  it('leaves out the groups with nothing in them', async () => {
    apiReturning([await encryptedItem({ nombre: 'Foro', password: 'solominusculas' })])

    renderScreen()

    await screen.findByRole('heading', { name: /De un solo tipo/ })
    expect(screen.queryByRole('heading', { name: /Repetidas/ })).not.toBeInTheDocument()
  })

  /*
   * IT SAYS HOW MANY SHARE IT, which is what turns «repetida» into something with a
   * size: changing one that four entries share is worth more than one that two do.
   */
  it('says how many entries share a repeated password', async () => {
    apiReturning([
      await encryptedItem({ nombre: 'Banco', password: CLEAN }),
      await encryptedItem({ nombre: 'Correo', password: CLEAN }),
      await encryptedItem({ nombre: 'Foro', password: CLEAN }),
    ])

    renderScreen()

    expect(await screen.findAllByText('la comparten 3')).toHaveLength(3)
  })
})

/**
 * NO PASSWORD IS EVER PAINTED, and this is the guarantee #421 could not hold — it lives
 * where the painting happens.
 *
 * The vault is open, so an attacker sitting at this screen already has everything. But
 * somebody looking over a shoulder does not, and a screen whose entire job is to group
 * passwords BY EQUALITY is exactly where that distinction gets lost by accident.
 */
describe('what it never shows', () => {
  it('says four entries share a password without saying which one', async () => {
    const secreta = 'la-que-repito-en-todo'

    apiReturning([
      await encryptedItem({ nombre: 'Banco', password: secreta }),
      await encryptedItem({ nombre: 'Correo', password: secreta }),
    ])

    renderScreen()
    await screen.findByRole('heading', { name: /Repetidas/ })

    expect(document.body.textContent).not.toContain(secreta)
  })

  it('does not show the password of a weak entry either', async () => {
    apiReturning([await encryptedItem({ nombre: 'Foro', password: 'solominusculas' })])

    renderScreen()
    await screen.findByRole('heading', { name: /De un solo tipo/ })

    expect(document.body.textContent).not.toContain('solominusculas')
  })
})

/*
 * THE SAME THREE STATES AS THE LIST, and in the same order. A locked vault arrives as a
 * query failure exactly like a downed network and is NOT one: without its own branch
 * this screen would invite checking the connection when the connection is fine and what
 * is missing is the master password.
 */
describe('when there is nothing to audit yet', () => {
  it('offers to sign in again when the vault is locked, instead of blaming the network', async () => {
    vi.spyOn(api, 'get').mockImplementation((url: string) =>
      url === '/vaults'
        ? Promise.resolve({ data: { data: { vaults: [VAULT] } } })
        : Promise.resolve({ data: { data: { items: [] } } }),
    )
    useVaultKey.getState().forget()

    renderScreen()

    expect(await screen.findByText(/Tu vault está bloqueada/i)).toBeInTheDocument()
  })

  it('offers to retry when the request fails for real', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('la red'))

    renderScreen()

    expect(await screen.findByRole('button', { name: /reintentar/i })).toBeInTheDocument()
  })
})

/*
 * A list that names the problem and leaves finding the entry to the reader is an
 * accusation and not a tool — and over 370 entries, finding it again is the expensive
 * part. The row opens the entry with the generator already inside it.
 */
describe('the way to fix it', () => {
  it('opens the entry from its row', async () => {
    apiReturning([await encryptedItem({ nombre: 'Foro', password: 'solominusculas' })])

    const user = userEvent.setup()

    renderScreen()
    await user.click(await screen.findByRole('button', { name: /Foro/ }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generar una contraseña' })).toBeInTheDocument()
  })
})
