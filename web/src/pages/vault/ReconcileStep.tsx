import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  hasConflict,
  identityOf,
  type DuplicateGroup,
  type GroupDecision,
} from '@/lib/vault/import'
import type { ItemContent } from '@/lib/vault/types'

/**
 * Deciding what to do with the entries that look like the same account. See `ADR-022`.
 *
 * IT SEPARATES THE GROUPS THAT ARE A DECISION FROM THE ONES THAT ARE NOT, and that is
 * the shape the measurement dictated rather than a preference. Over the real exports
 * (#610) there are **261 groups and only 25 with differing passwords**: in the other 236
 * the passwords agree, so merging fills in gaps and there is nothing to choose. A screen
 * that asked 261 questions would be answered with «yes to everything» without reading,
 * which is the lesson of #62 arriving through a different door.
 *
 * So the 236 are one sentence and one control, and the 25 are a list.
 *
 * THE PASSWORDS ARE NOT PAINTED, and this needed deciding rather than inheriting: it is
 * the one screen in the project where seeing two passwords at once is what the task
 * consists of. The rule is `audit.ts`'s, which says «these four share a password» and
 * never which one: what is shown is THAT they differ, and each one is revealed by an
 * explicit action. Against somebody who already has the vault open it protects nothing;
 * against somebody reading over a shoulder in a public place it does, and that is the real one.
 */
interface ReconcileStepProps {
  groups: DuplicateGroup[]
  incoming: ItemContent[]
  existing: ItemContent[]
  decisions: Map<string, { decision: GroupDecision; survivor: DuplicateGroup['survivor'] }>
  onChange: (identity: string, decision: GroupDecision) => void
  onChooseSurvivor: (identity: string, survivor: DuplicateGroup['survivor']) => void
  /** Applies one decision to a named set of groups, and only to those. */
  onApplyToAll: (identities: string[], decision: GroupDecision) => void
}

/** The fields that can tell two entries of one group apart, in the order they are tried. */
const TELLING_FIELDS = ['url', 'notes', 'totp'] as const

const FIELD_NAMES: Record<(typeof TELLING_FIELDS)[number], string> = {
  url: 'la dirección',
  notes: 'las notas',
  totp: 'el segundo factor',
}

interface Member {
  label: string
  /** What tells this one from the others of its group. Empty when nothing does. */
  detail: string
  content: ItemContent
  where: DuplicateGroup['survivor']
}

/**
 * The entries of a group, in the order they are offered: the vault's first.
 *
 * EACH ONE CARRIES WHAT TELLS IT APART, and that came from looking at the screen rather
 * than from a test. Two rows of the same file were both offered as «la del fichero»,
 * identical, right under a question asking which one to keep — the sentence said they
 * differed in the address and the options did not show the address. Choosing was
 * impossible without being able to tell one from the other.
 */
function membersOf(
  group: DuplicateGroup,
  incoming: ItemContent[],
  existing: ItemContent[],
): Member[] {
  const contents = [
    ...group.existing.map((index) => ({
      label: 'La que ya tienes',
      content: existing[index],
      where: { from: 'vault' as const, index },
    })),
    ...group.incoming.map((index) => ({
      label: 'La del fichero',
      content: incoming[index],
      where: { from: 'file' as const, index },
    })),
  ]

  const telling = TELLING_FIELDS.find(
    (field) =>
      new Set(contents.map((one) => String(one.content[field] ?? '').trim()).filter(Boolean))
        .size > 1,
  )

  return contents.map((one, index) => ({
    ...one,
    /*
     * The position is the fallback and not the first choice: «la 2.ª del fichero» is
     * something somebody has to go and count, while an address is recognised at a glance.
     * But it always tells them apart, which is what a label has to do.
     */
    detail: telling
      ? String(one.content[telling] ?? '').trim() || '(vacío)'
      : `la ${index + 1}.ª`,
  }))
}

/** What tells one entry of a group from the others, as a sentence. */
function differenceOf(members: Member[]): string {
  const differing = TELLING_FIELDS.filter(
    (field) =>
      new Set(members.map((one) => String(one.content[field] ?? '').trim()).filter(Boolean)).size >
      1,
  )

  if (differing.length === 0) return 'Solo cambia lo que una tiene y la otra no.'

  return `Difieren en ${differing.map((field) => FIELD_NAMES[field]).join(' y ')}.`
}

