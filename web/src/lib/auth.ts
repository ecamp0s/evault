import { z } from 'zod'
import { api, interpretError } from '@/lib/api'
import { useSession, type User } from '@/lib/session'
import { createVaultKey, deriveKeys } from '@/lib/vault/crypto'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import { unlockVault } from '@/lib/vault/unlock'

/*
 * Validación en cliente. Es la primera mitad del double guard: la segunda vive en
 * los Form Requests y en los servicios de aplicación de la API, que no se fían de
 * esto. Sirve para dar respuesta inmediata, no para garantizar nada.
 *
 * El mínimo de 8 caracteres coincide con el de RegisterRequest a propósito: si
 * fuera más laxo, el usuario descubriría el error después de enviar el formulario.
 */
export const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'Escribe tu nombre').max(255, 'Máximo 255 caracteres'),
    email: z
      .string()
      .trim()
      .min(1, 'Escribe tu correo')
      .max(255, 'Máximo 255 caracteres')
      .email('Esto no parece un correo válido'),
    password: z.string().min(8, 'Mínimo 8 caracteres').max(255, 'Máximo 255 caracteres'),
    passwordConfirmation: z.string().min(1, 'Repite la contraseña'),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'Las contraseñas no coinciden',
    path: ['passwordConfirmation'],
  })

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Escribe tu correo'),
  password: z.string().min(1, 'Escribe tu contraseña'),
})

export type RegisterData = z.infer<typeof registerSchema>
export type LoginData = z.infer<typeof loginSchema>

interface AuthResponse {
  data: {
    user: User
    token: string
  }
}

/**
 * Da de alta la cuenta sin que la contraseña maestra salga del dispositivo.
 *
 * Lo que ocurre aquí, en orden, según ADR-008:
 *
 * 1. De la contraseña maestra y el correo se derivan la clave maestra, que se
 *    queda, y el hash de autenticación, que es lo único que viaja.
 * 2. Se genera la clave que cifrará el contenido de la vault y se envuelve con la
 *    clave maestra.
 * 3. Se manda el alta con el hash en el campo `password` y la clave envuelta aparte.
 *
 * En ningún punto se envía la contraseña maestra. El campo `password` de la
 * petición conserva el nombre porque el contrato de la API no cambia, pero lo que
 * lleva dentro ya no es una contraseña.
 *
 * La confirmación de contraseña tampoco se envía: es una comprobación de la
 * interfaz para evitar erratas, y el servidor no la necesita ni la valida. Aquí
 * importa más que antes, porque una errata en la contraseña maestra ya no es un
 * problema de acceso recuperable.
 */
export async function signUp(data: RegisterData): Promise<void> {
  const { masterKey, authHash } = await deriveKeys(data.password, data.email)
  const { vaultKey, wrapped } = await createVaultKey(masterKey)

  try {
    const { data: body } = await api.post<AuthResponse>('/auth/register', {
      name: data.name,
      email: data.email,
      password: authHash,
      wrapped_key: wrapped.data,
      wrapped_key_iv: wrapped.iv,
    })

    useSession.getState().authenticate(body.data.user, body.data.token)

    /*
     * La clave se guarda después de que el alta haya salido bien, y no antes. Si el
     * servidor rechaza el registro, dejar una clave de vault viva en memoria sería
     * dejar desbloqueada una vault que no existe.
     */
    useVaultKey.getState().save(vaultKey)
  } catch (error) {
    throw interpretError(error)
  }
}

/**
 * Entra y desbloquea la vault. Son dos cosas y en este orden.
 *
 * Primero se deriva de la contraseña maestra el hash de autenticación, que es lo
 * único que viaja, y con él se pide la sesión. Con el token ya en mano se recupera
 * la clave envuelta de `GET /api/vaults` y se abre con la clave maestra, que no ha
 * salido de aquí.
 *
 * El contrato de `/api/auth/login` no cambia: el hash viaja en el campo `password`,
 * que ya existía y ya era una cadena.
 *
 * **La sesión se publica al final, cuando ya está completa**, y el token viaja
 * explícito hasta entonces. Puede parecer un rodeo y no lo es: el store de sesión
 * es lo que miran los guards, así que dejar el token puesto antes de abrir la vault
 * dispara la navegación a la portada, desmonta esta pantalla, y el error de
 * desbloqueo se pierde con ella. Se ve como un formulario que se vacía sin decir
 * nada. Pasó de verdad, y solo se vio abriendo el navegador.
 *
 * Publicar la sesión entera o no publicarla evita además el estado intermedio en
 * que hay token pero no clave, que existe de forma legítima al recargar —ahí es el
 * bloqueo de la vault, ver ADR-007— pero que aquí solo sería un fallo a medias.
 */
export async function logIn(data: LoginData): Promise<void> {
  const { masterKey, authHash } = await deriveKeys(data.password, data.email)

  let session: AuthResponse['data']

  try {
    const { data: body } = await api.post<AuthResponse>('/auth/login', {
      email: data.email,
      password: authHash,
    })

    session = body.data
  } catch (error) {
    throw interpretError(error)
  }

  // Si esto lanza, no se ha tocado nada: no hay sesión que deshacer ni token que
  // limpiar, y quien llama solo tiene que enseñar el error.
  await unlockVault(masterKey, session.token)

  useSession.getState().authenticate(session.user, session.token)
}

/**
 * Cierra la sesión revocando el token también en el servidor.
 *
 * El estado local se limpia pase lo que pase con la petición. Si el servidor no
 * responde, dejar la sesión abierta en el navegador sería lo peor de las dos
 * opciones: el usuario cree que ha salido y no ha salido. Un token que sobreviva
 * en el servidor es recuperable; una sesión que el usuario cree cerrada y sigue
 * abierta en un ordenador compartido, no.
 */
export async function logOut(): Promise<void> {
  try {
    await api.post('/auth/logout')
  } catch {
    // Sin reintento y sin propagar: el usuario ya se va.
  } finally {
    useSession.getState().clearSession()

    /*
     * Y la vault se bloquea. Cerrar sesión dejando la clave viva en memoria sería
     * peor que no cerrarla: la pantalla diría que no hay nadie dentro mientras el
     * material con el que se descifra todo sigue al alcance de cualquier script que
     * corra en la pestaña.
     */
    useVaultKey.getState().forget()
  }
}

/**
 * Desbloquea la vault de quien ya está recordado en este navegador.
 *
 * Es `entrar` sin el campo del correo: el usuario sigue siendo el mismo y lo único
 * que falta es la contraseña maestra. Que por debajo haga un login completo es un
 * detalle de implementación y no algo que la interfaz deba contar: para el usuario,
 * lo que ocurre es que su vault se abre.
 *
 * Reemplaza a la antigua `hidratarSesion`, que verificaba contra `/auth/me` el
 * token recuperado de localStorage. Ya no hay token que recuperar, así que no hay
 * nada que verificar: al arrancar, o se desbloquea o no hay sesión.
 */
export async function unlock(masterPassword: string): Promise<void> {
  const { rememberedUser } = useSession.getState()

  if (!rememberedUser) {
    /*
     * No debería ocurrir: la pantalla de desbloqueo solo se muestra cuando hay
     * usuario recordado. Si pasa, es preferible un error a intentar entrar con un
     * correo vacío y recibir un «credenciales incorrectas» que despistaría.
     */
    throw new Error('No hay ninguna cuenta recordada en este navegador')
  }

  return logIn({ email: rememberedUser.email, password: masterPassword })
}
