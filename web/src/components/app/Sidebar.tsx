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
 * secciones no obligue a rehacer el sidebar.
 */
const NAVEGACION: ItemDeNavegacion[] = [{ a: '/', etiqueta: 'Vault', icono: KeyRound }]

/**
 * El contenido de la barra lateral, sin decidir dónde se pinta.
 *
 * Se usa en dos sitios: el panel fijo del escritorio y el cajón que se superpone
 * en móvil. Está extraído para que la navegación se escriba una sola vez; si
 * estuviera duplicada, añadir una sección acabaría apareciendo en un tamaño de
 * pantalla y no en el otro.
 *
 * Solo uno de los dos existe a la vez de cara al árbol de accesibilidad: el
 * panel del escritorio se oculta con display none por debajo del punto de
 * ruptura, y el cajón no se monta hasta que se abre. Por eso los dos pueden
 * llevar la misma etiqueta de navegación sin duplicarla.
 */
export function Sidebar({ onNavegar }: { onNavegar?: () => void }) {
  return (
    <>
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
            // En móvil, navegar cierra el cajón. Dejarlo abierto taparía la
            // pantalla a la que se acaba de ir.
            onClick={onNavegar}
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
    </>
  )
}
