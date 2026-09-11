import { useState } from 'react'
import { Check, Copy, Eye, EyeOff, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { copySecret } from '@/lib/vault/copy'
import {
  chooseFromHistory,
  confirmCurrent,
  forgetHistory,
  forgetHistoryEntry,
  hasUnconfirmed,
} from '@/lib/vault/history'
import type { HistoryEntry, ItemContent } from '@/lib/vault/types'

interface PasswordHistoryProps {
  content: ItemContent
  /** Why the gestures cannot be used right now, or nothing when they can. */
  blockedBecause?: string
  /** Writes the new content. The history changes are saved at once, like the star. */
  onChange: (next: ItemContent) => Promise<void>
}

/**
 * The previous passwords of an entry, and the gesture that says which one is good. #621.
 *
 * THE GESTURES SAVE AT ONCE, and not with the form's «Guardar»: they are statements about
 * the entry —this one is current, forget that one— in the same family as the star, which
 * is toggled from the row and saved there. Folding them into the form would have made
 * «esta es la buena» a draft that the form's own save then had to reconcile with a
 * password field the user may also have edited.
 *
 * AND THEY ARE BLOCKED WHILE THE FORM HAS UNSAVED CHANGES, which is the price of that and
 * worth saying: a gesture saved underneath a half-edited form would leave two versions of
 * the entry on screen, and one of them would be wrong.
 */
export function PasswordHistory({ content, blockedBecause, onChange }: PasswordHistoryProps) {
  const [revealed, setRevealed] = useState(false)
  const [confirming, setConfirming] = useState<number | 'all' | null>(null)
  const [busy, setBusy] = useState(false)
  const history = content.history ?? []
  const unconfirmed = hasUnconfirmed(content)
  const disabled = busy || Boolean(blockedBecause)

  const run = async (next: ItemContent) => {
    setBusy(true)

    try {
      await onChange(next)
      setConfirming(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="password-history" className="flex flex-col gap-2 text-sm">
      <h3 id="password-history" className="font-medium">
        Contraseñas anteriores
      </h3>

      {/*
        * `ADR-018` §5.2: the owner has to know the history exists, and it is said where
        * the password is changed and not on a help page — the same rule `ADR-010` set
        * for the recovery key. A history nobody knew about is an unpleasant surprise the
        * day it is found.
        */}
      <p className="text-muted-foreground">
        Si cambias la contraseña, la anterior se guarda aquí. Se guardan tres como mucho, y
        puedes borrarlas.
      </p>

      {unconfirmed && (
        <Notice>
          Esta entrada llegó de dos gestores con contraseñas distintas y nadie ha dicho cuál
          vale. Prueba cuál funciona y márcala como la buena.
        </Notice>
      )}

      {unconfirmed && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={disabled}
          onClick={() => void run(confirmCurrent(content))}
        >
          <Check className="size-4" aria-hidden="true" />
          La actual es la buena
        </Button>
      )}

      {blockedBecause && history.length > 0 && (
        <p className="text-muted-foreground">{blockedBecause}</p>
      )}

      {history.length > 0 && (
        <>
          <ul className="flex flex-col gap-2">
            {history.map((one, index) => (
              <HistoryRow
                key={`${one.date}-${index}`}
                entry={one}
                revealed={revealed}
                disabled={disabled}
                confirmingDelete={confirming === index}
                onChoose={() => void run(chooseFromHistory(content, index))}
                onAskDelete={() => setConfirming(index)}
                onCancelDelete={() => setConfirming(null)}
                onDelete={() => void run(forgetHistoryEntry(content, index))}
              />
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRevealed(!revealed)}
            >
              {revealed ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
              {revealed ? 'Ocultar las anteriores' : 'Ver las anteriores'}
            </Button>

            {confirming === 'all' ? (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={disabled}
                  onClick={() => void run(forgetHistory(content))}
                >
                  Borrarlas todas, sin vuelta atrás
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                  No borrar
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => setConfirming('all')}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Olvidar el historial
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  )
}

/*
 * WITH AN EXPLICIT LOCALE, and that is a lesson and not a style: #561 found that
 * `toLocaleDateString()` without one painted 9 October as 9/10/2026, which on a screen in
 * Spanish reads as 9 September — wrong by a month without looking wrong.
 */
const DATE = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

function HistoryRow({
  entry,
  revealed,
  disabled,
  confirmingDelete,
  onChoose,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  entry: HistoryEntry
  revealed: boolean
  disabled: boolean
  confirmingDelete: boolean
  onChoose: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onDelete: () => void
}) {
  const when = DATE.format(new Date(entry.date))
  /*
   * WHERE IT CAME FROM IS THE FIRST THING SAID, because it decides what the row means: a
   * retired password is history and nothing more, a candidate is a question nobody has
   * answered yet. `origin` exists so that this sentence can be true (`ADR-022` §2.2).
   */
  const origin =
    entry.origin === 'import'
      ? `De otro gestor, sin confirmar · entró el ${when}`
      : `Retirada el ${when}`

  return (
    <li className="flex flex-col gap-1 rounded-md border p-2">
      {/*
        * STACKED AND NOT SIDE BY SIDE, which only a screenshot showed: with the origin on
        * the left taking two lines, the password on the right was pushed past the edge of
        * its card — and revealed, a generated password of twenty characters went further.
        * `break-all` is what lets a long one wrap inside the card instead.
        */}
      <span className="text-muted-foreground">{origin}</span>
      <code className="self-start rounded bg-muted px-1 text-xs break-all">
        {revealed ? entry.password : '••••••••'}
      </code>

      {confirmingDelete ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="destructive" size="sm" disabled={disabled} onClick={onDelete}>
            Borrar esta, sin vuelta atrás
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancelDelete}>
            No borrar
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label={`Esta es la buena: la contraseña ${origin.toLowerCase()}`}
            onClick={onChoose}
          >
            <Check className="size-4" aria-hidden="true" />
            Esta es la buena
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Copiar la contraseña ${origin.toLowerCase()}`}
            onClick={() => void copySecret('Contraseña copiada', entry.password)}
          >
            <Copy className="size-4" aria-hidden="true" />
            Copiar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-label={`Borrar la contraseña ${origin.toLowerCase()}`}
            onClick={onAskDelete}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Borrar
          </Button>
        </div>
      )}
    </li>
  )
}
