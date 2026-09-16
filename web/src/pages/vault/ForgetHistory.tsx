import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { AppLayout } from '@/components/app/AppLayout'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { useSession } from '@/lib/session'
import {
  forgetHistoryEverywhere,
  historyAcrossTheVault,
} from '@/lib/vault/forgetHistoryEverywhere'
import { useActiveVault, useItems, useUpdateItem } from '@/lib/vault/hooks'

/**
 * Where the password history of the WHOLE vault is forgotten. `ADR-018` §2.2, #646.
 *
 * WHY IT IS A SCREEN OF ITS OWN. `ADR-018` puts this «donde se gestiona la seguridad de
 * la cuenta», which is this menu, and not inside an entry: the per-entry gesture already
 * lives there since #621 and answers a different question — this one is about what the
 * vault as a whole is keeping. It is also irreversible over hundreds of entries at once,
 * and that deserves a page that can say so before anything happens rather than a button
 * somewhere else.
 *
 * WHAT IT COUNTS BEFORE ASKING, because a confirmation that does not say how much it is
 * about to destroy is a confirmation nobody can give: how many entries it would touch,
 * how many passwords that is, and how many of those entries hold a candidate nobody
 * confirmed — where forgetting is not only forgetting.
 *
 * IT IS THE CLIENT THAT DOES THE WORK BECAUSE ONLY THE CLIENT CAN: the server does not
 * know which entries have a history, since it cannot read any of them (`ADR-001`). So it
 * is one write per entry, counting, exactly like the import — and like the import, what it
 * has to be able to say when something cuts it halfway is HOW MANY got through.
 */
export function ForgetHistory() {
  const offline = useSession((state) => state.offline)
  const { data: vault } = useActiveVault()
  const { data: items, isPending } = useItems(vault?.id)
  const update = useUpdateItem(vault?.id ?? '')

  const [confirming, setConfirming] = useState(false)
  const [working, setWorking] = useState(false)
  const [progress, setProgress] = useState(0)
  const [outcome, setOutcome] = useState<string | null>(null)

  const across = historyAcrossTheVault(items ?? [])
  const total = across.entries.length

  const run = async () => {
    setWorking(true)
    setConfirming(false)
    setProgress(0)
    setOutcome(null)

    const { done, failure } = await forgetHistoryEverywhere(
      across.entries,
      (item, content) => update.mutateAsync({ itemId: item.id, content }),
      setProgress,
    )

    /*
     * THE COUNT IS THE MESSAGE, in both directions. Forgetting cannot be undone, so
     * saying only «ha fallado» would leave somebody unable to tell whether to run it
     * again — the entries already done have nothing left to forget, so running it again
     * is safe, and that is the sentence that has to be there.
     */
    setOutcome(
      failure
        ? `Se ha olvidado el historial de ${done} de ${total} entradas y algo ha fallado. Las que faltan lo conservan: puedes volver a intentarlo, porque las ya hechas no se tocan.`
        : `Listo: se ha olvidado el historial de ${done} ${done === 1 ? 'entrada' : 'entradas'}.`,
    )
    setWorking(false)
  }

  return (
    <AppLayout title="Contraseñas anteriores">
      <div className="flex max-w-xl flex-col gap-4">
        <p className="text-sm">
          Cuando cambias la contraseña de una entrada, eVault{' '}
          <strong>guarda la anterior</strong> dentro de esa entrada, hasta tres. Sirve para
          volver atrás si el cambio no funcionó. Aquí puedes olvidarlas todas de una vez.
        </p>

        {/*
          * The cost, next to what it buys, in the order #498 arrived at. `ADR-018` §5.1
          * names this as the consequence to face: a vault keeps more secrets than its
          * owner put in it, and some of them were retired precisely because they were
          * compromised. Somebody deciding deserves that sentence, not a document.
          */}
        <p className="text-sm text-muted-foreground">
          Mientras están ahí, tu vault custodia más contraseñas de las que guardaste, y
          algunas las cambiaste justamente porque se habían comprometido. Olvidarlas es lo
          que hace que guardarlas no sea para siempre.
        </p>

        {offline && (
          <Notice>
            Estás viendo la copia guardada en este dispositivo, así que no se puede
            escribir en la vault. Vuelve a conectar para olvidar el historial.
          </Notice>
        )}

        {isPending && <p className="text-sm text-muted-foreground">Mirando la vault…</p>}

        {!isPending && total === 0 && (
          <p className="text-sm text-muted-foreground">
            No hay ninguna contraseña anterior guardada, así que no hay nada que olvidar.
          </p>
        )}

        {!isPending && total > 0 && (
          <>
            <p className="text-sm">
              Hay <strong>{across.passwords}</strong>{' '}
              {across.passwords === 1 ? 'contraseña anterior' : 'contraseñas anteriores'} en{' '}
              <strong>{total}</strong> {total === 1 ? 'entrada' : 'entradas'}.
            </p>

            {/*
              * THE CANDIDATES GET THEIR OWN WARNING, and it is a criterion of #646 rather
              * than a nicety: in these entries two managers disagreed and nobody has said
              * which password works, so forgetting is not only forgetting — it resolves
              * the conflict by throwing away one that may be the good one. It warns and
              * does not refuse: it is the owner's vault.
              */}
            {across.unconfirmed.length > 0 && (
              <Notice>
                En {across.unconfirmed.length}{' '}
                {across.unconfirmed.length === 1
                  ? 'de esas entradas hay una contraseña que vino de otro gestor y nadie ha confirmado cuál funciona'
                  : 'de esas entradas hay contraseñas que vinieron de otro gestor y nadie ha confirmado cuáles funcionan'}
                . Ahí olvidar no es solo olvidar: te quedas con la que la entrada tiene
                ahora, que puede no ser la buena.
                <strong className="mt-2 block">
                  Si puedes, resuélvelas primero desde cada entrada.
                </strong>
              </Notice>
            )}

            {confirming ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="destructive" disabled={working} onClick={() => void run()}>
                  Olvidar {across.passwords}{' '}
                  {across.passwords === 1 ? 'contraseña' : 'contraseñas'} de {total}{' '}
                  {total === 1 ? 'entrada' : 'entradas'}, sin vuelta atrás
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
                  No olvidar nada
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="self-start"
                disabled={working || offline}
                onClick={() => setConfirming(true)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Olvidar el historial de toda la vault
              </Button>
            )}
          </>
        )}

        {working && (
          <p className="text-sm text-muted-foreground" role="status">
            Olvidando {progress} de {total}…
          </p>
        )}

        {outcome && (
          <p className="text-sm" role="alert">
            {outcome}
          </p>
        )}
      </div>
    </AppLayout>
  )
}
