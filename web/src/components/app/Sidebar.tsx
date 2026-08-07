import { NavLink } from 'react-router'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import { UserMenu } from './UserMenu'

interface NavItem {
  a: string
  etiqueta: string
  icono: typeof KeyRound
}

/*
 * Un solo destino por ahora. La lista existe desde el principio para que añadir
 * secciones no obligue a rehacer el sidebar.
 */
const NAVEGACION: NavItem[] = [{ a: '/', etiqueta: 'Vault', icono: KeyRound }]

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
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {/*
       * Altura fija, y no un padding vertical: esta cabecera y la del contenido
       * tienen que medir lo mismo para que sus dos líneas divisorias se continúen
       * a lo largo de la pantalla. Con `py-*` cada una derivaba su altura del
       * tamaño de su propio texto —`text-base` aquí, `text-lg` allí— y quedaban
       * desalineadas 4px. Se vio ampliado en el screenshot del issue #158.
       *
       * La línea va como `border-b` de esta misma caja y no como un `<Separator />`
       * debajo, por lo mismo: con `box-sizing: border-box` el borde entra dentro de
       * los 56px, igual que en AppLayout, mientras que un separador aparte empezaría
       * en el píxel 56 y las dos líneas quedarían desalineadas una más.
       *
       * Si se cambia esta altura, hay que cambiar la de AppLayout con ella.
       */}
      <div className="flex h-14 items-center gap-2 border-b border-border px-4 text-base font-semibold tracking-tight">
        <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
        <span>eVault</span>
      </div>

      <nav aria-label="Principal" className="flex-1 space-y-1 p-2">
        {NAVEGACION.map(({ a, etiqueta, icono: Icono }) => (
          <NavLink
            key={a}
            to={a}
            end
            // En móvil, navegar cierra el cajón. Dejarlo abierto taparía la
            // pantalla a la que se acaba de ir.
            onClick={onNavigate}
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
        <UserMenu />
      </div>
    </>
  )
}
