import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import './index.css'
import { Toaster } from '@/components/ui/sonner'
import { Tema } from '@/components/tema'
import { Consultas } from '@/components/consultas'
import { SoloBloqueada, SoloConSesion, SoloSinSesion } from '@/components/guards'
import { StyleGuide } from '@/pages/StyleGuide'
import { Inicio } from '@/pages/Inicio'
import { Login } from '@/pages/auth/Login'
import { Register } from '@/pages/auth/Register'
import { Desbloquear } from '@/pages/auth/Desbloquear'

/*
 * Ya no se hidrata nada al arrancar. Antes había que verificar contra la API el
 * token recuperado de localStorage, y desde ADR-007 no hay token que recuperar: o
 * se desbloquea la vault escribiendo la contraseña maestra, o no hay sesión.
 */

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Tema>
      <Consultas>
        <BrowserRouter>
          <Routes>
            <Route
              path="/login"
              element={
                <SoloSinSesion>
                  <Login />
                </SoloSinSesion>
              }
            />
            <Route
              path="/register"
              element={
                <SoloSinSesion>
                  <Register />
                </SoloSinSesion>
              }
            />
            <Route
              path="/desbloquear"
              element={
                <SoloBloqueada>
                  <Desbloquear />
                </SoloBloqueada>
              }
            />
            <Route
              path="/"
              element={
                <SoloConSesion>
                  <Inicio />
                </SoloConSesion>
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
      </Consultas>
    </Tema>
  </StrictMode>,
)
