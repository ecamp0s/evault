import { memo, useCallback, useState } from 'react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/app/AppLayout'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { ApiError } from '@/lib/api'
import { useSession } from '@/lib/session'
import { OfflineWrite } from '@/lib/vault/api'
import { useActiveVault, usePurgeItem, useRestoreItem, useTrash } from '@/lib/vault/hooks'
import type { TrashedItem } from '@/lib/vault/types'

const DAY_MS = 24 * 60 * 60 * 1000

/** A date in Spanish, spelled out for the reason `Passkeys` gives. */
function formatDate(iso: string): string {
  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) return 'una fecha que no se ha podido leer'

  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/**
 * When the purge takes it, as a sentence.
 *
 * The date comes from the server (`purges_at`), so the thirty days of ADR-018 §2.4 are
 * not written here. What this adds is the countdown, and the one case a date alone would
 * get wrong: an entry already due that the purge has not reached yet, because it runs at
 * night and the machine may have been off. «Hace dos días» would read as a bug.
 */
function purgeSentence(purgesAt: string, now: number): string {
  const left = Math.ceil((new Date(purgesAt).getTime() - now) / DAY_MS)

  if (Number.isNaN(left) || left <= 0) {
    return 'Se borrará del todo en la próxima limpieza de la papelera.'
  }

  return `Se borrará del todo el ${formatDate(purgesAt)}, ${
    left === 1 ? 'dentro de un día' : `dentro de ${left} días`
  }.`
}

/** What went wrong, keeping the reassurance that matters: nothing changed. */
function failureMessage(error: ApiError, action: 'restore' | 'purge'): string {
  const unchanged = 'La entrada sigue en la papelera.'

  if (error instanceof OfflineWrite) {
    return `Estás viendo la copia guardada en este dispositivo. Vuelve a conectar. ${unchanged}`
  }

  return error.isNetwork
    ? `No hemos podido conectar. ${unchanged}`
    : `No se ha podido ${action === 'restore' ? 'restaurar' : 'borrar'}. ${unchanged}`
}

/**
 * The bin: what was deleted in the last thirty days, to take back or to delete for good.
 * ADR-018 §2.4, #709.
 *
 * NO SENTENCE ON THIS SCREEN SAYS «THIRTY». Each row gives its own date, which the
 * server computed; a number written here would be one more place to forget the day the
 * retention changes, and it would contradict the rows without anything failing.
 *
 * IN THE SIDEBAR AND NOT IN THE USER MENU, which is where #709 first put it. That menu is
 * the account and this device —the email, the master password, the ways in—; the bin is
 * the vault's contents, like the list and the review beside it, and it is where somebody
 * who just deleted the wrong entry will look.
 *
 * NOTHING HERE WORKS OFFLINE, and it says so instead of showing an empty bin: the device
 * keeps a copy of the vault (ADR-019), not of what was thrown away, and both actions are
 * writes.
 */
interface TrashRowProps {
  item: TrashedItem
  now: number
  confirming: boolean
  pending: boolean
  onRestore: (item: TrashedItem) => void
  onAskPurge: (item: TrashedItem) => void
  onPurge: (item: TrashedItem) => void
  onKeep: () => void
}

/**
 * One entry of the bin.
 *
 * MEMOISED, AND MEASURED BEFORE DECIDING. With 371 entries in the bin —which is what a
 * mass deletion leaves, and the real vault has 669— restoring ONE took 2,2 s on the
 * development server, of which the request was 36 ms: every change of state re-rendered
 * every row. With each row memoised and the busy state kept per row it took 1 s there,
 * and on the production build 0,2 s to restore one and 0,5 s to open a bin of 369.
 * Virtualising, as the vault list does (#349), was the heavier alternative and those
 * numbers did not ask for it.
 */
