import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { api } from '@/lib/api'
import { createQueryClient } from '@/lib/queries'
import { useSession } from '@/lib/session'
import { unlockForTest, encryptedItem } from '@/test/vault'
import { cacheItems, cacheVaultKey, readCachedAccount } from '@/lib/vault/deviceCache'
import { useOfflinePreference } from '@/lib/vault/offlinePreference'
import { Offline } from './Offline'
import type { EncryptedItem, Vault } from '@/lib/vault/types'

/*
 * Where somebody decides whether this device keeps a copy of their vault. See ADR-019
 * and issue #462.
 *
 * THE TWO PROMISES THIS FILE PROTECTS ARE THE ONES A SWITCH USUALLY BREAKS: that turning
 * it on actually leaves a copy behind, and that turning it off actually takes one away.
 * Both fail silently — a switch that stores nothing looks identical until the day there
 * is no network, and a switch that forgets to delete leaves a vault on a device whose
 * owner believes they removed it.
 */

const EMAIL = 'ada@evault.test'

const VAULT: Vault = {
  id: 'vault-1',
  name: 'Personal',
  is_personal: true,
  role: 'owner',
  wrapped_key: 'clave-envuelta',
  wrapped_key_iv: 'nonce',
}

let items: EncryptedItem[]

function paint() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <Offline />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange

  const key = await unlockForTest()
  items = [await encryptedItem(key, 'item-1', { nombre: 'GitHub' })]

  useSession.setState({
    user: { id: 1, name: 'Ada', email: EMAIL, created_at: null, has_recovery_key: false },
    token: 'un-token',
    offline: false,
    rememberedUser: { name: 'Ada', email: EMAIL },
  })
  useOfflinePreference.setState({ enabled: false })

  vi.spyOn(api, 'get').mockImplementation((url: string) =>
    Promise.resolve(
      url === '/vaults'
        ? { data: { data: { vaults: [VAULT] } } }
        : { data: { data: { items } } },
    ),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'indexedDB')
})

describe('what the screen says before anything is decided', () => {
  it('says what is kept and that it is encrypted', () => {
    paint()

    expect(screen.getByText(/copia guardada aquí/)).toBeInTheDocument()
    expect(screen.getByText(/Se guarda cifrada/)).toBeInTheDocument()
  })

  it('says what it does not let you do', () => {
    paint()

    expect(screen.getByText(/No puedes\s+crear, editar ni borrar/)).toBeInTheDocument()
  })

  /*
   * THE CASE THAT DID NOT ARRIVE, and the only test here written from somebody reading
   * the screen rather than from the code. In #470 a reader who had never seen it came
   * away with «I lose my internet» — the phone's case — and judged the option of little
   * use on the laptop they were on, which is where a server that does not answer is the
   * case that applies MOST. The old text did mention it, trailing at the end of a list.
   *
   * So this asserts the case is stated on its own AND that the screen says what the
   * server is: somebody who did not build eVault has no reason to know it runs on a
   * machine that gets switched off.
   */
  it('says a copy is also for when the server does not answer, and what the server is', () => {
    paint()

    const reason = screen.getByText(/Cuando el servidor no responde/)

    expect(reason).toBeInTheDocument()
    expect(reason).toHaveTextContent(/apagado, reiniciándose o inalcanzable/)
  })

  /*
   * ADR-019 §2: a cached vault takes the rate limiting out of the way. Somebody deciding
   * has to read that next to what they gain, not find it in a document afterwards —
   * which is the difference between a choice and a click.
   */
  it('says what it costs, and not only what it buys', () => {
    paint()

    expect(screen.getByText(/adivinar tu contraseña maestra todas las veces/)).toBeInTheDocument()
  })

  /*
   * A cost with no «so do this» is an alarm the reader cannot act on, which is exactly
   * how the #470 reader described it: read as a recommendation, dressed as a warning.
   * The instruction is the half that turns it back into a decision.
   */
  it('ends the cost with what to do about it', () => {
    paint()

    expect(screen.getByText(/Actívalo si este dispositivo es solo tuyo/)).toBeInTheDocument()
  })

  it('starts off', () => {
    paint()

    expect(screen.getByText(/no guarda ninguna copia/)).toBeInTheDocument()
  })
})

describe('turning it on', () => {
  /*
   * A switch that stores nothing until something else happens to run looks identical to
   * one that works — right up to the first time it matters, which is the one time there
   * is no network to fix it with.
   */
  it('leaves a copy on the device there and then', async () => {
    paint()

    await userEvent.click(screen.getByRole('button', { name: /guardar una copia/i }))

    await waitFor(async () => {
      const cached = await readCachedAccount(EMAIL)

      expect(cached?.items).toHaveLength(1)
      expect(cached?.vault.wrappedKey).toBe(VAULT.wrapped_key)
    })
  })

  it('remembers the decision', async () => {
    paint()

    await userEvent.click(screen.getByRole('button', { name: /guardar una copia/i }))

    await waitFor(() => expect(useOfflinePreference.getState().enabled).toBe(true))
  })

  /*
   * The preference stays on when the seeding fails: what failed is the copy, not the
   * decision, and the next successful read fills it. Turning the switch back off quietly
   * would be describing something that did not happen.
   */
  it('keeps the decision when the copy could not be made', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('sin red'))

    paint()

    await userEvent.click(screen.getByRole('button', { name: /guardar una copia/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se ha podido guardar la copia/i)
    expect(useOfflinePreference.getState().enabled).toBe(true)
  })

  it('cannot be turned on while there is no connection', () => {
    useSession.setState({ offline: true })

    paint()

    expect(screen.getByRole('button', { name: /guardar una copia/i })).toBeDisabled()
    expect(screen.getByText(/no hay conexión/i)).toBeInTheDocument()
  })
})

describe('turning it off', () => {
  beforeEach(async () => {
    useOfflinePreference.setState({ enabled: true })
    await cacheVaultKey(EMAIL, VAULT)
    await cacheItems(EMAIL, items)
  })

  /*
   * The half that would be worst to get wrong. Somebody turning this off is saying «take
   * my vault off this device», and leaving it there means an encrypted vault sitting on a
   * machine whose owner believes they removed it.
   */
  it('takes the copy off the device', async () => {
    paint()

    expect(await readCachedAccount(EMAIL)).not.toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /dejar de guardar/i }))

    await waitFor(async () => expect(await readCachedAccount(EMAIL)).toBeNull())
  })

  it('says the device is holding one before it is turned off', () => {
    paint()

    expect(screen.getByText(/guarda una copia de tu vault/)).toBeInTheDocument()
  })
})

describe('a browser that cannot store anything', () => {
  it('says so instead of offering a switch that would do nothing', () => {
    Reflect.deleteProperty(globalThis, 'indexedDB')

    paint()

    expect(screen.getByText(/no permite guardar nada/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /guardar una copia/i })).toBeDisabled()
  })
})
