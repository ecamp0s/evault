import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import './index.css'
import { Toaster } from '@/components/ui/sonner'
import { Theme } from '@/components/theme'
import { Queries } from '@/components/queries'
import { RequireLocked, RequireNoSession, RequireSession } from '@/components/guards'
import { StyleGuide } from '@/pages/StyleGuide'
import { Home } from '@/pages/Home'
import { Login } from '@/pages/auth/Login'
import { Register } from '@/pages/auth/Register'
import { Unlock } from '@/pages/auth/Unlock'
import { RecoveryKey } from '@/pages/vault/RecoveryKey'

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
          <Toaster />
        </BrowserRouter>
      </Queries>
    </Theme>
  </StrictMode>,
)
