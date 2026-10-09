import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { isLockShortcut } from '@/lib/shortcuts'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import { lockVault } from './lockVault'

/**
 * The keyboard shortcuts, mounted once next to AutoLock and for the same reason: mounting
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
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, navigate])

  return null
}
