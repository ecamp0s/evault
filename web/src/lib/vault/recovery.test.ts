import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '@/lib/api'
import { createRecoveryKey, recoverAccess } from './recovery'
import { generateRecoveryKey } from './recoveryKey'
import {
  createVaultKey,
  decrypt,
  DecryptionError,
  deriveKeys,
  deriveRecoveryKeys,
  encrypt,
  openVaultKey,
  wrapVaultKeyForRecovery,
  type DerivedKeys,
  type Encrypted,
} from './crypto'
import type { Vault } from './types'

/*
 * Este fichero cubre recovery.ts, que estaba a CERO de 23 sentencias hasta el issue
 * 218 — ni createRecoveryKey ni recoverAccess se ejecutaban en ningún test. Sus
 * pantallas sí estaban cubiertas, y Recover.tsx marcaba 100 %: una pantalla al 100 %
 * encima de un módulo al 0 % es la forma que tiene este fallo de esconderse.
 *
 * Es el peor sitio del proyecto para no tener cobertura. recoverAccess es el SEGUNDO
 * camino completo a la vault, y se usa el día que ya no queda otro: quien llega ahí
 * ha perdido la contraseña maestra, así que si falla no hay plan B. Es pérdida
 * definitiva por diseño (ADR-001 §5.1).
 *
 * Lo que ya está probado en recoveryKey.test.ts no se repite aquí: la generación, el
 * parseo, el carácter de comprobación y la derivación. Lo de aquí son los dos flujos
 * completos y lo que sale por el cable.
 *
 * Se mockea solo axios; la criptografía es real. Las derivaciones de contraseña son
 * 600.000 iteraciones y se hacen una vez en beforeAll; las de la clave de
 * recuperación son HKDF y son baratas, así que van por test.
 */

const EMAIL = 'ada@evault.test'
const MASTER = 'la contraseña maestra de siempre'
const NEW_MASTER = 'la contraseña que se elige al recuperar'
const WRONG = 'esta no es la contraseña buena'

let master: DerivedKeys
let renewed: DerivedKeys

beforeAll(async () => {
  master = await deriveKeys(MASTER, EMAIL)
  renewed = await deriveKeys(NEW_MASTER, EMAIL)
}, 30_000)

afterEach(() => {
  vi.restoreAllMocks()
})

/** Un vault con su clave envuelta de verdad por la clave maestra. */
async function vaultOf(id: string): Promise<{ vault: Vault; vaultKey: CryptoKey }> {
  const { vaultKey, wrapped } = await createVaultKey(master.masterKey)

  return {
    vaultKey,
    vault: {
      id,
      name: `vault ${id}`,
      is_personal: true,
      role: 'owner',
      wrapped_key: wrapped.data,
      wrapped_key_iv: wrapped.iv,
    },
  }
}

function serveVaults(vaults: Vault[]) {
  return vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { vaults } } })
}

interface RegistrationBody {
  recovery_auth_hash: string
  wrapped_keys: {
    vault_id: string
    recovery_wrapped_key: string
    recovery_wrapped_key_iv: string
  }[]
}

