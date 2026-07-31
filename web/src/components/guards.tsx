import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'

/*
 * Guards mínimos, deliberadamente. El shell autenticado con sidebar, el
 * interceptor de axios que expulsa ante un 401 y las rutas protegidas de verdad
 * son el issue #6. Aquí solo hace falta que una visita sin sesión no acabe en una
 * pantalla vacía, y que quien ya entró no vuelva a ver el formulario.
 *
 * Viven en su propio fichero y no en main.tsx porque allí romperían el fast
 * refresh: un módulo que define componentes tiene que exportarlos.
 */

export function SoloConSesion({ children }: { children: ReactNode }) {
  const token = useSesion((estado) => estado.token)

  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export function SoloSinSesion({ children }: { children: ReactNode }) {
  const token = useSesion((estado) => estado.token)

  return token ? <Navigate to="/" replace /> : <>{children}</>
}
