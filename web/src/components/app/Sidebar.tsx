import { NavLink } from 'react-router'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import { UserMenu } from './UserMenu'

interface NavItem {
  to: string
  label: string
  icon: typeof KeyRound
}

/*
 * A single destination for now. The list exists from the start so that adding sections
 * does not force rebuilding the sidebar.
 */
const NAVIGATION: NavItem[] = [{ to: '/', label: 'Vault', icon: KeyRound }]

/**
 * The sidebar's content, without deciding where it is painted.
 *
 * It is used in two places: the desktop's fixed panel and the drawer that overlays on
 * mobile. It is extracted so that the navigation is written once; were it duplicated,
 * adding a section would end up appearing at one screen size and not at the other.
 *
 * Only one of the two exists at a time as far as the accessibility tree is concerned:
 * the desktop panel is hidden with display none below the breakpoint, and the drawer is
 * not mounted until it opens. That is why both can carry the same navigation label
 * without duplicating it.
 */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {/*
       * A fixed height, and not vertical padding: this header and the content's have to
       * measure the same so that their two dividing lines continue across the screen.
       * With `py-*` each derived its height from the size of its own text — `text-base`
       * here, `text-lg` there — and they ended up 4px out of line. It was seen magnified
       * in the screenshot of issue #158.
       *
       * The line goes as a `border-b` of this same box and not as a `<Separator />`
       * below, for the same reason: with `box-sizing: border-box` the border falls
       * inside the 56px, as in AppLayout, whereas a separate divider would start at
       * pixel 56 and the two lines would be one more out of line.
       *
       * If this height changes, AppLayout's has to change with it.
       */}
      <div className="flex h-14 items-center gap-2 border-b border-border px-4 text-base font-semibold tracking-tight">
        <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
        <span>eVault</span>
      </div>

      {/*
        * The nav scrolls, not the page. Today there is one destination and nothing can
        * overflow, but since #350 the sidebar is exactly as tall as the window: without
        * this, the day there are more sections than fit, the ones at the bottom would be
        * unreachable — which is the very defect that issue fixed, moved one level in.
        *
        * It goes on the nav and not on the aside so that the heading and the user menu
        * stay put while the sections scroll between them.
        */}
      <nav aria-label="Principal" className="flex-1 space-y-1 overflow-y-auto p-2">
        {NAVIGATION.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
            // On mobile, navigating closes the drawer. Leaving it open would cover
            // the screen one has just gone to.
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
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {label}
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
