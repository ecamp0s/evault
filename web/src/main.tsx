import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from '@/App'

/*
 * Booting, and nothing else.
 *
 * The tree moved to App.tsx in #389 so that a test could mount it without booting the
 * real application. The comments that explained each of its parts went with it, whole.
 */

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