function GroupRow({
  group,
  incoming,
  existing,
  decision,
  survivor,
  onChange,
  onChooseSurvivor,
}: {
  group: DuplicateGroup
  incoming: ItemContent[]
  existing: ItemContent[]
  decision: GroupDecision
  survivor: DuplicateGroup['survivor']
  onChange: (decision: GroupDecision) => void
  onChooseSurvivor: (survivor: DuplicateGroup['survivor']) => void
}) {
  const [revealed, setRevealed] = useState(false)
  const members = membersOf(group, incoming, existing)
  const name = members[0].content.name
  const user = members[0].content.username
  const identity = identityOf(members[0].content) ?? name

  return (
    <li className="flex flex-col gap-2 rounded-md border p-3">
      <div>
        <p className="font-medium">{name}</p>
        {user && <p className="text-xs text-muted-foreground">{user}</p>}
      </div>

      <p className="text-muted-foreground">
        {members.length} entradas con contraseñas distintas. {differenceOf(members)}
      </p>

      <fieldset className="flex flex-col gap-1">
        <legend className="sr-only">Cuál se queda como contraseña actual</legend>
        {members.map((member) => (
          <label key={`${member.where.from}-${member.where.index}`} className="flex items-center gap-2">
            <input
              type="radio"
              name={`survivor-${identity}`}
              checked={
                survivor.from === member.where.from && survivor.index === member.where.index
              }
              disabled={decision === 'separate'}
              onChange={() => onChooseSurvivor(member.where)}
            />
            <span>
              {member.label}
              <span className="text-muted-foreground"> · {member.detail}</span>
            </span>
            <code className="rounded bg-muted px-1 text-xs">
              {revealed ? (member.content.password ?? '—') : '••••••••'}
            </code>
          </label>
        ))}
      </fieldset>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => setRevealed(!revealed)}
      >
        {revealed ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        {revealed ? 'Ocultar las contraseñas' : 'Ver las contraseñas'}
      </Button>

      <fieldset className="flex flex-col gap-1">
        <legend className="sr-only">Qué hacer con {name}</legend>
        {(
          [
            ['merge', 'Unir, y guardar la otra en el historial'],
            ['discard', 'Unir, y descartar la otra'],
            ['separate', 'No son la misma cuenta: entran las dos'],
          ] as const
        ).map(([value, text]) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              name={`decision-${identity}`}
              checked={decision === value}
              onChange={() => onChange(value)}
            />
            <span>{text}</span>
          </label>
        ))}
      </fieldset>
    </li>
  )
}

export function ReconcileStep({
  groups,
  incoming,
  existing,
  decisions,
  onChange,
  onChooseSurvivor,
  onApplyToAll,
}: ReconcileStepProps) {
  const conflicted = groups.filter((group) => hasConflict(group, incoming, existing))
  const agreedIdentities = groups
    .filter((group) => !hasConflict(group, incoming, existing))
    .map((group) => group.identity)
  const agreed = agreedIdentities.length

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="font-medium">
        {groups.length === 1
          ? 'Un grupo parece repetido'
          : `${groups.length} grupos parecen repetidos`}
        , en tu vault o dentro del propio fichero.
      </p>

      {agreed > 0 && (
        /*
         * The 236 of the measurement: their passwords agree, so merging only fills in
         * what one has and the other does not. It is one sentence because it is not a
         * decision — and it still says how many, because «importado» without a number is
         * what makes somebody delete the source without checking.
         */
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <p>
            {agreed === 1
              ? 'Una se une sin que haya nada que decidir'
              : `${agreed} se unen sin que haya nada que decidir`}
            : sus contraseñas coinciden, así que unirlas solo rellena lo que a una le
            falta y la otra tiene.
          </p>
          {/*
            * IT APPLIES TO THESE AND NOT TO ALL OF THEM, which is what it did until this
            * was looked at on screen: the button lives inside the block about the groups
            * whose passwords agree, and it was silently changing the ones that do not —
            * the only ones somebody had gone through deciding one by one.
            */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => onApplyToAll(agreedIdentities, 'separate')}
          >
            No unir estas
          </Button>
        </div>
      )}

      {conflicted.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-medium">
            {conflicted.length === 1
              ? 'Una tiene dos contraseñas distintas y hay que decidir'
              : `${conflicted.length} tienen contraseñas distintas y hay que decidir`}
          </p>
          <ul className="flex flex-col gap-2">
            {conflicted.map((group) => {
              const state = decisions.get(group.identity)

              return (
                <GroupRow
                  key={group.identity}
                  group={group}
                  incoming={incoming}
                  existing={existing}
                  decision={state?.decision ?? 'merge'}
                  survivor={state?.survivor ?? group.survivor}
                  onChange={(decision) => onChange(group.identity, decision)}
                  onChooseSurvivor={(survivor) => onChooseSurvivor(group.identity, survivor)}
                />
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
