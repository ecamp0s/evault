import { KeyRound } from 'lucide-react'
import { AppLayout } from '@/components/app/AppLayout'

/**
 * Pantalla principal de la aplicación autenticada.
 *
 * El contenido es un placeholder a propósito: el CRUD de vault items es la
 * Iteración 2. Lo que este issue entrega es el armazón que lo albergará.
 */
export function Inicio() {
  return (
    <AppLayout titulo="Vault">
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-20 text-center">
        <KeyRound className="size-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Tu vault aparecerá aquí</p>
      </div>
    </AppLayout>
  )
}
