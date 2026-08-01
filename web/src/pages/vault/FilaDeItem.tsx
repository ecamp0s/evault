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
 *
 * La fila entera es un botón y no un enlace: abre un diálogo, no navega. Marcarla
 * como enlace prometería una URL a la que ir, un menú contextual con «abrir en una
 * pestaña nueva» que no llevaría a ninguna parte, y un destino para un lector de
 * pantalla que no existe.
 */
export function FilaDeItem({ item, onEditar }: { item: Item; onEditar: () => void }) {
  const { nombre, usuario, url } = item.contenido

  return (
    <li>
      <button
        type="button"
        onClick={onEditar}
        className="flex w-full items-center gap-3 rounded-lg border border-border px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
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
      </button>
    </li>
  )
}
