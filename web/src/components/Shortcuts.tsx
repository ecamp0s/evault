import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { SEARCH_BOX_ATTRIBUTE, isLockShortcut, isSearchShortcut, isTyping } from '@/lib/shortcuts'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import { lockVault } from './lockVault'

/**
 * The keyboard shortcuts: Ctrl+Shift+L locks (#788) and `/` goes to the search box (#789).
 * Mounted once next to AutoLock and for the same reason: mounting
 * them per screen would mean several listeners answering the same keys. Listening only
 * while the vault is open, offline included — where there is a key and no token.
 */
export function Shortcuts() {
  const open = useVaultKey((state) => state.key !== null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isLockShortcut(event)) {
        event.preventDefault()
        lockVault(navigate)
        return
      }

      /*
       * `/` only when nobody is typing and no dialog is open: behind a modal the search
       * box is not where the person is working, and the dialog would pull the focus
       * back anyway. On a screen without a search box it does nothing (#789).
       */
      if (isSearchShortcut(event) && !isTyping(event.target) && !document.querySelector('[role="dialog"]')) {
        const box = document.querySelector<HTMLInputElement>(`[${SEARCH_BOX_ATTRIBUTE}]`)
        if (box) {
          event.preventDefault()
          box.focus()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, navigate])

  return null
}
