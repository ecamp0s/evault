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
 * The frame of the authenticated application.
 *
 * Two shapes depending on the width, with the breakpoint at `md`, 768 px. Above it, the
 * sidebar is fixed on the left and always visible. Below it withdraws and is reached
 * from a button in the header, which opens it as an overlaid drawer.
 *
 * The cut is at 768 and not at 640 because at 640 the content would be left at some
 * 400 px with the bar fixed: technically it fits, but it is uncomfortable for a list
 * with actions on the right. Below 768 the whole screen is gained.
 *
 * The drawer is a Dialog and not a hand-built panel, and that is not laziness: it brings
 * focus trapping, closing with Escape, returning focus to the button that opened it and
 * aria-modal. Reimplementing all of that for a drawer is the usual way to end up with a
 * navigation the keyboard cannot close.
 */
export function AppLayout({ title, children }: AppLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border md:flex">
        <Sidebar />
      </aside>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent
          showCloseButton={false}
          className="top-0 left-0 flex h-svh w-60 max-w-[80vw] translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-r border-border p-0 ring-0 sm:max-w-[80vw]"
        >
          {/*
            * A dialog needs an accessible name even when none is visible. Without this
            * title, a screen reader announces the drawer without saying what it is.
            */}
          <DialogTitle className="sr-only">Navegación</DialogTitle>
          <Sidebar onNavigate={() => setMenuOpen(false)} />
        </DialogContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* The same fixed height as the Sidebar's header, and for the same
            motivo: sus dos líneas divisorias tienen que continuarse. Ver allí. */}
        <header className="flex h-14 items-center gap-2 border-b border-border px-4 md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Abrir la navegación"
            onClick={() => setMenuOpen(true)}
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
