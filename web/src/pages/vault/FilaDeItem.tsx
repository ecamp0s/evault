import { Copy, Globe, KeyRound, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { copiarSecreto } from '@/lib/vault/copiar'
import type { Item } from '@/lib/vault/tipos'

interface FilaDeItemProps {
  item: Item
  onEditar: () => void
  onBorrar: () => void
}

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
 * La zona principal es un botón y no un enlace: abre un diálogo, no navega.
 * Marcarla como enlace prometería una URL a la que ir, un menú contextual con
 * «abrir en una pestaña nueva» que no llevaría a ninguna parte, y un destino para
 * un lector de pantalla que no existe.
 *
 * El botón de borrar es hermano y no está dentro, porque un botón dentro de otro
 * botón no es HTML válido. Va suelto en la fila y no dentro de un menú desplegable
 * por una razón práctica: el diálogo devuelve el foco al elemento que lo abrió, y
 * un elemento de menú desaparece al cerrarse el menú, así que el foco se perdería.
 */
export function FilaDeItem({ item, onEditar, onBorrar }: FilaDeItemProps) {
  const { nombre, usuario, url, password } = item.contenido

  return (
    <li className="flex items-center gap-1 rounded-lg border border-border pr-2 transition-colors hover:bg-muted/50">
      {/*
        * Etiqueta explícita en vez de dejar que el nombre accesible salga del
        * contenido. Sin ella, los dos textos se concatenan sin separación y se
        * anuncian como una sola palabra corrida; además el navegador y jsdom no
        * los unen igual, así que el nombre dependía del entorno.
        */}
      <button
        type="button"
        onClick={onEditar}
        aria-label={usuario ? `Editar ${nombre}, ${usuario}` : `Editar ${nombre}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-4 py-3 text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
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

      {/*
        * Copiar es la operación más frecuente de un gestor de contraseñas, así
        * que vive en la fila y no escondida dentro del detalle.
        *
        * La contraseña se copia sin llegar a pintarse: está en memoria, en el item
        * ya descodificado, pero nunca entra en el DOM de la lista. Solo aparece el
        * botón si hay algo que copiar.
        */}
      {password && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Copiar la contraseña de ${nombre}`}
          onClick={() => void copiarSecreto(password, 'Contraseña')}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Copy className="size-4" aria-hidden="true" />
        </Button>
      )}

      {/*
        * La etiqueta lleva el nombre de la entrada. Cinco botones «Borrar»
        * idénticos en una lista no le dicen nada a quien navega con lector de
        * pantalla.
        */}
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Borrar ${nombre}`}
        onClick={onBorrar}
        className="shrink-0 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    </li>
  )
}