describe('registrar una clave de recuperación', () => {
  it('envuelve la clave de cada vault, no solo la del primero', async () => {
    /*
     * El comentario del módulo dice por qué esto importa: «una vault sin envoltorio
     * de recuperación es una vault que la clave no abriría el día que hiciera falta».
     */
    const first = await vaultOf('vault-1')
    const second = await vaultOf('vault-2')
    serveVaults([first.vault, second.vault])
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} })

    await createRecoveryKey(EMAIL, MASTER)

    const body = post.mock.calls[0]?.[1] as RegistrationBody
    expect(body.wrapped_keys.map((entry) => entry.vault_id)).toEqual(['vault-1', 'vault-2'])
  })

  it('la clave que se entrega al usuario es la que abre el envoltorio registrado', async () => {
    const { vault, vaultKey } = await vaultOf('vault-1')
    const secret = 'una credencial que la clave de recuperación tiene que poder rescatar'
    const stored = await encrypt(vaultKey, secret)
    serveVaults([vault])
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} })

    const generated = await createRecoveryKey(EMAIL, MASTER)

    const body = post.mock.calls[0]?.[1] as RegistrationBody
    const wrapped: Encrypted = {
      data: body.wrapped_keys[0]!.recovery_wrapped_key,
      iv: body.wrapped_keys[0]!.recovery_wrapped_key_iv,
    }

    // Se recorre el camino del usuario: de los bytes del papel a descifrar un item.
    const { wrapKey } = await deriveRecoveryKeys(generated.bytes, EMAIL)
    const recovered = await openVaultKey(wrapKey, wrapped)
    await expect(decrypt(recovered, stored)).resolves.toBe(secret)
  })

  it('al servidor viajan el hash y los blobs, nunca la clave ni la contraseña', async () => {
    const { vault } = await vaultOf('vault-1')
    serveVaults([vault])
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} })

    const generated = await createRecoveryKey(EMAIL, MASTER)

    const body = post.mock.calls[0]?.[1] as RegistrationBody
    const { authHash } = await deriveRecoveryKeys(generated.bytes, EMAIL)
    expect(body.recovery_auth_hash).toBe(authHash)

    /*
     * Buscadas en el cuerpo entero y no en los campos donde se esperarían, igual que
     * en masterPassword.test.ts: un campo nuevo que las llevara por descuido pasaría
     * cualquier aserción campo a campo. Y la clave se busca en sus dos formas,
     * porque la que ve el usuario lleva guiones y la de dentro no.
     */
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain(MASTER)
    expect(serialized).not.toContain(generated.formatted)
    expect(serialized).not.toContain(generated.formatted.replaceAll('-', ''))
  })

  it('con la contraseña maestra equivocada no envía ninguna petición', async () => {
    const { vault } = await vaultOf('vault-1')
    serveVaults([vault])
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} })

    await expect(createRecoveryKey(EMAIL, WRONG)).rejects.toThrow(DecryptionError)

    // El envolvido ocurre entero antes de mandar nada, igual que en #59.
    expect(post).not.toHaveBeenCalled()
  })

  it('un fallo del servidor llega como ApiError', async () => {
    const { vault } = await vaultOf('vault-1')
    serveVaults([vault])
    vi.spyOn(api, 'post').mockRejectedValue(
      Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        response: { status: 500, data: { message: 'Algo ha ido mal' } },
      }),
    )

    await expect(createRecoveryKey(EMAIL, MASTER)).rejects.toBeInstanceOf(ApiError)
  })
})

/** Prepara el escenario de una recuperación: el envoltorio que el servidor devolvería. */
async function recoverableVault(id = 'vault-1') {
  const { vault, vaultKey } = await vaultOf(id)
  const generated = generateRecoveryKey()
  const { wrapKey, authHash } = await deriveRecoveryKeys(generated.bytes, EMAIL)
  const wrapped = await wrapVaultKeyForRecovery(
    master.masterKey,
    { data: vault.wrapped_key, iv: vault.wrapped_key_iv },
    wrapKey,
  )

  return {
    generated,
    authHash,
    vaultKey,
    entry: {
      vault_id: id,
      recovery_wrapped_key: wrapped.data,
      recovery_wrapped_key_iv: wrapped.iv,
    },
  }
}

interface CompletionBody {
  password: string
  wrapped_keys: { vault_id: string; wrapped_key: string; wrapped_key_iv: string }[]
}

