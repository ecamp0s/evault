import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import './index.css'
import { Toaster } from '@/components/ui/sonner'
import { Theme } from '@/components/theme'
import { Queries } from '@/components/queries'
import { RequireLocked, RequireNoSession, RequireSession } from '@/components/guards'
import { RouteFallback } from '@/components/app/RouteFallback'
import { AutoLock } from '@/components/AutoLock'

/*
 * Las pantallas se cargan cuando hacen falta y no al arrancar. Ver #45.
 *
 * Lo que se gana no es tamaño total, que es el mismo: es que quien abre el login
 * deja de descargar el diálogo de import, el generador de contraseñas y el
 * esquema de validación de los items, que no va a usar hasta que entre —si es que
 * entra—. Medido con sourcemaps antes de tocar nada: `@base-ui/react` y `zod`
 * juntos eran una cuarta parte del bundle, y ninguno de los dos hace falta para
 * pintar un formulario de entrada.
 *
 * Van con `.then` porque son exportaciones con nombre y `lazy` espera un módulo
 * con `default`. Se escribe aquí y no cambiando las pantallas a export default:
 * un default hace peor el autocompletado y el renombrado en todo lo demás.
 */
const lazyPage = <T extends string>(load: () => Promise<Record<T, React.ComponentType>>, name: T) =>
  lazy(() => load().then((module) => ({ default: module[name] })))

const Login = lazyPage(() => import('@/pages/auth/Login'), 'Login')
const Register = lazyPage(() => import('@/pages/auth/Register'), 'Register')
const Unlock = lazyPage(() => import('@/pages/auth/Unlock'), 'Unlock')
const Recover = lazyPage(() => import('@/pages/auth/Recover'), 'Recover')
const Home = lazyPage(() => import('@/pages/Home'), 'Home')
const MasterPassword = lazyPage(() => import('@/pages/vault/MasterPassword'), 'MasterPassword')
const Email = lazyPage(() => import('@/pages/vault/Email'), 'Email')
const RecoveryKey = lazyPage(() => import('@/pages/vault/RecoveryKey'), 'RecoveryKey')
const StyleGuide = lazyPage(() => import('@/pages/StyleGuide'), 'StyleGuide')

/*
 * Ya no se hidrata nada al arrancar. Antes había que verificar contra la API el
 * token recuperado de localStorage, y desde ADR-007 no hay token que recuperar: o
 * se desbloquea la vault escribiendo la contraseña maestra, o no hay sesión.
 */

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Theme>
      <Queries>
        <BrowserRouter>
          {/*
            * Fuera del Suspense y hermano de las rutas, no dentro de ninguna: el
            * reloj de inactividad tiene que seguir contando aunque la ruta esté
            * cargando su chunk, y montarlo por pantalla sería tener varios relojes
            * midiendo lo mismo. No pinta nada. Ver el issue #220.
            */}
          <AutoLock />
          {/*
            * El Suspense envuelve el árbol de rutas entero y no cada ruta: el
            * fallback ocupa la pantalla completa, así que da igual cuál esté
            * cargando, y una sola frontera se lee mejor que ocho iguales.
            */}
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route
                path="/login"
                element={
                  <RequireNoSession>
                    <Login />
                  </RequireNoSession>
                }
              />
              <Route
                path="/register"
                element={
                  <RequireNoSession>
                    <Register />
                  </RequireNoSession>
                }
              />
              <Route
                path="/desbloquear"
                element={
                  <RequireLocked>
                    <Unlock />
                  </RequireLocked>
                }
              />
              <Route
                path="/"
                element={
                  <RequireSession>
                    <Home />
                  </RequireSession>
                }
              />
              <Route
                path="/recuperar"
                element={
                  <RequireNoSession>
                    <Recover />
                  </RequireNoSession>
                }
              />
              <Route
                path="/correo-electronico"
                element={
                  <RequireSession>
                    <Email />
                  </RequireSession>
                }
              />
              <Route
                path="/contrasena-maestra"
                element={
                  <RequireSession>
                    <MasterPassword />
                  </RequireSession>
                }
              />
              <Route
                path="/clave-de-recuperacion"
                element={
                  <RequireSession>
                    <RecoveryKey />
                  </RequireSession>
                }
              />
              {/*
                * Solo en desarrollo. import.meta.env.DEV se sustituye por false al
                * compilar, así que la rama entera es código muerto y el componente
                * no llega al bundle: comprobado buscando sus textos en dist.
                *
                * Routes admite hijos que no son elementos y los ignora, que es lo
                * que permite escribir la condición aquí en vez de montar dos
                * árboles de rutas distintos.
                */}
              {import.meta.env.DEV && <Route path="/styleguide" element={<StyleGuide />} />}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          <Toaster />
        </BrowserRouter>
      </Queries>
    </Theme>
  </StrictMode>,
)
