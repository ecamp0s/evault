import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import { Toaster } from '@/components/ui/sonner'
import { StyleGuide } from '@/pages/StyleGuide'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/styleguide" element={<StyleGuide />} />
        <Route path="*" element={<Navigate to="/styleguide" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  </StrictMode>,
)
