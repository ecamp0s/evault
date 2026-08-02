import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useSesion } from '@/lib/sesion'

/*
 * Viven en su propio fichero y no en main.tsx porque allí romperían el fast
 * refresh: un módulo que define componentes tiene que exportarlos.
 *
 * Ya no hay estado de «comprobando». Existía para esperar a que se verificara
 * contra la API el token recuperado de localStorage, y desde ADR-007 no hay token
 * que recuperar: el arranque es síncrono y los guards pueden decidir de inmediato.
 */

export function SoloConSesion({ children }: { children: ReactNode }) {
  const token = useSesion((estado) => estado.token)
  const usuarioRecordado = useSesion((estado) => estado.usuarioRecordado)
  const ubicacion = useLocation()

  if (token) {
    return <>{children}</>
  }

  /*
   * Sin token pero con usuario recordado es el caso normal tras recargar, y la
   * diferencia entre las dos ramas de abajo es justo lo que ADR-007 pide: a quien
   * ya estaba dentro se le pide la contraseña maestra —bloqueo—, y solo a quien no
   * ha entrado nunca en este navegador se le enseña el formulario de entrada.
   *
   * En los dos casos se recuerda de dónde venía, para volver ahí después. Sin esto,
   * recargar en una sección concreta acabaría siempre en la portada.
   */
  return (
    <Navigate
      to={usuarioRecordado ? '/desbloquear' : '/login'}
      replace
      state={{ desde: ubicacion.pathname }}
    />
  )
}

export function SoloSinSesion({ children }: { children: ReactNode }) {
  const token = useSesion((estado) => estado.token)

  return token ? <Navigate to="/" replace /> : <>{children}</>
}

/**
 * La pantalla de desbloqueo solo tiene sentido con una cuenta recordada y sin
 * sesión abierta.
 *
 * Sin este guard, `/desbloquear` escrito a mano enseñaría un formulario que pide la
 * contraseña de nadie, y con sesión abierta pediría desbloquear algo que ya está
 * abierto.
 */
export function SoloBloqueada({ children }: { children: ReactNode }) {
  const token = useSesion((estado) => estado.token)
  const usuarioRecordado = useSesion((estado) => estado.usuarioRecordado)

  if (token) {
    return <Navigate to="/" replace />
  }

  return usuarioRecordado ? <>{children}</> : <Navigate to="/login" replace />
}
