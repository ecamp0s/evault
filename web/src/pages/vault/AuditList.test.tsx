import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { unlockForTest, encryptedItem as encryptItem } from '@/test/vault'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import type { EncryptedItem, ItemContent, Vault } from '@/lib/vault/types'
import { confirmCurrent } from '@/lib/vault/history'
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
      await encryptedItem({ name: 'Banco', password: 'corta' }),
      await encryptedItem({ name: 'Correo', password: CLEAN }),
      // No password: nothing to audit, and it must not swell the denominator.
      await encryptedItem({ name: 'Una nota', notes: 'sin contraseña' }),
    ])

    renderScreen()

    expect(await screen.findByText(/de tus 2 contraseñas/)).toBeInTheDocument()
  })

  it('says so plainly when there is nothing to correct', async () => {
    apiReturning([await encryptedItem({ name: 'Correo', password: CLEAN })])

    renderScreen()

    expect(await screen.findByText(/Ninguna de tus 1 contraseñas/)).toBeInTheDocument()
  })

  it('says something else when there are no passwords at all', async () => {
    apiReturning([await encryptedItem({ name: 'Una nota', notes: 'sin contraseña' })])

    renderScreen()

    expect(await screen.findByText(/Todavía no hay contraseñas que revisar/)).toBeInTheDocument()
  })
})

describe('the findings', () => {
  it('groups them by problem and counts each group', async () => {
    apiReturning([
      await encryptedItem({ name: 'Banco', password: CLEAN }),
      await encryptedItem({ name: 'Correo', password: CLEAN }),
      await encryptedItem({ name: 'Foro', password: 'solominusculas' }),
    ])

    renderScreen()

    expect(await screen.findByRole('heading', { name: /Repetidas/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /De un solo tipo/ })).toBeInTheDocument()
  })

  it('leaves out the groups with nothing in them', async () => {
    apiReturning([await encryptedItem({ name: 'Foro', password: 'solominusculas' })])

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
      await encryptedItem({ name: 'Banco', password: CLEAN }),
      await encryptedItem({ name: 'Correo', password: CLEAN }),
      await encryptedItem({ name: 'Foro', password: CLEAN }),
    ])

    renderScreen()

    expect(await screen.findAllByText('la comparten 3')).toHaveLength(3)
  })
})

/**
 * IT PAINTS THE FIRST FEW AND NOT ALL OF THEM, which is #450: over 370 entries with the
 * real vault's proportion of findings the screen painted 738 rows and 4028 DOM nodes,
 * seven times the list behind it — undoing by another door what the Iteration 11 bought.
 *
 * The information is not cut, only the DOM: everything is one click away.
 */
describe('how much it paints at once', () => {
  /** `count` entries sharing a password, so they all land in the repeated section. */
  const sharing = async (count: number) =>
    Promise.all(
      Array.from({ length: count }, () =>
        encryptedItem({ name: `Entrada ${nextId + 1}`, password: 'la-misma-en-todo' }),
      ),
    )

  it('shows the first twenty and offers the rest', async () => {
    apiReturning(await sharing(25))

    renderScreen()
    await screen.findByRole('heading', { name: /Repetidas/ })

    expect(screen.getAllByRole('button', { name: /Entrada/ })).toHaveLength(20)
    expect(screen.getByRole('button', { name: 'Ver 5 más' })).toBeInTheDocument()
  })

  it('shows them all once asked, because nothing is being hidden', async () => {
    apiReturning(await sharing(25))

    const user = userEvent.setup()

    renderScreen()
    await screen.findByRole('heading', { name: /Repetidas/ })
    await user.click(screen.getByRole('button', { name: 'Ver 5 más' }))

    expect(screen.getAllByRole('button', { name: /Entrada/ })).toHaveLength(25)
  })

  it('offers nothing when everything already fits', async () => {
    apiReturning(await sharing(3))

    renderScreen()
    await screen.findByRole('heading', { name: /Repetidas/ })

    expect(screen.queryByRole('button', { name: /Ver \d+ más/ })).not.toBeInTheDocument()
  })

  /*
   * WHICH TWENTY IS THE PART THAT MATTERS. With only the first few on screen, changing a
   * password that 41 entries share is worth twenty times changing one that two do — and
   * the real vault has a group of 41.
   */
  it('puts the most shared passwords first', async () => {
    apiReturning([
      await encryptedItem({ name: 'Poco', password: 'compartida-por-dos' }),
      await encryptedItem({ name: 'Poco otra', password: 'compartida-por-dos' }),
      await encryptedItem({ name: 'Mucho A', password: 'compartida-por-tres' }),
      await encryptedItem({ name: 'Mucho B', password: 'compartida-por-tres' }),
      await encryptedItem({ name: 'Mucho C', password: 'compartida-por-tres' }),
    ])

    renderScreen()
    await screen.findByRole('heading', { name: /Repetidas/ })

    const filas = screen.getAllByRole('button', { name: /(Poco|Mucho)/ })

    expect(filas.slice(0, 3).map((one) => one.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('Mucho')]),
    )
    expect(filas[0].textContent).toContain('Mucho')
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
      await encryptedItem({ name: 'Banco', password: secreta }),
      await encryptedItem({ name: 'Correo', password: secreta }),
    ])

    renderScreen()
    await screen.findByRole('heading', { name: /Repetidas/ })

    expect(document.body.textContent).not.toContain(secreta)
  })

  it('does not show the password of a weak entry either', async () => {
    apiReturning([await encryptedItem({ name: 'Foro', password: 'solominusculas' })])

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
    apiReturning([await encryptedItem({ name: 'Foro', password: 'solominusculas' })])

    const user = userEvent.setup()

    renderScreen()
    await user.click(await screen.findByRole('button', { name: /Foro/ }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generar una contraseña' })).toBeInTheDocument()
  })
})

