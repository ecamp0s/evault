import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import { MenuDeUsuario } from './MenuDeUsuario'

interface ItemDeNavegacion {
  a: string
  etiqueta: string
  icono: typeof KeyRound
}

/*
 * Un solo destino por ahora. La lista existe desde el principio para que añadir
 * secciones en la Iteración 2 no obligue a rehacer el sidebar.
 */
const NAVEGACION: ItemDeNavegacion[] = [{ a: '/', etiqueta: 'Vault', icono: KeyRound }]

interface AppLayoutProps {
  titulo: string
  children: ReactNode
}

/**
 * Armazón de la aplicación autenticada: sidebar fija a la izquierda y área de
 * contenido con cabecera.
 *
 * Sin versión colapsable ni móvil, como dice el issue #6: eso se aborda cuando
 * llegue el diseño móvil, no antes.
 */
export function AppLayout({ titulo, children }: AppLayoutProps) {
  return (
    <div className="flex min-h-svh bg-background">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border">
        <div className="flex items-center gap-2 px-4 py-4 text-base font-semibold tracking-tight">
          <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
          <span>eVault</span>
        </div>

        <Separator />

        <nav aria-label="Principal" className="flex-1 space-y-1 p-2">
          {NAVEGACION.map(({ a, etiqueta, icono: Icono }) => (
            <NavLink
              key={a}
              to={a}
              end
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <Icono className="size-4 shrink-0" aria-hidden="true" />
              {etiqueta}
            </NavLink>
          ))}
        </nav>

        <Separator />

        <div className="p-2">
          <MenuDeUsuario />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border px-6 py-4">
          <h1 className="text-lg font-semibold tracking-tight">{titulo}</h1>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
