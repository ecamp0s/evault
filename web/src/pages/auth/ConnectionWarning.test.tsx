import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { cacheItems, cacheVaultKey } from '@/lib/vault/deviceCache'
import { ConnectionWarning } from './ConnectionWarning'
import type { EncryptedItem, Vault } from '@/lib/vault/types'

/*
 * What the unlock screen says when the server does not answer. See issue #492.
 *
 * WHY IT EXISTS AT ALL, and it was found by using the application rather than by any
 * test: with kastor stopped, `/unlock` said nothing. Somebody typed their master password
 * with no idea whether it would achieve anything, and only found out they were offline
 * once they were already inside.
 *
 * THE HALF THAT DECIDES SOMETHING is not «there is no connection» — it is whether this
 * device holds a copy. Without a copy, typing is wasted effort, and saying so is the
 * whole point of the screen.
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

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange

  useSession.setState({
    user: null,
    token: null,
    offline: false,
    rememberedUser: { name: 'Ada', email: EMAIL },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'indexedDB')
})

describe('when the server answers', () => {
  beforeEach(() => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { status: 'ok' } })
  })

  /*
   * A screen that announces its normal state is noise, and noise stops being read — which
   * would take the one warning that matters down with it.
   */
  it('says nothing', async () => {
    render(<ConnectionWarning />)

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('says nothing even when this device holds a copy', async () => {
    await cacheVaultKey(EMAIL, VAULT)
    await cacheItems(EMAIL, ITEMS)

    render(<ConnectionWarning />)

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })
})

describe('when the server does not answer', () => {
  beforeEach(() => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('sin red'))
  })

  it('says so, and that unlocking is still worth it, when there is a copy', async () => {
    await cacheVaultKey(EMAIL, VAULT)
    await cacheItems(EMAIL, ITEMS)

    render(<ConnectionWarning />)

    const notice = await screen.findByRole('status')

    expect(notice).toHaveTextContent(/No hay conexión con el servidor/)
    expect(notice).toHaveTextContent(/Puedes desbloquear igualmente/)
  })

  /*
   * THE ONE THAT SAVES SOMEBODY THE TROUBLE. With no copy there is nothing to open, so
   * the screen has to say that instead of letting a password be typed into a form that
   * cannot do anything with it.
   */
  it('says not to bother when there is no copy', async () => {
    render(<ConnectionWarning />)

    const notice = await screen.findByRole('status')

    expect(notice).toHaveTextContent(/no guarda ninguna copia/)
    expect(notice).toHaveTextContent(/No vas a poder entrar/)
  })

  /*
   * Half a record opens nothing, so it is not a copy. Saying «you can unlock anyway»
   * over one would send somebody to a decryption failure with no explanation.
   */
  it('does not count half a cached record as a copy', async () => {
    await cacheVaultKey(EMAIL, VAULT)

    render(<ConnectionWarning />)

    expect(await screen.findByRole('status')).toHaveTextContent(/no guarda ninguna copia/)
  })
})

describe('what it must never do', () => {
  /*
   * The probe is a request, and a request can be slow. If the form waited for it, a
   * server that answers late would be worse than one that does not answer at all.
   */
  it('paints nothing while it is still asking', () => {
    vi.spyOn(api, 'get').mockReturnValue(new Promise(() => {}) as never)

    render(<ConnectionWarning />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  /*
   * `navigator.onLine` says whether the device is attached to a network, not whether
   * kastor answers. A machine reporting itself online with nothing behind it is exactly
   * the case this screen exists for, so the answer must come from the probe.
   */
  it('warns even when the browser believes it is online', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    vi.spyOn(api, 'get').mockRejectedValue(new Error('sin red'))

    render(<ConnectionWarning />)

    expect(await screen.findByRole('status')).toBeInTheDocument()
  })
})
