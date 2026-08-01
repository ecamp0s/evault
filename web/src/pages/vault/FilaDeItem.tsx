import { Globe, KeyRound } from 'lucide-react'
import type { Item } from '@/lib/vault/tipos'

/**
 * Una entrada de la lista.
 *
 * Muestra nombre y usuario, y nada más. **La contraseña no se pinta aquí**, ni
 * siquiera oculta tras puntos: lo que no está en el DOM no puede leerse desde una
 * extensión, una captura de pantalla ni un hombro por encima. Enseñarla es una
 * acción explícita del usuario, y llega en el issue #58.
 *
 * Hay un test que comprueba que la contraseña no aparece en el DOM de la lista.
 */
export function FilaDeItem({ item }: { item: Item }) {
  const { nombre, usuario, url } = item.contenido

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/50">
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
        aria-hidden="true"
      >
        {url ? <Globe className="size-4" /> : <KeyRound className="size-4" />}
      </span>

      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{nombre}</span>
        {usuario ? (
          <span className="truncate text-sm text-muted-foreground">{usuario}</span>
        ) : null}
      </span>
    </li>
  )
}
