import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ChevronsUpDown, KeyRound, KeySquare, LogOut } from 'lucide-react'
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
import { logOut } from '@/lib/auth'
import { useSession } from '@/lib/session'

/** Dos letras a partir del nombre, para el avatar sin imagen. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)

  if (words.length === 0) {
    return '?'
  }

  return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase()
}

export function UserMenu() {
  const navigate = useNavigate()
  const user = useSession((state) => state.user)
  const [leaving, setLeaving] = useState(false)

  if (!user) {
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
          <AvatarFallback>{initials(user.name)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{user.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        {/* DropdownMenuLabel tiene que ir dentro de un Group: suelto, Base UI
            lanza un error no capturado que deja la página en blanco. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="block truncate">{user.name}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {user.email}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => void navigate('/contrasena-maestra')}>
            <KeySquare aria-hidden="true" />
            Contraseña maestra
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void navigate('/clave-de-recuperacion')}>
            <KeyRound aria-hidden="true" />
            Clave de recuperación
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={leaving}
            onClick={() => {
              setLeaving(true)
              void logOut()
            }}
          >
            <LogOut aria-hidden="true" />
            {leaving ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
