import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { useSession } from '@/lib/session'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import * as deviceCache from '@/lib/vault/deviceCache'
import { cacheItems, cacheVaultKey } from '@/lib/vault/deviceCache'
import { OfflineNotice } from './OfflineNotice'
import type { EncryptedItem, Vault } from '@/lib/vault/types'

/*
 * The banner that says what is on screen came off this device. See ADR-019 §6.2 and
 * issue #466.
 *
 * WHY IT IS TESTED AT ALL, being a banner: because the failure it prevents is silent.
 * Without it the application works, the entry appears and the password copies — and the
 * service rejects it because it was changed on another device three days ago. Nothing
 * fails; somebody just cannot work out why.
 *
 * SO THE TEST THAT MATTERS IS THE ONE THAT CHECKS IT IS **ABSENT** ONLINE. A banner that
 * showed always would be as misleading as no banner at all, and it would look correct in
 * every screenshot.
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

const ITEMS: EncryptedItem[] = [
  {
    id: 'item-1',
    vault_id: 'vault-1',
    ciphertext: 'Y2lmcmFkbw==',
    iv: 'bm9uY2U=',
    version: 2,
    created_at: null,
    updated_at: null,
  },
]

function paint() {
  return render(
    <MemoryRouter>
      <OfflineNotice />
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange

  useSession.setState({
    user: null,
    token: null,
    offline: false,
    rememberedUser: { name: 'Ada', email: EMAIL },
  })

  await cacheVaultKey(EMAIL, VAULT)
  await cacheItems(EMAIL, ITEMS)
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'indexedDB')
})

describe('with an ordinary session', () => {
  it('says nothing at all', () => {
    paint()

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  /*
   * A token means the data came from the server just now. If the banner appeared here it
   * would be claiming the contents are old when they are not, which sends somebody
   * looking for a problem that does not exist.
   */
  it('says nothing even if this device happens to hold a cache', async () => {
    useSession.setState({ token: 'un-token' })

    paint()

    await waitFor(() => expect(screen.queryByText(/copia guardada/)).not.toBeInTheDocument())
  })
})

describe('with an offline session', () => {
  beforeEach(() => {
    useSession.setState({ offline: true })
  })

  it('says the data came off this device', async () => {
    paint()

    expect(await screen.findByRole('status')).toHaveTextContent(/copia guardada en este dispositivo/)
  })

  /*
   * The half that does the work. «You are offline» is a state; a date is what lets
   * somebody decide whether to trust what they are reading.
   */
  it('says when the copy was written', async () => {
    paint()

    const notice = await screen.findByRole('status')

    await waitFor(() => expect(notice).toHaveTextContent(/del \d+ de \w+/))
  })

  it('warns that it may not be up to date', async () => {
    paint()

    expect(await screen.findByRole('status')).toHaveTextContent(/puede no estar al día/)
  })

  /*
   * An offline session has no token, so there is nothing to refresh with: coming back
   * means unlocking again. The button is honest about that by doing exactly what the
   * inactivity lock does.
   */
  it('offers a way back, which locks the vault', async () => {
    useVaultKey.setState({ key: {} as CryptoKey })

    paint()

    await userEvent.click(await screen.findByRole('button', { name: /volver a conectar/i }))

    expect(useSession.getState().offline).toBe(false)
    expect(useVaultKey.getState().key).toBeNull()
  })

  /*
   * THE READ IS ASYNCHRONOUS AND THE ACCOUNT CAN CHANGE WHILE IT IS IN FLIGHT — somebody
   * else unlocking on the same browser, which this instance does have. Writing the answer
   * then would put one account's date under the other's session, and that is precisely
   * the crossing the whole cache is arranged to prevent.
   *
   * THE SESSION STAYS OFFLINE ON PURPOSE. A first version of this test let it go online,
   * and it passed with the guard AND without it: the banner vanishes when `offline` turns
   * false whatever the effect does, so it was measuring the wrong thing. What
   * discriminates is the account changing while the banner is still on screen.
   *
   * The promises are resolved by hand because the race cannot be provoked otherwise: a
   * real read settles before anything can change.
   */
  it('does not show a date belonging to the account that has left', async () => {
    let answerForAda: (value: deviceCache.CachedAccount | null) => void

    /*
     * Grace's read never resolves, and that is what makes this test discriminate. A first
     * version resolved it to null, and null landed AFTER Ada's late answer whatever the
     * effect did — so the end state was the same with the guard and without it, and the
     * test passed both ways. With nothing else ever writing, the only thing that can put
     * a date on screen is Ada's answer arriving where it should not.
     */
    vi.spyOn(deviceCache, 'readCachedAccount').mockImplementation((email) =>
      email === EMAIL
        ? new Promise((resolve) => {
            answerForAda = resolve
          })
        : new Promise(() => {}),
    )

    paint()

    const notice = await screen.findByRole('status')

    // Grace unlocks on this browser, still with no network, before Ada's read comes back.
    useSession.setState({ rememberedUser: { name: 'Grace', email: 'grace@evault.test' } })

    await waitFor(() => expect(notice).toHaveTextContent(/copia guardada/))

    answerForAda!({
      email: EMAIL,
      vault: { id: 'vault-1', wrappedKey: 'k', wrappedKeyIv: 'iv' },
      items: ITEMS,
      savedAt: '2026-01-01T10:00:00Z',
    })

    // The banner is still there — Grace is offline too — but with no date, because the
    // only answer that arrived belonged to somebody who is no longer in this session.
    await waitFor(() => expect(notice).toHaveTextContent(/copia guardada en este dispositivo/))
    expect(notice).not.toHaveTextContent(/enero/)
  })

  /*
   * A device that cached nothing still gets the important half of the sentence. Without
   * this the banner would either not render or render a broken phrase, and both are
   * worse than saying «this came off the device» without a date.
   */
  it('still warns when there is no date to show', async () => {
    useSession.setState({ rememberedUser: { name: 'Grace', email: 'grace@evault.test' } })

    paint()

    const notice = await screen.findByRole('status')

    expect(notice).toHaveTextContent(/copia guardada en este dispositivo/)
    expect(notice).not.toHaveTextContent(/del \d+ de/)
  })
})
