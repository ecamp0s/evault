import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import indexHtml from '../../index.html?raw'

/*
 * The theme is fixed to dark, and since #696 nothing sets it at run time: next-themes
 * did, with a <script> React 19.3 warned about on every load. What replaces it is two
 * literal values, and these tests are what keep them there — without them, dropping the
 * class from index.html would render every screen light and no other test would notice,
 * because jsdom does not apply CSS.
 */

describe('the dark theme', () => {
  it('is written on the document itself, class and color scheme', () => {
    const tag = indexHtml.match(/<html[^>]*>/)?.[0] ?? ''

    expect(tag).toMatch(/class="dark"/)
    expect(tag).toMatch(/color-scheme:\s*dark/)
  })

  it('reaches the notices, which no longer ask a provider for it', async () => {
    render(<Toaster />)
    toast('Hola')

    await screen.findByText('Hola')
    expect(document.querySelector('[data-sonner-toaster]')).toHaveAttribute('data-sonner-theme', 'dark')
  })
})
