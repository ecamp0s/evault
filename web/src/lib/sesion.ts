import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '@/lib/api'

export interface Usuario {
  id: number
  name: string
  email: string
  created_at: string | null
}

interface EstadoSesion {
  usuario: Usuario | null
  token: string | null
  autenticar: (usuario: Usuario, token: string) => void
  cerrarSesion: () => void
}

/**
 * Sesión del usuario.
 *
 * Sobre dónde vive el token: en localStorage. Es lo que permite que la sesión
 * sobreviva a un refresco de página, que es lo que se espera de una aplicación
 * así, pero conviene saber lo que se acepta a cambio. localStorage es legible por
 * cualquier JavaScript que llegue a ejecutarse en el origen, así que un XSS se
 * lleva el token. La alternativa habitual, una cookie httpOnly, exige el modo
 * cookie-based de Sanctum que este proyecto descartó por ser stateful.
 *
 * Se asume a sabiendas y solo para esta iteración: el token da acceso a una API
 * que todavía no guarda ningún secreto. Antes de la Iteración 3, cuando empiece a
 * haber vault items cifrados, hay que revisar esta decisión y probablemente
 * registrarla en un ADR.
 */
export const useSesion = create<EstadoSesion>()(
  persist(
    (set) => ({
      usuario: null,
      token: null,
      autenticar: (usuario, token) => set({ usuario, token }),
      cerrarSesion: () => set({ usuario: null, token: null }),
    }),
    { name: 'evault.sesion' },
  ),
)

/*
 * El token viaja en la cabecera Authorization y nunca en cookies: la API es
 * stateless y así lo espera. Se lee del store en cada petición en vez de fijarlo
 * una vez, para que al cerrar sesión deje de enviarse sin tener que reconfigurar
 * el cliente.
 */
api.interceptors.request.use((config) => {
  const { token } = useSesion.getState()

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})
