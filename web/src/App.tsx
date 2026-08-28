import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { Theme } from '@/components/theme'
import { Queries } from '@/components/queries'
import { RequireLocked, RequireNoSession, RequireSession } from '@/components/guards'
import { RouteFallback } from '@/components/app/RouteFallback'
import { AutoLock } from '@/components/AutoLock'
import { RouteErrorBoundary } from '@/components/app/RouteErrorBoundary'

/*
 * The screens are loaded when they are needed and not at start-up. See #45.
 *
 * What is gained is not total size, which is the same: it is that whoever opens the
 * login stops downloading the import dialog, the password generator and the items'
 * validation schema, none of which they will use until they sign in —if they sign in
 * at all—. Measured with sourcemaps before touching anything: `@base-ui/react` and
 * `zod` together were a quarter of the bundle, and neither of them is needed to paint
 * a sign-in form.
 *
 * They go through `.then` because they are named exports and `lazy` expects a module
 * with a `default`. It is written here rather than by turning the screens into export
 * default: a default makes autocompletion and renaming worse everywhere else.
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
 * Nothing is hydrated at start-up any more. There used to be a token recovered from
 * localStorage to verify against the API, and since ADR-007 there is no token to
 * recover: either the vault is unlocked by typing the master password, or there is no
 * session.
 */

/**
 * The application's tree, apart from what boots it.
 *
 * It lives here and not in `main.tsx` so that a test can mount it. Until #389 the whole
 * tree hung off `createRoot` at module scope, so there was no way to render it without
 * booting the real application — and that is a large part of why nothing noticed that a
 * failing route took the entire tree down with it.
 */
export function App() {
  return (
    <Theme>
      <Queries>
        <BrowserRouter>
          {/*
            * Outside the Suspense and a sibling of the routes, not inside any of them:
            * the inactivity clock has to keep counting even while the route is loading
            * its chunk, and mounting it per screen would mean several clocks measuring
            * the same thing. It paints nothing. See issue #220.
            */}
          <AutoLock />
          {/*
            * The Suspense wraps the whole route tree and not each route: the fallback
            * fills the entire screen, so it makes no difference which one is loading,
            * and a single boundary reads better than eight identical ones.
            */}
          {/*
          * The boundary wraps the routes and NOT the whole application, and that is a
          * decision (#389).
          *
          * What can fail here is a screen: its chunk not arriving, or its render throwing.
          * Above this point are Theme, Queries and the router, which paint nothing of
          * their own — a failure there is a broken build and not a bad deployment, and
          * swallowing it would hide it.
          *
          * AutoLock stays OUTSIDE, and that is the half that matters: it is a sibling, so
          * it keeps counting while this notice is on screen. Otherwise a vault whose
          * screen crashed would stay unlocked for as long as the tab is open, which is
          * the opposite of what ADR-007 asks for.
          */}
        <RouteErrorBoundary>
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
                  path="/unlock"
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
                  path="/recover"
                  element={
                    <RequireNoSession>
                      <Recover />
                    </RequireNoSession>
                  }
                />
                <Route
                  path="/email"
                  element={
                    <RequireSession>
                      <Email />
                    </RequireSession>
                  }
                />
                <Route
                  path="/master-password"
                  element={
                    <RequireSession>
                      <MasterPassword />
                    </RequireSession>
                  }
                />
                <Route
                  path="/recovery-key"
                  element={
                    <RequireSession>
                      <RecoveryKey />
                    </RequireSession>
                  }
                />
                {/*
                  * In development only. import.meta.env.DEV is replaced by false at
                  * compile time, so the whole branch is dead code and the component
                  * never reaches the bundle: checked by searching for its texts in dist.
                  *
                  * Routes admits children that are not elements and ignores them, which
                  * is what allows writing the condition here instead of building two
                  * different route trees.
                  */}
                {import.meta.env.DEV && <Route path="/styleguide" element={<StyleGuide />} />}
                {/*
                  * Anything else goes to the vault, and since #356 that includes the old
                  * Spanish routes — `/desbloquear`, `/clave-de-recuperacion` and the rest.
                  *
                  * NO REDIRECTS FROM THEM, decided rather than forgotten: keeping both
                  * forms alive would drag along the very names this change retires, and a
                  * saved bookmark landing on the vault is a mild inconvenience on a
                  * personal instance rather than a broken link. The exception and its
                  * reasoning are written in CLAUDE.md, where somebody looks.
                  */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
        </RouteErrorBoundary>
          <Toaster />
        </BrowserRouter>
      </Queries>
    </Theme>
  )
}
