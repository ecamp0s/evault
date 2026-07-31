import type { ReactNode } from 'react'
import { ThemeProvider } from 'next-themes'

/**
 * Tema de la aplicación.
 *
 * Fijado en oscuro y sin seguir la preferencia del sistema, porque la dirección
 * visual del proyecto es de superficies oscuras y no una decisión del usuario.
 * Cuando exista un selector de tema habrá que quitar `forcedTheme` y decidir si
 * se respeta `prefers-color-scheme`.
 *
 * Hasta ahora el provider no estaba montado: `index.css` define la clase `.dark`
 * y el variant de Tailwind la usa, pero nadie la ponía en el documento, así que
 * todo se renderizaba en claro. El `useTheme` de `sonner.tsx` también estaba
 * huérfano por lo mismo.
 */
export function Tema({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark" enableSystem={false}>
      {children}
    </ThemeProvider>
  )
}
