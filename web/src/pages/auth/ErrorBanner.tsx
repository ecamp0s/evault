import { AlertCircle } from 'lucide-react'

/**
 * A banner for the errors that belong to no particular field: wrong credentials, a
 * downed API, or a server failure.
 *
 * The errors that do belong to a field do not come here, they go under their field.
 */
export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) {
    return null
  }

  return (
    <div
      // role="alert" makes a screen reader announce it as it appears. Without this the
      // error is invisible to whoever does not see the change of colour.
      role="alert"
      className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}
