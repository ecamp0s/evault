import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { createQueryClient } from '@/lib/queries'
import { useSession } from '@/lib/session'
import { unpack } from '@/lib/vault/payload'
import { encryptedItem, unlockForTest } from '@/test/vault'
import { ForgetHistory } from './ForgetHistory'
import type { EncryptedItem, HistoryEntry, ItemContent, ItemPayload, Vault } from '@/lib/vault/types'

/*
 * Forgetting the password history of the whole vault. `ADR-018` §2.2 and issue #646.
 *
 * WHAT THIS FILE PROTECTS is what makes the gesture safe to offer at all: that it says
 * how much it is about to destroy BEFORE doing it, that it writes only the entries that
 * have something to forget, that it warns apart where forgetting also decides a conflict,
 * and that a run cut halfway says how many got through. Forgetting cannot be undone, so
 * every one of those is the difference between a tool and a trap.
 */

const EMAIL = 'ada@evault.test'

/*
 * The count is painted with its numbers inside `<strong>`, so it is broken across
 * elements and no plain string matches it. The paragraph is matched whole instead, which
 * is also what somebody reads.
 */
const counted = (_text: string, element: Element | null) =>
  element?.tagName === 'P' && /^Hay \d+ contraseñas? anterior(es)? en \d+ entradas?\.$/.test(element.textContent ?? '')

const VAULT: Vault = {
  id: 'vault-1',
  name: 'Personal',
  is_personal: true,
  role: 'owner',
  wrapped_key: 'clave-envuelta',
  wrapped_key_iv: 'nonce',
}

const retired = (password: string): HistoryEntry => ({
  password,
  date: '2026-01-01T00:00:00.000Z',
  origin: 'rotation',
})

const candidate = (password: string): HistoryEntry => ({
  password,
  date: '2026-02-01T00:00:00.000Z',
  origin: 'import',
})

let key: CryptoKey
let items: EncryptedItem[]
/** The PATCH the screen sends per entry, so the cases can read what it wrote. */
let patch: ReturnType<typeof vi.fn<(url: string, payload: ItemPayload) => Promise<unknown>>>

/** The vault the screen will read, encrypted as the API would return it. */
async function vaultOf(contents: Record<string, ItemContent>) {
  items = []
  for (const [id, content] of Object.entries(contents)) {
    items.push(await encryptedItem(key, id, content))
  }
}

function paint() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <ForgetHistory />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

/** What the screen actually wrote, decrypted, so the assertions are about content. */
async function written() {
  return Promise.all(
    patch.mock.calls.map(async ([url, payload]) => ({
      url,
      content: await unpack(key, { ...payload, id: 'x', vault_id: VAULT.id, created_at: null, updated_at: null }),
    })),
  )
}

beforeEach(async () => {
  key = await unlockForTest()

  useSession.setState({
    user: { id: 1, name: 'Ada', email: EMAIL, created_at: null, has_recovery_key: false },
    token: 'un-token',
    offline: false,
    rememberedUser: { name: 'Ada', email: EMAIL },
  })

  await vaultOf({
    'con-historial': { name: 'GitHub', password: 'la-actual', history: [retired('la-vieja')] },
    'sin-historial': { name: 'Correo', password: 'otra' },
  })

  vi.spyOn(api, 'get').mockImplementation((url: string) =>
    Promise.resolve(
      url === '/vaults' ? { data: { data: { vaults: [VAULT] } } } : { data: { data: { items } } },
    ),
  )

  patch = vi.fn((url: string, payload: ItemPayload) => {
    const id = url.split('/').pop() ?? ''
    return Promise.resolve({
      data: { data: { item: { id, vault_id: VAULT.id, ...payload, created_at: null, updated_at: null } } },
    })
  })
  vi.spyOn(api, 'patch').mockImplementation(patch as never)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('what the screen says before anything happens', () => {
  it('says what the vault is keeping, in entries and in passwords', async () => {
    paint()

    const said = await screen.findByText(counted)

    expect(said).toHaveTextContent('Hay 1 contraseña anterior en 1 entrada.')
  })

  /*
   * `ADR-018` §5.1 is what this sentence comes from, and it is the uncomfortable half:
   * the vault keeps more secrets than its owner put in it, and some were retired because
   * they were compromised. Somebody deciding deserves it on the screen, not in a document.
   */
  it('says why forgetting is worth doing at all', () => {
    paint()

    expect(screen.getByText(/custodia más contraseñas de las que guardaste/)).toBeInTheDocument()
  })

  it('with nothing to forget it says so, and offers nothing', async () => {
    await vaultOf({ limpia: { name: 'GitHub', password: 'la-actual' } })
    paint()

    expect(await screen.findByText(/no hay nada que olvidar/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Olvidar el historial/ })).not.toBeInTheDocument()
  })

  /*
   * THE CONFIRMATION HAS TO CARRY THE NUMBER. A destructive gesture over hundreds of
   * entries confirmed by a bare «¿Seguro?» is a gesture nobody can consent to.
   */
  it('the confirmation says how many entries and how many passwords', async () => {
    await vaultOf({
      una: { name: 'A', password: 'x', history: [retired('v1'), retired('v2')] },
      otra: { name: 'B', password: 'y', history: [retired('v3')] },
    })
    paint()

    await userEvent.click(await screen.findByRole('button', { name: /Olvidar el historial/ }))

    expect(
      screen.getByRole('button', { name: /Olvidar 3 contraseñas de 2 entradas, sin vuelta atrás/ }),
    ).toBeInTheDocument()
  })

  it('backing out of the confirmation writes nothing', async () => {
    paint()

    await userEvent.click(await screen.findByRole('button', { name: /Olvidar el historial/ }))
    await userEvent.click(screen.getByRole('button', { name: 'No olvidar nada' }))

    expect(patch).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Olvidar el historial/ })).toBeInTheDocument()
  })
})