const TrashRow = memo(function TrashRow({
  item,
  now,
  confirming,
  pending,
  onRestore,
  onAskPurge,
  onPurge,
  onKeep,
}: TrashRowProps) {
  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex min-w-0 flex-col">
        {/* An address can be hundreds of characters with no space (#654). */}
        <span className="text-sm font-medium break-words">{item.content.name}</span>
        <span className="text-xs text-muted-foreground">Borrada el {formatDate(item.deletedAt)}.</span>
        <span className="text-xs text-muted-foreground">{purgeSentence(item.purgesAt, now)}</span>
      </div>

      {confirming ? (
        <div role="alertdialog" aria-label="Confirmar" className="flex flex-col gap-2">
          <p className="text-sm">
            <strong>{item.content.name}</strong> se borrará del todo ahora. Esto sí que no
            tiene vuelta atrás.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => onPurge(item)}
            >
              Borrar del todo
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onKeep}>
              Dejarla en la papelera
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={pending} onClick={() => onRestore(item)}>
            Restaurar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => onAskPurge(item)}
          >
            Borrar del todo
          </Button>
        </div>
      )}
    </div>
  )
})

export function Trash() {
  const offline = useSession((state) => state.offline)
  const { data: vault } = useActiveVault()
  const vaultId = vault?.id ?? ''
  const { data: items, isPending, isError } = useTrash(vault?.id, !offline)
  // mutateAsync is stable across renders, which is what lets the callbacks below be too.
  const { mutateAsync: restoreItem } = useRestoreItem(vaultId)
  const { mutateAsync: purgeItem } = usePurgeItem(vaultId)

  const [confirming, setConfirming] = useState<string | null>(null)
  // Per entry and not for the whole screen: see TrashRow.
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Read once, when the screen opens, so that every row counts from the same instant and
  // rendering stays pure. A countdown in days does not need to tick while it is open.
  const [now] = useState(() => Date.now())

  const run = useCallback(
    async (item: TrashedItem, action: 'restore' | 'purge') => {
      setError(null)
      setPendingId(item.id)

      try {
        if (action === 'restore') {
          await restoreItem(item.id)
          toast.success(`Se ha restaurado «${item.content.name}».`)
        } else {
          await purgeItem(item.id)
          setConfirming(null)
          toast.success(`Se ha borrado del todo «${item.content.name}».`)
        }
      } catch (failure) {
        if (!(failure instanceof ApiError)) throw failure

        setError(failureMessage(failure, action))
      } finally {
        setPendingId(null)
      }
    },
    [restoreItem, purgeItem],
  )

  const onRestore = useCallback((item: TrashedItem) => void run(item, 'restore'), [run])
  const onPurge = useCallback((item: TrashedItem) => void run(item, 'purge'), [run])
  const onAskPurge = useCallback((item: TrashedItem) => {
    setError(null)
    setConfirming(item.id)
  }, [])
  const onKeep = useCallback(() => setConfirming(null), [])

  return (
    <AppLayout title="Papelera">
      <div className="flex max-w-xl flex-col gap-4">
        <p className="text-sm">
          Lo que borras de la vault se queda aquí antes de borrarse del todo, y desde aquí
          puedes <strong>restaurarlo tal como estaba</strong>. Cada entrada dice hasta cuándo.
        </p>

        {offline && (
          <Notice>
            Estás viendo la copia guardada en este dispositivo, y la papelera no forma
            parte de ella. Vuelve a conectar para ver lo que has borrado.
          </Notice>
        )}

        {!offline && isError && (
          <p role="alert" className="text-sm text-destructive">
            No hemos podido leer la papelera. Recarga la página.
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {!offline && !isError && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">
              {isPending
                ? 'Mirando la papelera…'
                : items?.length
                  ? `${items.length} ${items.length === 1 ? 'entrada' : 'entradas'} en la papelera`
                  : 'La papelera está vacía.'}
            </h2>

            {items?.map((item) => (
              <TrashRow
                key={item.id}
                item={item}
                now={now}
                confirming={confirming === item.id}
                pending={pendingId === item.id}
                onRestore={onRestore}
                onAskPurge={onAskPurge}
                onPurge={onPurge}
                onKeep={onKeep}
              />
            ))}
          </section>
        )}
      </div>
    </AppLayout>
  )
}