/*
 * THE SCREEN, NOT THE FUNCTION. `auditPasswords` leaving cards and notes out is tested
 * next to it; what this checks is that nothing downstream puts them back — the headline
 * counts over `withPassword`, and the rows come from `flagged`.
 *
 * It matters because the failure would be quiet and flattering: a vault with fifty
 * notes in it would report a smaller proportion of bad passwords without a single
 * password having changed, and a screen that reports progress nobody made is worse than
 * one that reports nothing.
 */
describe('what the review does with the other kinds of entry', () => {
  it('does not list a card or a note among the findings', async () => {
    apiReturning([
      await encryptedItem({ name: 'Repetida A', password: 'corta' }),
      await encryptedItem({ name: 'Repetida B', password: 'corta' }),
      await encryptedItem({ name: 'Mi tarjeta', type: 'card', number: '4111111111111111' }),
      await encryptedItem({ name: 'Mi nota', type: 'note', notes: 'lo que sea' }),
    ])

    renderScreen()

    /*
     * `findAll` and not `find`: a flagged entry is listed once per problem it has, and
     * this one has three. Asking for a single element is what a first version of this
     * test did, and it failed on the app being right.
     */
    expect(await screen.findAllByText('Repetida A')).not.toHaveLength(0)
    expect(screen.queryByText('Mi tarjeta')).not.toBeInTheDocument()
    expect(screen.queryByText('Mi nota')).not.toBeInTheDocument()
  })

  /*
   * The denominator said out loud. With two of the four entries carrying a password, the
   * headline has to talk about two and not about four.
   */
  it('counts the headline over the entries with a password, not over the vault', async () => {
    apiReturning([
      await encryptedItem({ name: 'Repetida A', password: 'corta' }),
      await encryptedItem({ name: 'Repetida B', password: 'corta' }),
      await encryptedItem({ name: 'Mi tarjeta', type: 'card', number: '4111111111111111' }),
      await encryptedItem({ name: 'Mi nota', type: 'note', notes: 'lo que sea' }),
    ])

    renderScreen()

    expect(await screen.findByText(/de tus 2 contraseñas/)).toBeInTheDocument()
  })

  /*
   * And a vault with nothing but cards and notes is not a vault with perfect passwords:
   * it is one with nothing to audit, which the screen already knows how to say.
   */
  it('says there is nothing to audit when no entry has a password', async () => {
    apiReturning([
      await encryptedItem({ name: 'Mi tarjeta', type: 'card', number: '4111111111111111' }),
      await encryptedItem({ name: 'Mi nota', type: 'note', notes: 'lo que sea' }),
    ])

    renderScreen()

    expect(await screen.findByText(/Todavía no hay contraseñas que revisar/)).toBeInTheDocument()
  })
})

/*
 * The entries two managers disagreed about, which #622 put on this screen APART from the
 * three findings about passwords.
 */
describe('the undecided entries', () => {
  const undecided: ItemContent = {
    name: 'GitHub',
    username: 'ada',
    password: CLEAN,
    history: [{ password: 'de-otro-gestor', date: '2026-02-07T00:00:00.000Z', origin: 'import' }],
  }

  /*
   * First, before the findings about passwords: resolving one can change which password
   * the entry carries, and with it what the sections below say.
   */
  it('lists them in a section of their own, before the findings about passwords', async () => {
    apiReturning([
      await encryptedItem(undecided),
      await encryptedItem({ name: 'Foro', password: 'corta' }),
    ])

    renderScreen()

    const headings = await screen.findAllByRole('heading', { level: 2 })

    expect(headings[0]).toHaveTextContent(/Sin decidir/)
    expect(headings[0]).toHaveTextContent('(1)')
  })

  /*
   * The headline is a proportion over passwords and this is not something wrong with a
   * password, so it gets its own sentence — and the headline keeps saying that the one
   * password there is fine.
   */
  it('says how many are undecided apart from the headline, which it leaves alone', async () => {
    apiReturning([await encryptedItem(undecided)])

    renderScreen()

    expect(await screen.findByText(/Ninguna de tus 1 contraseñas tiene nada que corregir/)).toBeInTheDocument()
    expect(screen.getByText(/una entrada tiene dos contraseñas y nadie ha dicho cuál vale/)).toBeInTheDocument()
  })

  it('shows neither the section nor the sentence when nothing is undecided', async () => {
    apiReturning([
      await encryptedItem({
        ...undecided,
        history: [{ password: 'la-vieja', date: '2026-01-03T00:00:00.000Z', origin: 'rotation' }],
      }),
    ])

    renderScreen()

    expect(await screen.findByText(/Ninguna de tus 1 contraseñas/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Sin decidir/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/nadie ha dicho cuál vale/)).not.toBeInTheDocument()
  })

  /*
   * THE WHOLE LOOP OF #621 AND #622, end to end on this screen: the row opens the editor,
   * the current password is confirmed there, and the entry leaves the section by itself —
   * the saved item replaces the listed one, and the audit is worked out again from the list.
   */
  it('lets the entry be resolved from its row, after which it leaves the section', async () => {
    apiReturning([await encryptedItem(undecided)])
    vi.spyOn(api, 'patch').mockResolvedValue({
      data: { data: { item: await encryptItem(vaultKey, 'item-1', confirmCurrent(undecided), VAULT.id) } },
    })

    const user = userEvent.setup()

    renderScreen()
    await user.click(await screen.findByRole('button', { name: /GitHub/ }))
    await user.click(await screen.findByRole('button', { name: /La actual es la buena/ }))

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /Sin decidir/ })).not.toBeInTheDocument(),
    )
  })
})
