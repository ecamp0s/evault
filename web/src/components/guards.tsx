import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { Loader2 } from 'lucide-react'
import { useSesion } from '@/lib/sesion'

/*
 * Viven en su propio fichero y no en main.tsx porque allí romperían el fast
 * refresh: un módulo que define componentes tiene que exportarlos.
 */

/**
 * Mientras se comprueba si el token persistido sigue valiendo no se puede decidir
 * nada. Sin esta pantalla, al recargar una ruta protegida se vería un parpadeo
 * hacia /login antes de volver, o al revés.
 */
function Comprobando() {
  return (
    <div className="flex min-h-svh items-center justify-center" role="status" aria-live="polite">
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">Comprobando la sesión</span>
    </div>
  )
}

export function SoloConSesion({ children }: { children: ReactNode }) {
  const token = useSesion((estado) => estado.token)
  const hidratada = useSesion((estado) => estado.hidratada)
  const ubicacion = useLocation()

  if (!hidratada) {
    return <Comprobando />
  }

  if (!token) {
    /*
     * Se recuerda de dónde venía para volver ahí tras entrar. Sin esto, un enlace
     * a una sección concreta acaba siempre en la portada, y un 401 en mitad del
     * trabajo pierde el sitio donde estaba el usuario.
     */
    return <Navigate to="/login" replace state={{ desde: ubicacion.pathname }} />
  }

  return <>{children}</>
}

export function SoloSinSesion({ children }: { children: ReactNode }) {
  const token = useSesion((estado) => estado.token)
  const hidratada = useSesion((estado) => estado.hidratada)

  if (!hidratada) {
    return <Comprobando />
  }

  return token ? <Navigate to="/" replace /> : <>{children}</>
}
