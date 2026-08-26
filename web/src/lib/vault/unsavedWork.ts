import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * WHO IS HOLDING WORK THAT LOCKING WOULD THROW AWAY. See #303 and `ADR-007`.
 *
 * Auto-lock discards whatever is typed into an open dialog: the content lives in
 * React state and locking navigates away, which unmounts the tree. That is correct
 * and is not what this module changes — `ADR-007` decides the key must not survive
 * inactivity, and an open modal is not activity.
 *
 * What it changes is that nobody was told. The warning said «your vault will lock in
 * N seconds», so someone who came back, read it and decided to let it lock —
 * reasonable, if all you lose is a session — also lost what they were writing.
 *
 * WHY A COUNTER AND NOT A BOOLEAN: several forms can hold unsaved work at once, and
 * a boolean would let the one closing first clear the flag for the one still open.
 *
 * WHY NOT A DRAFT INSTEAD. Saving the draft would be the generous answer and it is
 * deliberately not the one taken. The content of an item is vault content, so it
 * would have to be stored encrypted — with a key that has just been discarded, which
 * is the whole point of locking. `ADR-001` governs where that content may live, and
 * an issue that only asks for a warning is not the place to widen it. The loss is
 * accepted; what is fixed is that it stops being a surprise.
 */

/**
 * What is at stake, when it is not just typing. See #329.
 *
 * Almost everything a lock throws away is text that can be typed again, and the
 * warning of #303 says exactly that. The recovery key is not that: by the time it is
 * on screen it is ALREADY registered on the server, so losing it leaves an account
 * that says it has a recovery key whose only readable copy nobody kept.
 *
 * That difference has to reach the wording, or the warning tells somebody they are
 * about to lose a draft when what they are about to lose is their way back in.
 */
export type UnsavedKind = 'texto' | 'clave-de-recuperacion'

interface UnsavedWorkState {
  /** How many mounted forms are holding changes their user has not saved. */
  count: number
  /** How many of those are holding each kind. Counted, for the same reason as above. */
  kinds: Record<UnsavedKind, number>
  register: (kind: UnsavedKind) => void
  unregister: (kind: UnsavedKind) => void
}

const noKinds = (): Record<UnsavedKind, number> => ({ 'texto': 0, 'clave-de-recuperacion': 0 })

export const useUnsavedWork = create<UnsavedWorkState>()((set) => ({
  count: 0,
  kinds: noKinds(),
  register: (kind) =>
    set((state) => ({
      count: state.count + 1,
      kinds: { ...state.kinds, [kind]: state.kinds[kind] + 1 },
    })),

  /*
   * Never below zero. A cleanup running twice would otherwise leave the counter
   * negative and make `hasUnsavedWork` lie for the rest of the session — a bug that
   * only shows up much later, in a warning that quietly stops mentioning the loss.
   */
  unregister: (kind) =>
    set((state) => ({
      count: Math.max(0, state.count - 1),
      kinds: { ...state.kinds, [kind]: Math.max(0, state.kinds[kind] - 1) },
    })),
}))

/**
 * Whether anything on screen would be lost right now.
 *
 * Read outside React on purpose: the one caller is the auto-lock interval, which
 * reads state without re-rendering, the same way it reads the session and the key.
 */
export function hasUnsavedWork(): boolean {
  return useUnsavedWork.getState().count > 0
}

/** Whether a generated recovery key is on screen and its owner has not confirmed saving it. */
export function hasUnsavedRecoveryKey(): boolean {
  return useUnsavedWork.getState().kinds['clave-de-recuperacion'] > 0
}

/**
 * Registers a form while it holds unsaved changes.
 *
 * Takes the same flag the form already uses to guard its own exits, so there is one
 * source of truth for «is there anything to lose» instead of two that can drift.
 * Unregisters on unmount, which covers the case that matters here: locking navigates
 * away, and the dialog is unmounted rather than closed.
 */
export function useUnsavedWorkWhile(dirty: boolean, kind: UnsavedKind = 'texto'): void {
  useEffect(() => {
    if (!dirty) {
      return
    }

    const { register, unregister } = useUnsavedWork.getState()

    register(kind)

    return () => unregister(kind)
  }, [dirty, kind])
}
