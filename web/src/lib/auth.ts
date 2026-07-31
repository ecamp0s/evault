import { z } from 'zod'
import { api, interpretarError } from '@/lib/api'
import { useSesion, type Usuario } from '@/lib/sesion'

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

/*
 * La confirmación de contraseña no se envía: es una comprobación de la interfaz
 * para evitar erratas, y el servidor no la necesita ni la valida.
 */
export async function registrar(datos: DatosRegistro): Promise<void> {
  try {
    const { data } = await api.post<RespuestaAuth>('/auth/register', {
      name: datos.name,
      email: datos.email,
      password: datos.password,
    })

    useSesion.getState().autenticar(data.data.user, data.data.token)
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
