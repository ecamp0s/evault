import { CreditCard, KeyRound, StickyNote } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ITEM_TYPE_CHOICES,
  ITEM_TYPE_LABELS,
  type ItemTypeChoice,
} from '@/lib/vault/itemTypes'

const ICONS: Record<ItemTypeChoice, typeof KeyRound> = {
  login: KeyRound,
  tarjeta: CreditCard,
  nota: StickyNote,
}

interface TypeFieldProps {
  value: ItemTypeChoice
  onChange: (choice: ItemTypeChoice) => void
}

/**
 * Choosing what kind of entry is being created.
 *
 * IT IS ONLY SHOWN WHEN CREATING, and that is not a simplification: `ADR-020` §4 fixes
 * the type at creation and never lets it change, because `toContent` builds on top of
 * what was stored — turning a login into a card would leave its password inside the
 * card, invisible on every screen and still in the blob.
 *
 * WHICH IS ALSO WHY THERE IS NO WARNING TEXT SAYING SO. A notice enumerating a cost
 * leaves whoever reads it holding an alarm they cannot act on, which is the lesson of
 * #498. What makes the choice reviewable is that it stays on screen while the entry is
 * filled in, so getting it wrong is visible before saving rather than after.
 *
 * NATIVE RADIOS UNDER THE PAINT, and not buttons with `role="radio"`. Arrow-key
 * navigation, the grouping a screen reader announces and the label-click target all
 * come free and correct; rebuilding them over buttons is how they end up half done. It
 * is the pattern the character classes of the generator already use.
 *
 * The login goes first because it is what 370 of the 370 existing entries are: whoever
 * opens this dialog to create the ordinary thing finds it already selected and never
 * has to touch this.
 */
export function TypeField({ value, onChange }: TypeFieldProps) {
  return (
    <fieldset className="flex gap-2">
      <legend className="sr-only">Tipo de entrada</legend>
      {ITEM_TYPE_CHOICES.map((choice) => {
        const Icon = ICONS[choice]
        const selected = choice === value

        return (
          <label
            key={choice}
            className={cn(
              'flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm',
              'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
              selected
                ? 'border-primary bg-primary/10 font-medium text-foreground'
                : 'border-input text-muted-foreground hover:bg-accent',
            )}
          >
            <input
              type="radio"
              name="item-type"
              value={choice}
              checked={selected}
              onChange={() => onChange(choice)}
              className="sr-only"
            />
            <Icon className="size-4" aria-hidden="true" />
            {ITEM_TYPE_LABELS[choice]}
          </label>
        )
      })}
    </fieldset>
  )
}
