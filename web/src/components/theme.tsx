import type { ReactNode } from 'react'
import { ThemeProvider } from 'next-themes'

/**
 * The application's theme.
 *
 * Fixed to dark and not following the system preference, because the project's visual
 * direction is one of dark surfaces and not a decision of the user's. When a theme
 * picker exists, `forcedTheme` will have to go and it will have to be decided whether
 * `prefers-color-scheme` is respected.
 *
 * Until now the provider was not mounted: `index.css` defines the `.dark` class and
 * Tailwind's variant uses it, but nobody put it on the document, so everything rendered
 * light. The `useTheme` in `sonner.tsx` was orphaned for the same reason.
 */
export function Theme({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark" enableSystem={false}>
      {children}
    </ThemeProvider>
  )
}
