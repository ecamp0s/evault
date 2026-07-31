import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import { Toaster } from '@/components/ui/sonner'
import { Tema } from '@/components/tema'
import { SoloConSesion, SoloSinSesion } from '@/components/guards'
import { StyleGuide } from '@/pages/StyleGuide'
import { Inicio } from '@/pages/Inicio'
import { Login } from '@/pages/auth/Login'
import { Register } from '@/pages/auth/Register'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Tema>
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
            path="/"
            element={
              <SoloConSesion>
                <Inicio />
              </SoloConSesion>
            }
          />
          <Route path="/styleguide" element={<StyleGuide />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </Tema>
  </StrictMode>,
)
