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

/** Two letters out of the name, for the avatar with no image. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)

  if (words.length === 0) {
    return '?'
  }

  return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase()
}

export function UserMenu() {
  const navigate = useNavigate()
  /*
   * The remembered one when there is no session user, which is the offline case: there
   * the server never answered, so all this browser knows about who is inside is a name
   * and an email — which is exactly what this menu paints. See ADR-019.
   *
   * It falls back rather than the store inventing a `User`, because the other fields of
   * one are facts other screens read, and made-up facts are worse than absent ones.
   */
  const sessionUser = useSession((state) => state.user)
  const rememberedUser = useSession((state) => state.rememberedUser)
  const user = sessionUser ?? rememberedUser
  const [leaving, setLeaving] = useState(false)

  if (!user) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        // Base UI composes with `render`, not with Radix's `asChild`.
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
        {/* DropdownMenuLabel has to live inside a Group: on its own, Base UI throws
            an uncaught error that leaves the page blank. */}
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
          <DropdownMenuItem onClick={() => void navigate('/email')}>
            Correo electrónico
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void navigate('/master-password')}>
            <KeySquare aria-hidden="true" />
            Contraseña maestra
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void navigate('/recovery-key')}>
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
