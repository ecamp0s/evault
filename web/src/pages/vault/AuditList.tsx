import { useMemo, useState } from 'react'
import { CheckCircle2, Copy, KeyRound, Ruler, ShieldAlert } from 'lucide-react'
import { logOut } from '@/lib/auth'
import { VaultLocked } from '@/lib/vault/keyInMemory'
import { useActiveVault, useItems } from '@/lib/vault/hooks'
import { SHORT_BELOW, auditPasswords, type Finding } from '@/lib/vault/audit'
import type { Item } from '@/lib/vault/types'
import { ItemDialog } from './ItemDialog'
import { Loading, LoadError, VaultClosed } from './ListStates'
import { tagsInVault } from '@/lib/vault/tags'

/** What each finding is called and how it is explained, in the order they are shown. */
const FINDINGS: { id: Finding; title: string; explanation: string; icon: typeof Copy }[] = [
  {
    id: 'repeated',
    title: 'Repetidas',
    /*
     * Repetition first because it is the one with a real blast radius: a password
     * leaked at one service opens every other that shares it, and that is the attack
     * this whole application exists to make impossible.
     */
    explanation:
      'Una filtración en cualquiera de estos sitios abre los demás. Es lo primero que conviene cambiar.',
    icon: Copy,
  },
  {
    id: 'short',
    title: 'Cortas',
    explanation: `Menos de ${SHORT_BELOW} caracteres. Se prueban por fuerza bruta antes de que te enteres.`,
    icon: Ruler,
  },
  {
    id: 'weak',
    title: 'De un solo tipo',
    explanation:
      'Solo letras, o solo números. Da igual lo largas que sean: el abanico de posibilidades es estrecho.',
    icon: KeyRound,
  },
]

/**
 * What is wrong with the passwords in this vault, and the way to fix each one.
 *
 * IT IS A SCREEN OF ITS OWN AND NOT A DIALOG, decided here as #422 asked. What it shows
 * is a list that can be long — on the real vault of 370 entries, everything repeated is
 * in here — and a dialog would put a scrolling box inside a scrolling box, which #437
 * has just shown is where this gets painful on a phone. A screen also has an address,
 * so it can be linked and come back to.
 *
 * NO PASSWORD IS EVER PAINTED, and that is the guarantee #421 could not hold: it says
 * «these four share a password», never which one. The vault is open, so an attacker
 * sitting here already has everything — but somebody looking over a shoulder does not,
 * and a screen whose whole job is to group passwords by equality is exactly where that
 * distinction gets lost by accident.
 */
export function AuditList() {
  const vault = useActiveVault()
  const items = useItems(vault.data?.id)
  const [editing, setEditing] = useState<Item | null>(null)

  const audit = useMemo(() => auditPasswords(items.data ?? []), [items.data])
  const tagsInUse = useMemo(() => tagsInVault(items.data ?? []), [items.data])

  /*
   * The same three states as the list, and in the same order: a locked vault arrives as
   * a query failure like a downed network and is not one, so it gets its own branch
   * before the generic error. See the long note in ItemList.tsx.
   */
  if (vault.error instanceof VaultLocked || items.error instanceof VaultLocked) {
    return <VaultClosed onSignInAgain={() => void logOut()} />
  }

  if (vault.isError || items.isError) {
    return <LoadError onRetry={() => void (vault.isError ? vault.refetch() : items.refetch())} />
  }

  if (vault.isPending || items.isPending) return <Loading />

  const withFindings = FINDINGS.map((finding) => ({
    ...finding,
    entries: audit.flagged.filter((one) => one.findings.includes(finding.id)),
  })).filter((finding) => finding.entries.length > 0)

  return (
    <div className="flex flex-col gap-6">
      <Summary flagged={audit.flagged.length} withPassword={audit.withPassword} />

      {withFindings.map(({ id, title, explanation, icon: Icon, entries }) => (
        <section key={id} aria-labelledby={`hallazgo-${id}`} className="flex flex-col gap-2">
          <div>
            <h2 id={`hallazgo-${id}`} className="flex items-center gap-2 font-medium">
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {title}
              <span className="text-muted-foreground">({entries.length})</span>
            </h2>
            <p className="text-sm text-muted-foreground">{explanation}</p>
          </div>

          <ul className="flex flex-col gap-2">
            {entries.map(({ item, sharedWith }) => (
              <li key={item.id}>
                {/*
                  * The whole row opens the entry, with the generator already inside it.
                  * A list that names the problem and leaves finding the entry to the
                  * reader is an accusation, not a tool — and on 370 entries, finding it
                  * again is the expensive part.
                  */}
                <button
                  type="button"
                  onClick={() => setEditing(item)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{item.content.nombre}</span>
                    {item.content.usuario && (
                      <span className="block truncate text-sm text-muted-foreground">
                        {item.content.usuario}
                      </span>
                    )}
                  </span>

                  {/*
                    * The number of entries sharing it, never the password. It is what
                    * turns «repetida» into something with a size: changing one that four
                    * entries share is worth more than changing one that two do.
                    */}
                  {sharedWith !== undefined && id === 'repeated' && (
                    <span className="shrink-0 text-sm text-muted-foreground">
                      la comparten {sharedWith}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {editing && (
        <ItemDialog
          vaultId={vault.data?.id ?? ''}
          item={editing}
          tagsInUse={tagsInUse}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

/**
 * The headline, which is the number that says whether this is getting better.
 *
 * It counts ENTRIES WITH SOMETHING TO SAY over entries with a password, and not over
 * everything in the vault: a card number or a note kept here has no password to audit,
 * and counting it would quietly improve the proportion without anything improving.
 */
function Summary({ flagged, withPassword }: { flagged: number; withPassword: number }) {
  if (withPassword === 0) {
    return (
      <p className="text-muted-foreground">
        Todavía no hay contraseñas que revisar en esta vault.
      </p>
    )
  }

  if (flagged === 0) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground">
        <CheckCircle2 className="size-5 shrink-0 text-primary" aria-hidden="true" />
        Ninguna de tus {withPassword} contraseñas tiene nada que corregir.
      </p>
    )
  }

  return (
    <p className="flex items-center gap-2">
      <ShieldAlert className="size-5 shrink-0 text-destructive" aria-hidden="true" />
      <span>
        <strong>{flagged}</strong> de tus {withPassword} contraseñas tienen algo que
        corregir.
      </span>
    </p>
  )
}
