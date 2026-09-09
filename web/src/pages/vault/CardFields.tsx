import { useState } from 'react'
import type { FieldErrors, UseFormRegister, UseFormWatch } from 'react-hook-form'
import { Copy, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { copySecret } from '@/lib/vault/copy'
import type { ItemFormData } from '@/lib/vault/schema'

/** The three fields of a card that are treated exactly like a password. */
type SecretName = 'numero' | 'csc' | 'pin'

interface CardFieldsProps {
  register: UseFormRegister<ItemFormData>
  errors: FieldErrors<ItemFormData>
  watch: UseFormWatch<ItemFormData>
}

/**
 * What a card holds.
 *
 * THE ORDER IS THE ONE ON THE PLASTIC, so that filling it in is copying from left to
 * right and top to bottom instead of hunting: the number across the middle, the holder's
 * name below it, the expiry next to that. The security code comes after because it is
 * the last thing you look for — on the back on most cards and on the front of an
 * American Express — and the PIN goes last because it is the one thing that is not
 * printed anywhere and comes out of somebody's memory.
 *
 * THREE OF THEM ARE SECRETS: the number, the security code and the PIN. `ADR-020` §4
 * says so and it is worth writing down because it is not obvious — the number is the
 * field you pay with. All three are copied with the helper that clears the clipboard,
 * none of them is painted in the list, and none of them is searched.
 *
 * BUT ONLY TWO OF THEM OPEN HIDDEN, and the number is the exception (#534). Hiding a
 * value in this editor buys ONE thing — that somebody looking over your shoulder cannot
 * read it — because the value sits in the DOM either way; the rule about not being in
 * the DOM at all belongs to the list, and there the number still is not painted.
 *
 * What that one thing costs is the field's actual use. THE NUMBER IS THE ONE YOU NEED TO
 * READ RATHER THAN COPY: fifteen or sixteen digits to type into a form that refuses a
 * paste, to read out to a bank, or simply to check against the plastic in your hand —
 * and none of that can be done through dots. With a password the trade runs the other
 * way round, which is why hiding that one costs nothing.
 *
 * So the line is drawn at what ALONE COMPLETES A PAYMENT OR OPENS A CASH MACHINE: the
 * security code and the PIN stay hidden, and the field that merely identifies the card
 * does not. Hiding only the number while the holder and the expiry sit in the clear
 * next to it was half a curtain anyway.
 *
 * THERE IS NO GENERATOR HERE, and no second factor either. Nothing about a card is
 * chosen by whoever types it in: it is read off a piece of plastic somebody else issued.
 */
export function CardFields({ register, errors, watch }: CardFieldsProps) {
  return (
    <>
      <SecretField
        name="numero"
        label="Número"
        subject="el número"
        copied="Número copiado"
        visibleByDefault
        register={register}
        errors={errors}
        watch={watch}
      />

      <Field data-invalid={errors.titular ? true : undefined}>
        <FieldLabel htmlFor="titular">Titular</FieldLabel>
        <Input id="titular" autoComplete="off" {...register('titular')} />
        {errors.titular && <FieldError>{errors.titular.message}</FieldError>}
      </Field>

      <Field data-invalid={errors.caducidad ? true : undefined}>
        <FieldLabel htmlFor="caducidad">Caducidad</FieldLabel>
        {/*
          * A free text field and not a date picker, which is `ADR-020` §6 applied where
          * it is least expected: what is printed on a card is a month and a year, and
          * every widget that asks for a date asks for a day as well.
          */}
        <Input id="caducidad" autoComplete="off" placeholder="05/29" {...register('caducidad')} />
        {errors.caducidad && <FieldError>{errors.caducidad.message}</FieldError>}
      </Field>

      {/*
        * «Código de seguridad» AND NOT «CVV», which is the label doing the work of a
        * decision. CVV2 is Visa's name for it, CVC2 Mastercard's and CID American
        * Express's and Discover's; this one is right for all four.
        *
        * AND IT SAYS NOTHING ABOUT HOW MANY DIGITS OR WHERE THEY ARE PRINTED, which
        * would be the obvious help to add and would be wrong for one brand either way:
        * an American Express code is FOUR digits and sits on the front, everybody else's
        * is three and sits on the back.
        */}
      <SecretField
        name="csc"
        label="Código de seguridad"
        subject="el código de seguridad"
        copied="Código de seguridad copiado"
        register={register}
        errors={errors}
        watch={watch}
      />

      <SecretField
        name="pin"
        label="PIN"
        subject="el PIN"
        copied="PIN copiado"
        register={register}
        errors={errors}
        watch={watch}
      />
    </>
  )
}

interface SecretFieldProps extends CardFieldsProps {
  name: SecretName
  label: string
  /** Whether it opens readable. Only the number does — see the note at the top. */
  visibleByDefault?: boolean
  /**
   * How the field is named INSIDE a sentence, article and all: «el número».
   *
   * It is given rather than derived from `label` for the same reason the notice's
   * sentence is — the caller is the only place that knows the gender of the word it
   * chose. «Mostrar Número» would also read like a heading instead of an instruction,
   * next to the «Mostrar la contraseña» that is already there.
   */
  subject: string
  /** The whole sentence the notice shows, already agreed. See lib/vault/copy.ts. */
  copied: string
}

/**
 * One of the card's secrets: hidden, with a button to show it and one to copy it.
 *
 * It exists because the three of them are the same field three times over, and the
 * password's version of this — right next door in ItemFields — carries a generator and
 * its own autoComplete that none of these want. Folding all four into one component
 * would mean a component with two halves that are never both used.
 */
function SecretField({
  name,
  label,
  subject,
  copied,
  visibleByDefault = false,
  register,
  errors,
  watch,
}: SecretFieldProps) {
  const [visible, setVisible] = useState(visibleByDefault)
  const current = watch(name)
  const error = errors[name]

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <div className="flex gap-2">
        {/*
          * autoComplete="off" and type=password when hidden, so that the browser's own
          * manager does not offer to fill in or remember a card here: the whole point of
          * this screen is that the card lives in the blob and nowhere else.
          */}
        <Input
          id={name}
          type={visible ? 'text' : 'password'}
          autoComplete="off"
          className="flex-1"
          {...register(name)}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-pressed={visible}
          aria-label={visible ? `Ocultar ${subject}` : `Mostrar ${subject}`}
          onClick={() => setVisible((shown) => !shown)}
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Copiar ${subject}`}
          disabled={!current}
          onClick={() => void copySecret(copied, current)}
        >
          <Copy className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {error && <FieldError>{error.message}</FieldError>}
    </Field>
  )
}
