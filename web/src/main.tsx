import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from '@/App'
import { clearRetiredStorage } from '@/lib/retiredStorage'

/*
 * Booting, and nothing else.
 *
 * The tree moved to App.tsx in #389 so that a test could mount it without booting the
 * real application. The comments that explained each of its parts went with it, whole.
 */

/*
 * Before rendering, and outside App on purpose: it is not part of the tree, it has no
 * state, and mounting App in a test must not have the side effect of deleting things
 * from the storage that test set up.
 */
clearRetiredStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