describe('the entries where forgetting is not only forgetting', () => {
  /*
   * A CRITERION OF #646 AND NOT A NICETY. In these entries two managers disagreed and
   * nobody has said which password works (`ADR-022`), so forgetting keeps whichever the
   * entry happens to carry now — which may be the wrong one. It warns; it does not refuse.
   */
  it('warns apart about the entries with a candidate nobody confirmed', async () => {
    await vaultOf({
      rotada: { name: 'A', password: 'x', history: [retired('vieja')] },
      dudosa: { name: 'B', password: 'y', history: [candidate('la-del-otro-gestor')] },
    })
    paint()

    const warning = await screen.findByText(/nadie ha confirmado/)

    expect(warning).toBeInTheDocument()
    expect(warning).toHaveTextContent(/resuélvelas primero/i)
  })

  it('does not warn when every history is a retired password', async () => {
    paint()

    await screen.findByText(counted)
    expect(screen.queryByText(/nadie ha confirmado/)).not.toBeInTheDocument()
  })

  it('warns and still lets it be done: it is the owner\'s vault', async () => {
    await vaultOf({ dudosa: { name: 'B', password: 'y', history: [candidate('la-otra')] } })
    paint()

    await userEvent.click(await screen.findByRole('button', { name: /Olvidar el historial/ }))
    await userEvent.click(screen.getByRole('button', { name: /sin vuelta atrás/ }))

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
  })
})

describe('what it writes', () => {
  it('leaves every history behind and keeps the rest of the entry', async () => {
    paint()

    await userEvent.click(await screen.findByRole('button', { name: /Olvidar el historial/ }))
    await userEvent.click(screen.getByRole('button', { name: /sin vuelta atrás/ }))

    await waitFor(() => expect(patch).toHaveBeenCalled())

    const [{ content }] = await written()
    expect(content).not.toHaveProperty('history')
    expect(content.password).toBe('la-actual')
    expect(content.name).toBe('GitHub')
  })

  /*
   * ONLY WHAT HAS HISTORY, which over 669 entries is the difference between a few writes
   * and hundreds of requests that change nothing — each one a chance for the run to stop
   * halfway for no reason.
   */
  it('does not touch the entries that have nothing to forget', async () => {
    paint()

    await userEvent.click(await screen.findByRole('button', { name: /Olvidar el historial/ }))
    await userEvent.click(screen.getByRole('button', { name: /sin vuelta atrás/ }))

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
    expect((await written())[0].url).toContain('con-historial')
  })

  it('says how many it forgot when it finishes', async () => {
    paint()

    await userEvent.click(await screen.findByRole('button', { name: /Olvidar el historial/ }))
    await userEvent.click(screen.getByRole('button', { name: /sin vuelta atrás/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Listo: se ha olvidado el historial de 1 entrada.',
    )
  })

  /*
   * THE COUNT IS THE MESSAGE WHEN IT BREAKS. Forgetting cannot be undone, so «ha fallado»
   * on its own leaves somebody unable to tell what is left — and running it again has to
   * be stated as safe, because the entries already done have nothing left to forget.
   */
  it('a run cut halfway says how many got through, and that it can be repeated', async () => {
    await vaultOf({
      una: { name: 'A', password: 'x', history: [retired('v1')] },
      otra: { name: 'B', password: 'y', history: [retired('v2')] },
      tercera: { name: 'C', password: 'z', history: [retired('v3')] },
    })
    patch.mockImplementationOnce((_url: string, payload: ItemPayload) =>
      Promise.resolve({
        data: {
          data: {
            item: { id: 'una', vault_id: VAULT.id, ...payload, created_at: null, updated_at: null },
          },
        },
      }),
    ).mockImplementationOnce(() => Promise.reject(new Error('se ha caído la conexión')))
    paint()

    await userEvent.click(await screen.findByRole('button', { name: /Olvidar el historial/ }))
    await userEvent.click(screen.getByRole('button', { name: /sin vuelta atrás/ }))

    const said = await screen.findByRole('alert')
    expect(said).toHaveTextContent('1 de 3')
    expect(said).toHaveTextContent(/puedes volver a intentarlo/)
  })
})

describe('without a connection', () => {
  /*
   * `ADR-019`: offline there are no writes, and the rejection lives in `vault/api.ts`.
   * This screen does not offer the gesture at all, because a button that can only fail is
   * worse than no button — and the notice says what to do instead.
   */
  it('does not offer the gesture, and says why', async () => {
    useSession.setState({ offline: true })
    paint()

    await screen.findByText(counted)

    expect(screen.getByRole('button', { name: /Olvidar el historial/ })).toBeDisabled()
    // The layout's own offline banner says the same words, so the notice is matched by
    // what only it says: what cannot be done and what to do about it.
    expect(screen.getByText(/no se puede escribir en la vault/)).toHaveTextContent(
      /Vuelve a conectar/,
    )
  })
})
