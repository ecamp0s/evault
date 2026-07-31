import { useState } from 'react'
import { ChevronsUpDown, LogOut } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { salir } from '@/lib/auth'
import { useSesion } from '@/lib/sesion'

/** Dos letras a partir del nombre, para el avatar sin imagen. */
function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean)

  if (palabras.length === 0) {
    return '?'
  }

  return (palabras[0][0] + (palabras[1]?.[0] ?? '')).toUpperCase()
}

export function MenuDeUsuario() {
  const usuario = useSesion((estado) => estado.usuario)
  const [saliendo, setSaliendo] = useState(false)

  if (!usuario) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        // Base UI compone con `render` y no con `asChild` como Radix.
        render={
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          />
        }
      >
        <Avatar size="sm">
          <AvatarFallback>{iniciales(usuario.name)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{usuario.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{usuario.email}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        {/* DropdownMenuLabel tiene que ir dentro de un Group: suelto, Base UI
            lanza un error no capturado que deja la página en blanco. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="block truncate">{usuario.name}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {usuario.email}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={saliendo}
            onClick={() => {
              setSaliendo(true)
              void salir()
            }}
          >
            <LogOut aria-hidden="true" />
            {saliendo ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
