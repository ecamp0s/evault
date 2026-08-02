import { z } from 'zod'
import { api, interpretarError } from '@/lib/api'
import { useSesion, type Usuario } from '@/lib/sesion'
import { crearClaveDeVault, derivarClaves } from '@/lib/vault/cripto'
import { useClaveDeVault } from '@/lib/vault/claveEnMemoria'

/*
 * Validación en cliente. Es la primera mitad del double guard: la segunda vive en
 * los Form Requests y en los servicios de aplicación de la API, que no se fían de
 * esto. Sirve para dar respuesta inmediata, no para garantizar nada.
 *
 * El mínimo de 8 caracteres coincide con el de RegisterRequest a propósito: si
 * fuera más laxo, el usuario descubriría el error después de enviar el formulario.
 */
export const esquemaRegistro = z
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
  .refine((datos) => datos.password === datos.passwordConfirmation, {
    message: 'Las contraseñas no coinciden',
    path: ['passwordConfirmation'],
  })

export const esquemaLogin = z.object({
  email: z.string().trim().min(1, 'Escribe tu correo'),
  password: z.string().min(1, 'Escribe tu contraseña'),
})

export type DatosRegistro = z.infer<typeof esquemaRegistro>
export type DatosLogin = z.infer<typeof esquemaLogin>

interface RespuestaAuth {
  data: {
    user: Usuario
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
export async function registrar(datos: DatosRegistro): Promise<void> {
  const { claveMaestra, hashDeAutenticacion } = await derivarClaves(datos.password, datos.email)
  const { claveDeVault, envoltorio } = await crearClaveDeVault(claveMaestra)

  try {
    const { data } = await api.post<RespuestaAuth>('/auth/register', {
      name: datos.name,
      email: datos.email,
      password: hashDeAutenticacion,
      wrapped_key: envoltorio.datos,
      wrapped_key_iv: envoltorio.iv,
    })

    useSesion.getState().autenticar(data.data.user, data.data.token)

    /*
     * La clave se guarda después de que el alta haya salido bien, y no antes. Si el
     * servidor rechaza el registro, dejar una clave de vault viva en memoria sería
     * dejar desbloqueada una vault que no existe.
     */
    useClaveDeVault.getState().guardar(claveDeVault)
  } catch (error) {
    throw interpretarError(error)
  }
}

export async function entrar(datos: DatosLogin): Promise<void> {
  try {
    const { data } = await api.post<RespuestaAuth>('/auth/login', datos)

    useSesion.getState().autenticar(data.data.user, data.data.token)
  } catch (error) {
    throw interpretarError(error)
  }
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
export async function salir(): Promise<void> {
  try {
    await api.post('/auth/logout')
  } catch {
    // Sin reintento y sin propagar: el usuario ya se va.
  } finally {
    useSesion.getState().cerrarSesion()

    /*
     * Y la vault se bloquea. Cerrar sesión dejando la clave viva en memoria sería
     * peor que no cerrarla: la pantalla diría que no hay nadie dentro mientras el
     * material con el que se descifra todo sigue al alcance de cualquier script que
     * corra en la pestaña.
     */
    useClaveDeVault.getState().olvidar()
  }
}

/**
 * Comprueba contra la API si el token persistido sigue valiendo, y de paso
 * refresca los datos del usuario por si cambiaron desde otro dispositivo.
 *
 * Se llama una vez al arrancar. Si el token ya no vale, el interceptor de 401 se
 * encarga de cerrar la sesión, así que aquí no hay que hacer nada con el error.
 */
export async function hidratarSesion(): Promise<void> {
  const { token, marcarHidratada } = useSesion.getState()

  if (!token) {
    marcarHidratada()

    return
  }

  try {
    const { data } = await api.get<{ data: { user: Usuario } }>('/auth/me')

    useSesion.getState().autenticar(data.data.user, token)
  } catch {
    // Un 401 ya habrá vaciado el store desde el interceptor. Ante cualquier otro
    // error, por ejemplo la API caída, se conserva la sesión: no poder verificar
    // no es lo mismo que estar rechazado, y expulsar al usuario porque el
    // servidor está reiniciándose sería peor.
  } finally {
    useSesion.getState().marcarHidratada()
  }
}
