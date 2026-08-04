import { KeyRound, Lock, Plus, SearchX, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Los estados de la lista que no son «hay items».
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
export function Loading() {
  return (
    <ul className="space-y-2" aria-busy="true" aria-label="Cargando la vault">
      {[0, 1, 2].map((row) => (
        <li
          key={row}
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
 * Sobre el texto y su historia: durante la Iteración 2 este sitio tenía prohibido
 * mencionar el cifrado, porque el contenido viajaba codificado y decirlo habría
 * sido mentir. Con el issue #59 cerrado la promesa es cierta, así que se hace, y el
 * test que impedía escribirla se ha invertido: ahora falla si desaparece.
 *
 * La regla de la que sale esto, y que conviene no perder: cuando la interfaz haga
 * una promesa sobre seguridad, se escribe el test que falla si la promesa deja de
 * ser cierta.
 */
export function EmptyVault({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-20 text-center">
      <KeyRound className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">Tu vault está vacía</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        Las contraseñas que guardes se cifran en este dispositivo antes de logOut de él.
        Solo tú puedes leerlas.
      </p>
      <Button size="sm" className="mt-1" onClick={onCreate}>
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
export function LoadError({ onRetry }: { onRetry: () => void }) {
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
      <Button variant="outline" size="sm" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  )
}

/**
 * Hay items, pero ninguno coincide con lo buscado.
 *
 * Es un estado distinto de la vault vacía y por eso tiene su propio componente. Si
 * al filtrar sin resultados se enseñara «tu vault está vacía», el usuario leería que
 * ha perdido sus contraseñas, que es de las peores cosas que le puede decir un
 * gestor de contraseñas por un simple filtro.
 *
 * Nombre en inglés por la convención de idioma, que rige para lo nuevo. El resto de
 * este fichero espera al issue #97.
 */
export function NoResults({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-20 text-center">
      <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">Ninguna entrada coincide con «{query}»</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        Se busca por nombre, usuario, dirección y notas. Tus otras entradas siguen ahí.
      </p>
    </div>
  )
}

/**
 * La vault está bloqueada: hay token, pero no hay clave con la que descifrar.
 *
 * **Es una red de seguridad y no el camino normal.** Desde el issue #73 el token
 * muere al recargar igual que la clave, así que el guard manda a `/desbloquear`
 * antes de que esta pantalla llegue a montarse. Para verlo haría falta que las dos
 * vidas se separaran, que es justo lo que `ADR-007` quiso evitar al igualarlas.
 *
 * Se conserva porque el coste es una rama y lo que cubre es que la interfaz mienta
 * sobre la causa: antes de existir decía «comprueba tu conexión», con la red
 * perfectamente y sin nada que reintentar. Si algún día vuelve a aparecer, lo que
 * hay que arreglar no es este texto sino por qué el token sobrevivió a la clave.
 */
export function VaultClosed({ onSignInAgain }: { onSignInAgain: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-20 text-center"
    >
      <Lock className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">Tu vault está bloqueada</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        Tus data siguen aquí y cifrados. Para leerlos hace falta tu contraseña maestra,
        que no se guarda en ningún sitio.
      </p>
      <Button size="sm" className="mt-1" onClick={onSignInAgain}>
        Introducir la contraseña
      </Button>
    </div>
  )
}
