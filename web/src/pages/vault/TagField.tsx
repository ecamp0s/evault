import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { MAX_TAG, MAX_TAGS } from '@/lib/vault/schema'
import { addTag, removeTag, tagKey } from '@/lib/vault/tags'

interface TagFieldProps {
  value: string[]
  onChange: (tags: string[]) => void
  /** Every tag already used in the vault, for suggesting rather than inventing. */
  suggestions: string[]
  error?: string
}

/**
 * The tag editor.
 *
 * IT SUGGESTS INSTEAD OF LETTING PEOPLE INVENT, and that is the whole point of the
 * autocompletion: tags are only worth anything if the same idea is spelled the same way
 * twice. Somebody who typed «trabajo» in March and «Trabajo» in August has two groups
 * of one entry each, and nothing in the interface would tell them.
 *
 * The comparison is by key —lowercased and without marks— but WHAT GETS STORED IS WHAT
 * WAS TYPED. See `tags.ts`: correcting the user's writing to tidy up our bookkeeping
 * would be the wrong trade.
 *
 * Enter adds, and so does picking a suggestion. There is no «add» button: a field where
 * Enter does nothing is a field people abandon halfway.
 */
export function TagField({ value, onChange, suggestions, error }: TagFieldProps) {
  const [draft, setDraft] = useState('')

  const used = new Set(value.map(tagKey))
  const offered = suggestions
    .filter((tag) => !used.has(tagKey(tag)))
    .filter((tag) => !draft.trim() || tagKey(tag).includes(tagKey(draft)))
    .slice(0, 6)

  const full = value.length >= MAX_TAGS

  function add(tag: string) {
    const next = addTag(value, tag)

    if (next !== value && next.length <= MAX_TAGS) onChange(next)
    setDraft('')
  }

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor="etiquetas">Etiquetas</FieldLabel>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Etiquetas de la entrada">
          {value.map((tag) => (
            <li key={tagKey(tag)}>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pr-0.5 pl-2.5 text-sm">
                {tag}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar la etiqueta ${tag}`}
                  onClick={() => onChange(removeTag(value, tag))}
                  className="size-5 rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" aria-hidden="true" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Input
        id="etiquetas"
        value={draft}
        disabled={full}
        maxLength={MAX_TAG}
        placeholder={full ? `Ya has puesto ${MAX_TAGS}` : 'Escribe y pulsa Intro'}
        onChange={(event) => setDraft(event.target.value)}
        /*
         * The key is caught here and not in a form submit: Enter inside a form submits
         * it, so without this, adding a tag would save the entry and close the dialog.
         */
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            add(draft)
          }
        }}
      />

      {offered.length > 0 && !full && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Etiquetas que ya usas">
          {offered.map((tag) => (
            <li key={tagKey(tag)}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 rounded-full px-2.5 text-xs font-normal"
                onClick={() => add(tag)}
              >
                {tag}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  )
}
