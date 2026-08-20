import { beforeEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { hasUnsavedWork, useUnsavedWork, useUnsavedWorkWhile } from './unsavedWork'

beforeEach(() => {
  useUnsavedWork.setState({ count: 0 })
})

describe('unsaved work', () => {
  it('reports nothing to lose while no form has registered', () => {
    expect(hasUnsavedWork()).toBe(false)
  })

  it('reports work while a dirty form is mounted', () => {
    renderHook(() => useUnsavedWorkWhile(true))

    expect(hasUnsavedWork()).toBe(true)
  })

  it('stops reporting once that form unmounts', () => {
    const { unmount } = renderHook(() => useUnsavedWorkWhile(true))

    unmount()

    expect(hasUnsavedWork()).toBe(false)
  })

  it('ignores a form that has nothing unsaved', () => {
    renderHook(() => useUnsavedWorkWhile(false))

    expect(hasUnsavedWork()).toBe(false)
  })

  it('follows a form that becomes dirty and clean again', () => {
    const { rerender } = renderHook(({ dirty }) => useUnsavedWorkWhile(dirty), {
      initialProps: { dirty: false },
    })

    rerender({ dirty: true })
    expect(hasUnsavedWork()).toBe(true)

    rerender({ dirty: false })
    expect(hasUnsavedWork()).toBe(false)
  })

  it('still reports work while a second form is open', () => {
    /*
     * WHY THE COUNTER IS NOT A BOOLEAN. With a flag, the first dialog to close would
     * clear it for the one still holding text, and the warning would go back to
     * saying there is nothing to lose while there is.
     */
    const first = renderHook(() => useUnsavedWorkWhile(true))
    renderHook(() => useUnsavedWorkWhile(true))

    first.unmount()

    expect(hasUnsavedWork()).toBe(true)
  })

  it('never counts below zero', () => {
    const { unregister } = useUnsavedWork.getState()

    unregister()
    unregister()

    expect(useUnsavedWork.getState().count).toBe(0)
    expect(hasUnsavedWork()).toBe(false)
  })
})
