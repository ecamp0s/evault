import { AlertCircle } from 'lucide-react'

/**
 * Banner para los errores que no pertenecen a ningún campo concreto:
 * credenciales incorrectas, API caída, o un fallo del servidor.
 *
 * Los errores que sí son de un campo no vienen aquí, van bajo su campo.
 */
export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) {
    return null
  }

  return (
    <div
      // role="alert" hace que un lector de pantalla lo anuncie al aparecer. Sin
      // esto el error es invisible para quien no ve el cambio de color.
      role="alert"
      className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}
