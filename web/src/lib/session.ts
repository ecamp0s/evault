import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '@/lib/api'

export interface User {
  id: number
  name: string
  email: string
  created_at: string | null
}

/** Lo justo para saludar a quien vuelve, sin que nada de esto sea un secreto. */
export interface RememberedUser {
  name: string
  email: string
}

interface SessionState {
  user: User | null
  /**
   * El token, **solo en memoria**. Muere al recargar y al cerrar la pestaña, igual
   * que la clave de cifrado. Ver ADR-007.
   */
  token: string | null
  /**
   * Quién estaba usando la aplicación en este navegador. Esto sí se persiste, y es
   * lo que convierte recargar en un bloqueo en vez de una expulsión: sin ello no
   * habría forma de saber a quién pedirle la contraseña maestra.
   */
  rememberedUser: RememberedUser | null
  authenticate: (user: User, token: string) => void
  clearSession: () => void
  forgetUser: () => void
}

/**
 * Sesión del usuario.
 *
 * EL TOKEN NO SE PERSISTE. Ni aquí, ni en sessionStorage, ni en cookies, ni en
 * IndexedDB. Lo decide ADR-007 y el argumento está entero allí, pero en corto: la
 * clave de cifrado no se puede guardar de ninguna forma, así que al recargar hay
 * que reintroducir la contraseña maestra igualmente. Persistir el token solo
 * mantendría viva una sesión incapaz de enseñar contenido, pagando el riesgo de que
 * un XSS se la lleve a cambio de una comodidad que este producto no puede ofrecer.
 *
 * Lo que sí sobrevive es el nombre y el correo de quien entró. No son secretos —los
 * escribió él en el formulario— y sin ellos la pantalla de desbloqueo no podría
 * decir de quién es la vault que está pidiendo abrir. El precio, asumido: quien
 * abra este navegador ve qué cuenta se usó aquí. Es lo mismo que hace cualquier
 * gestor de contraseñas del sector, y se puede borrar desde la propia pantalla.
 *
 * Ya no hace falta el estado `hidratada` que había antes: existía para esperar a
 * que se verificara contra la API el token recuperado de localStorage, y ahora no
 * hay token que recuperar ni nada que verificar. El arranque es síncrono.
 */
export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      rememberedUser: null,
      authenticate: (user, token) =>
        set({
          user,
          token,
          rememberedUser: { name: user.name, email: user.email },
        }),
      /*
       * Cierra la sesión pero no olvida quién era: es la diferencia entre bloquear
       * y salir. Recargar, que es el caso normal, tiene que llevar a la pantalla de
       * desbloqueo y no al formulario de entrada en blanco.
       */
      clearSession: () => set({ user: null, token: null }),
      /** Salir de verdad, o cambiar de cuenta. */
      forgetUser: () => set({ user: null, token: null, rememberedUser: null }),
    }),
    {
      /*
       * EL NOMBRE DE LA CLAVE SE QUEDA EN ESPAÑOL A PROPÓSITO. No es un símbolo,
       * es la cadena bajo la que hay datos guardados en el navegador de quien ya
       * usaba la aplicación. Cambiarla no rompería nada visible en los tests, pero
       * dejaría a esa gente con un login en blanco en vez de su pantalla de
       * bloqueo, porque el store nuevo no encontraría lo que escribió el viejo.
       * Ver #116.
       */
      name: 'evault.sesion',
      /*
       * La propiedad de dentro SÍ cambió de nombre con la migración al inglés: era
       * `usuarioRecordado`. Sin adaptarla, quien ya tuviera una sesión recordada
       * abriría la aplicación y se encontraría el formulario de entrada en blanco
       * en vez de su pantalla de bloqueo.
       *
       * Se hace aquí, en `merge`, y NO con el par `version`/`migrate`, que es lo
       * que uno escribe primero. El motivo es concreto y costó descubrirlo: zustand
       * solo llama a `migrate` cuando el valor guardado trae una `version`
       * numérica, y lo que hay guardado ahí fuera no la trae, porque este store
       * nunca declaró ninguna. Con `migrate` la migración no llegaba a ejecutarse
       * jamás. `merge` se llama siempre, haya versión o no.
       *
       * Los tests lo cubren escribiendo el formato viejo tal y como está de verdad,
       * sin inventarle un `version: 0` que nunca tuvo: con esa versión inventada el
       * test pasaba y el fallo seguía vivo.
       */
      merge: (persisted, current) => {
        const saved = persisted as {
          rememberedUser?: RememberedUser | null
          usuarioRecordado?: RememberedUser | null
        }

        return {
          ...current,
          rememberedUser: saved.rememberedUser ?? saved.usuarioRecordado ?? null,
        }
      },
      /*
       * Solo el usuario recordado. Que el token quede fuera de aquí es el issue #73
       * entero, así que si alguien lo añade a esta lista, está deshaciendo ADR-007.
       * Hay un test que falla si el token aparece en localStorage.
       */
      partialize: ({ rememberedUser }) => ({ rememberedUser }),
    },
  ),
)

/*
 * El token viaja en la cabecera Authorization y nunca en cookies: la API es
 * stateless y así lo espera. Se lee del store en cada petición en vez de fijarlo
 * una vez, para que al cerrar sesión deje de enviarse sin tener que reconfigurar
 * el cliente.
 */
api.interceptors.request.use((config) => {
  const { token } = useSession.getState()

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

/*
 * Un 401 en cualquier petición significa que el token ya no sirve: caducado,
 * revocado desde otro dispositivo, o la base de datos reiniciada en desarrollo.
 * Se cierra la sesión localmente para que la aplicación deje de fingir que hay
 * una, y las rutas protegidas hagan el resto.
 *
 * No se redirige desde aquí a propósito. Este módulo no conoce el router, y
 * hacerlo con window.location provocaría una recarga completa. Basta con vaciar
 * el store: el guard reacciona al cambio y navega.
 */
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const state = (error as { response?: { status?: number } })?.response?.status

    if (state === 401 && useSession.getState().token) {
      useSession.getState().clearSession()
    }

    return Promise.reject(error)
  },
)
