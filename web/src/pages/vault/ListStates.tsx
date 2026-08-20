import { KeyRound, Lock, Plus, SearchX, TriangleAlert, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * The states of the list that are not «there are items».
 *
 * They live together and apart from the list because they are half the work of this
 * screen: the first time the application shows the user's data, and it has to be
 * fetched and decoded before anything can be painted. Without these states, the
 * ordinary case of a freshly created vault would be a blank screen.
 */

/**
 * Loading.
 *
 * Silhouettes are painted rather than a «loading» text because the list appears in the
 * same place, and this way the content does not jump when it arrives. aria-hidden and
 * the list's aria-busy take care of a screen reader not reading the filler.
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
 * Empty vault.
 *
 * It is the first state every new user sees, so it does not say «there is no data» but
 * what is going to happen here.
 *
 * On the text and its history: during Iteration 2 this place was forbidden from
 * mentioning encryption, because the content travelled encoded and saying so would have
 * been a lie. With issue #59 closed the promise is true, so it is made, and the test
 * that used to prevent writing it has been inverted: now it fails if it disappears.
 *
 * The rule that comes out of this, and that is worth keeping: when the interface makes
 * a promise about security, the test that fails if the promise stops being true gets
 * written.
 *
 * **Importing has to be here, and not only in the list's bar.** The bar only exists
 * once there are entries, so until issue #157 whoever had just signed up had no way at
 * all to bring a copy over: to find the button one had to create an entry by hand first
 * and delete it afterwards. Exactly the reverse of what they need, because an empty
 * vault is the one situation in which somebody wants to import. It came from #123 and
 * went undetected because the import was always tested with items in front of it.
 */
export function EmptyVault({
  onCreate,
  onImport,
}: {
  onCreate: () => void
  onImport: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-20 text-center">
      <KeyRound className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">Tu vault está vacía</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        Las contraseñas que guardes se cifran en este dispositivo antes de salir de él.
        Solo tú puedes leerlas.
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        <Button size="sm" onClick={onCreate}>
          <Plus className="size-4" aria-hidden="true" />
          Guardar la primera
        </Button>
        <Button size="sm" variant="outline" onClick={onImport}>
          <Upload className="size-4" aria-hidden="true" />
          Importar
        </Button>
      </div>
    </div>
  )
}

/**
 * Error.
 *
 * It allows retrying instead of forcing a page reload. The text deliberately does not
 * distinguish a downed network from a server error: for what the user can do, which is
 * try again, the difference changes nothing.
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
 * There are items, but none matches what was searched for.
 *
 * It is a different state from the empty vault and that is why it has a component of
 * its own. If filtering with no results showed «your vault is empty», the user would
 * read that they have lost their passwords, which is among the worst things a password
 * manager can tell them over a mere filter.
 *
 * This component's name used to carry a note saying it was in English by the language
 * convention while the rest of the file waited for issue #97. That issue closed on 4
 * August 2026, and #320 converted the rest, so the note has lost its subject.
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
 * The vault is locked: there is a token, but no key to decrypt with.
 *
 * **It is a safety net and not the ordinary path.** Since issue #73 the token dies on
 * reload just as the key does, so the guard sends people to `/desbloquear` before this
 * screen gets to mount. Seeing it would take the two lifetimes coming apart, which is
 * precisely what `ADR-007` meant to avoid by making them equal.
 *
 * It is kept because the cost is one branch and what it covers is the interface lying
 * about the cause: before it existed it said «check your connection», with the network
 * perfectly fine and nothing to retry. If it ever turns up again, what needs fixing is
 * not this text but why the token outlived the key.
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
        Tus datos siguen aquí y cifrados. Para leerlos hace falta tu contraseña maestra,
        que no se guarda en ningún sitio.
      </p>
      <Button size="sm" className="mt-1" onClick={onSignInAgain}>
        Introducir la contraseña
      </Button>
    </div>
  )
}
