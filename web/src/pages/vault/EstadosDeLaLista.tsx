import { KeyRound, Plus, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Los tres estados de la lista que no son «hay items».
 *
 * Están juntos y aparte de la lista porque son la mitad del trabajo de esta
 * pantalla: la primera vez que la aplicación enseña datos del usuario, y hay que
 * pedirlos y descodificarlos antes de poder pintar nada. Sin estos estados, el
 * caso normal de una vault recién creada sería una pantalla en blanco.
 */

/**
 * Carga.
 *
 * Se pintan siluetas y no un texto de «cargando» porque la lista aparece en el
 * mismo sitio, y así el contenido no salta cuando llega. aria-hidden y el
 * aria-busy de la lista se encargan de que un lector de pantalla no lea el
 * relleno.
 */
export function Cargando() {
  return (
    <ul className="space-y-2" aria-busy="true" aria-label="Cargando la vault">
      {[0, 1, 2].map((fila) => (
        <li
          key={fila}
          className="flex items-center gap-3 rounded-lg border border-border px-4 py-3"
          aria-hidden="true"
        >
          <span className="size-9 shrink-0 animate-pulse rounded-md bg-muted" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-3 w-40 animate-pulse rounded bg-muted" />
            <span className="h-3 w-24 animate-pulse rounded bg-muted" />
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Vault vacía.
 *
 * Es el primer estado que ve todo usuario nuevo, así que no dice «no hay datos»
 * sino qué va a pasar aquí.
 *
 * Cuidado con el texto: aquí NO se promete cifrado. Sería lo natural de escribir
 * en un gestor de contraseñas, y durante la Iteración 2 sería mentira, porque el
 * contenido viaja codificado y no cifrado. La promesa se añade cuando sea cierta,
 * es decir cuando cierre el issue #59.
 */
export function SinItems({ onCrear }: { onCrear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-20 text-center">
      <KeyRound className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">Tu vault está vacía</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        Las contraseñas que guardes aparecerán aquí.
      </p>
      <Button size="sm" className="mt-1" onClick={onCrear}>
        <Plus className="size-4" aria-hidden="true" />
        Guardar la primera
      </Button>
    </div>
  )
}

/**
 * Error.
 *
 * Deja reintentar en vez de obligar a recargar la página. El texto no distingue
 * entre red caída y error del servidor a propósito: para lo que el usuario puede
 * hacer, que es volver a intentarlo, la diferencia no cambia nada.
 */
export function ErrorAlCargar({ onReintentar }: { onReintentar: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/40 py-20 text-center"
    >
      <TriangleAlert className="size-8 text-destructive" aria-hidden="true" />
      <p className="text-sm font-medium">No se ha podido cargar tu vault</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        Comprueba tu conexión e inténtalo de nuevo.
      </p>
      <Button variant="outline" size="sm" onClick={onReintentar}>
        Reintentar
      </Button>
    </div>
  )
}