describe('recuperar el acceso', () => {
  it('recupera la MISMA clave de vault, no crea una nueva', async () => {
    /*
     * Es la garantía de ADR-010: se recupera el acceso a lo que hay, no se empieza de
     * cero. Se comprueba descifrando un item cifrado antes de la recuperación.
     */
    const scenario = await recoverableVault()
    const secret = 'lo que había dentro antes de perder la contraseña'
    const stored = await encrypt(scenario.vaultKey, secret)

    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce({
        data: { data: { wrapped_keys: [scenario.entry], token: 'token-de-un-solo-uso' } },
      })
      .mockResolvedValueOnce({ data: {} })

    await recoverAccess(EMAIL, scenario.generated.bytes, NEW_MASTER)

    const body = post.mock.calls[1]?.[1] as CompletionBody
    const rewrapped: Encrypted = {
      data: body.wrapped_keys[0]!.wrapped_key,
      iv: body.wrapped_keys[0]!.wrapped_key_iv,
    }
    const reopened = await openVaultKey(renewed.masterKey, rewrapped)
    await expect(decrypt(reopened, stored)).resolves.toBe(secret)
  })

  it('la primera petición manda el hash de la clave y nunca la clave', async () => {
    const scenario = await recoverableVault()
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce({
        data: { data: { wrapped_keys: [scenario.entry], token: 'token-de-un-solo-uso' } },
      })
      .mockResolvedValueOnce({ data: {} })

    await recoverAccess(EMAIL, scenario.generated.bytes, NEW_MASTER)

    const body = post.mock.calls[0]?.[1] as { email: string; recovery_auth_hash: string }
    expect(body.recovery_auth_hash).toBe(scenario.authHash)
    expect(JSON.stringify(body)).not.toContain(scenario.generated.formatted.replaceAll('-', ''))
  })

  it('el paso final va con el token de un solo uso y no con el de la sesión', async () => {
    /*
     * La cabecera explícita es lo único que hace que esa petición sea alcanzable: el
     * token de recuperación no lleva la capacidad `*`, así que EnsureRecoveryToken lo
     * acepta y el interceptor de sesión no serviría. Sin esta cabecera, recuperar
     * falla justo en el último paso, con la contraseña nueva ya elegida.
     */
    const scenario = await recoverableVault()
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce({
        data: { data: { wrapped_keys: [scenario.entry], token: 'token-de-un-solo-uso' } },
      })
      .mockResolvedValueOnce({ data: {} })

    await recoverAccess(EMAIL, scenario.generated.bytes, NEW_MASTER)

    const config = post.mock.calls[1]?.[2] as { headers: Record<string, string> }
    expect(config.headers.Authorization).toBe('Bearer token-de-un-solo-uso')
  })

  it('la contraseña nueva viaja como hash y no en claro', async () => {
    const scenario = await recoverableVault()
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce({
        data: { data: { wrapped_keys: [scenario.entry], token: 'token-de-un-solo-uso' } },
      })
      .mockResolvedValueOnce({ data: {} })

    await recoverAccess(EMAIL, scenario.generated.bytes, NEW_MASTER)

    const body = post.mock.calls[1]?.[1] as CompletionBody
    expect(body.password).toBe(renewed.authHash)
    expect(JSON.stringify(body)).not.toContain(NEW_MASTER)
  })

  it('si el servidor rechaza la clave, no se llega a derivar ni a pedir nada más', async () => {
    const post = vi.spyOn(api, 'post').mockRejectedValue(
      Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        response: { status: 422, data: { message: 'No se ha podido recuperar el acceso' } },
      }),
    )

    await expect(
      recoverAccess(EMAIL, generateRecoveryKey().bytes, NEW_MASTER),
    ).rejects.toBeInstanceOf(ApiError)

    // Una sola llamada: la que falló. No se intenta completar nada.
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('un fallo en el último paso llega como ApiError, no como error de axios', async () => {
    /*
     * Es el peor momento posible para un error mal comunicado: la clave de
     * recuperación ya se ha validado, el envoltorio ya se ha reabierto y el usuario ya
     * ha elegido su contraseña nueva. Si ese fallo llega crudo, la interfaz no puede
     * decir qué ha pasado ni si la contraseña quedó fijada o no.
     */
    const scenario = await recoverableVault()
    vi.spyOn(api, 'post')
      .mockResolvedValueOnce({
        data: { data: { wrapped_keys: [scenario.entry], token: 'token-de-un-solo-uso' } },
      })
      .mockRejectedValueOnce(
        Object.assign(new Error('Request failed'), {
          isAxiosError: true,
          response: { status: 401, data: { message: 'El token de recuperación ha caducado' } },
        }),
      )

    await expect(
      recoverAccess(EMAIL, scenario.generated.bytes, NEW_MASTER),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it('un envoltorio que no abre falla distinto que una clave rechazada', async () => {
    /*
     * La distinción que el propio módulo documenta: si el servidor ha dicho que la
     * clave es correcta y el envoltorio no abre, ya no es un problema de
     * credenciales. Aquí eso tiene que salir como DecryptionError y no como ApiError,
     * porque lo que hay que hacer ante cada uno no se parece.
     */
    const scenario = await recoverableVault()
    const corrupted = {
      ...scenario.entry,
      recovery_wrapped_key: scenario.entry.recovery_wrapped_key.replace(/^.{4}/, 'AAAA'),
    }
    vi.spyOn(api, 'post')
      .mockResolvedValueOnce({
        data: { data: { wrapped_keys: [corrupted], token: 'token-de-un-solo-uso' } },
      })
      .mockResolvedValueOnce({ data: {} })

    await expect(
      recoverAccess(EMAIL, scenario.generated.bytes, NEW_MASTER),
    ).rejects.toThrow(DecryptionError)
  })
})
