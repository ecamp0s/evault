import { useState, type ReactNode } from 'react'
import { PanelLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Sidebar } from './Sidebar'

interface AppLayoutProps {
  title: string
  children: ReactNode
}

/**
 * Armazón de la aplicación autenticada.
 *
 * Dos formas según el ancho, con el punto de ruptura en `md`, 768 px. Por encima,
 * la barra lateral está fija a la izquierda y siempre visible. Por debajo se
 * retira y se alcanza desde un botón en la cabecera, que la abre como un cajón
 * superpuesto.
 *
 * El corte está en 768 y no en 640 porque a 640 el contenido se quedaría en unos
 * 400 px con la barra fija: técnicamente cabe, pero es incómodo para una lista con
 * acciones a la derecha. Por debajo de 768 se gana la pantalla entera.
 *
 * El cajón es un Dialog y no un panel hecho a mano, y no es pereza: trae atrapado
 * del foco, cierre con Escape, devolución del foco al botón que lo abrió y
 * aria-modal. Reimplementar todo eso para un cajón es la manera habitual de acabar
 * con una navegación que el teclado no puede cerrar.
 */
export function AppLayout({ title, children }: AppLayoutProps) {
  const [menuAbierto, setMenuAbierto] = useState(false)

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border md:flex">
        <Sidebar />
      </aside>

      <Dialog open={menuAbierto} onOpenChange={setMenuAbierto}>
        <DialogContent
          showCloseButton={false}
          className="top-0 left-0 flex h-svh w-60 max-w-[80vw] translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-r border-border p-0 ring-0 sm:max-w-[80vw]"
        >
          {/*
            * Un diálogo necesita nombre accesible aunque no se vea ninguno. Sin
            * este título, un lector de pantalla anuncia el cajón sin decir qué es.
            */}
          <DialogTitle className="sr-only">Navegación</DialogTitle>
          <Sidebar onNavigate={() => setMenuAbierto(false)} />
        </DialogContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* La misma altura fija que la cabecera del Sidebar, y por el mismo
            motivo: sus dos líneas divisorias tienen que continuarse. Ver allí. */}
        <header className="flex h-14 items-center gap-2 border-b border-border px-4 md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Abrir la navegación"
            onClick={() => setMenuAbierto(true)}
          >
            <PanelLeft className="size-4" aria-hidden="true" />
          </Button>

          <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
