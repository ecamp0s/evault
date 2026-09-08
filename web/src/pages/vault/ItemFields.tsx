import { useState } from 'react'
import type { UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form'
import type { FieldErrors } from 'react-hook-form'
import { Copy, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { copyValue, copySecret } from '@/lib/vault/copy'
import type { ItemFormData } from '@/lib/vault/schema'
import type { ItemTypeChoice } from '@/lib/vault/itemTypes'
import { CardFields } from './CardFields'
import { PasswordGenerator } from './PasswordGenerator'
import { TagField } from './TagField'
import { TotpField } from './TotpField'

interface ItemFieldsProps {
  register: UseFormRegister<ItemFormData>
  errors: FieldErrors<ItemFormData>
  watch: UseFormWatch<ItemFormData>
  setValue: UseFormSetValue<ItemFormData>
  /** Every tag already in the vault, for the editor to suggest from. */
  tagsInUse: string[]
  /** Which fields to show. Fixed at creation and never changed — see ADR-020 §4. */
  type: ItemTypeChoice
}

/**
 * An entry's fields.
 *
 * Kept apart from the dialog so that what is stored can be seen at a glance, which is
 * the list to review every time somebody proposes adding a new field: they all travel
 * inside the blob and none goes loose to the server.
 *
 * It said «five fields» until #378 added the tags, and the count is not put back: it
 * would be wrong again with the next one, and what matters is the property underneath
 * — everything here is inside the blob — and not how many there are.
 */
export function ItemFields({ register, errors, watch, setValue, tagsInUse, type }: ItemFieldsProps) {
  const [passwordVisible, setPasswordVisible] = useState(false)

  // They are read from the form and not from the item so as to copy what is written
  // now, including what the user has just typed and not yet saved.
  const currentUser = watch('usuario')
  const currentPassword = watch('password')

  return (
    <div className="flex flex-col gap-4">
      <Field data-invalid={errors.nombre ? true : undefined}>
        <FieldLabel htmlFor="nombre">Nombre</FieldLabel>
        <Input
          id="nombre"
          autoFocus
          autoComplete="off"
          aria-invalid={errors.nombre ? true : undefined}
          {...register('nombre')}
        />
        {errors.nombre && <FieldError>{errors.nombre.message}</FieldError>}
      </Field>

      {/*
        * The fields only a login has. A card has no username, no password and no
        * URL, and showing them empty would invite filling them in.
        */}
      {type === 'login' && (
        <>
        <Field data-invalid={errors.usuario ? true : undefined}>
          <FieldLabel htmlFor="usuario">Usuario</FieldLabel>
          <div className="flex gap-2">
            <Input id="usuario" autoComplete="off" className="flex-1" {...register('usuario')} />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Copiar el usuario"
              disabled={!currentUser}
              onClick={() => void copyValue('Usuario copiado', currentUser)}
            >
              <Copy className="size-4" aria-hidden="true" />
            </Button>
          </div>
          {errors.usuario && <FieldError>{errors.usuario.message}</FieldError>}
        </Field>

        <Field data-invalid={errors.password ? true : undefined}>
          <FieldLabel htmlFor="password">Contraseña</FieldLabel>
          <div className="flex gap-2">
            {/*
              * Hidden by default. autoComplete="new-password" keeps the browser's own
              * manager from offering to fill in here: it would be absurd for another
              * password manager to interfere in precisely this field.
              */}
            <Input
              id="password"
              type={passwordVisible ? 'text' : 'password'}
              autoComplete="new-password"
              className="flex-1"
              {...register('password')}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-pressed={passwordVisible}
              aria-label={passwordVisible ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
              onClick={() => setPasswordVisible((visible) => !visible)}
            >
              {passwordVisible ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Copiar la contraseña"
              disabled={!currentPassword}
              onClick={() => void copySecret('Contraseña copiada', currentPassword)}
            >
              <Copy className="size-4" aria-hidden="true" />
            </Button>
          </div>
          {errors.password && <FieldError>{errors.password.message}</FieldError>}

          {/*
            * shouldDirty marks the form as modified, which is what makes the
            * unsaved-changes warning appear if the dialog is closed after generating.
            * Without it, a generated and unsaved password would be lost in silence.
            */}
          <PasswordGenerator
            onGenerate={(generated) => setValue('password', generated, { shouldDirty: true })}
          />
        </Field>

        <Field data-invalid={errors.url ? true : undefined}>
          <FieldLabel htmlFor="url">URL</FieldLabel>
          <Input id="url" autoComplete="off" placeholder="github.com" {...register('url')} />
          {errors.url && <FieldError>{errors.url.message}</FieldError>}
        </Field>
        </>
      )}

      {type === 'tarjeta' && <CardFields register={register} errors={errors} watch={watch} />}

      {/*
        * IT IS STILL CALLED «Notas» ON A NOTE, where it is not a footnote but the whole
        * content. Renaming it per type was the obvious idea and is rejected on
        * precedent: this is what a secure note's body is called in the managers people
        * arrive from, and one field that means the same thing everywhere is worth more
        * than a word that reads slightly better on one screen.
        *
        * WHAT DOES CHANGE IS ITS SIZE, because that is not decoration. A two-line box
        * says «write a remark»; on a note the field IS the entry, and asking somebody to
        * type a document through a slit is the kind of thing that never gets reported
        * and quietly stops the feature being used.
        *
        * IT IS A MINIMUM HEIGHT AND NOT `rows`, AND THAT WAS MEASURED RATHER THAN
        * ASSUMED. `Textarea` carries `field-sizing-content`, so the browser sizes the box
        * to what is written in it and IGNORES `rows` entirely: setting `rows={12}` left
        * the field 90 px tall and changed nothing on screen. What the attribute would
        * have bought is a test that passes over a change that does nothing.
        *
        * The minimum is what an empty field opens at; the content sizing then grows it
        * from there, which is the behaviour a note wants anyway.
        */}
      <Field data-invalid={errors.notas ? true : undefined}>
        <FieldLabel htmlFor="notas">Notas</FieldLabel>
        <Textarea
          id="notas"
          className={type === 'nota' ? 'min-h-48' : undefined}
          {...register('notas')}
        />
        {errors.notas && <FieldError>{errors.notas.message}</FieldError>}
      </Field>

      {/*
        * The seed goes through `register` like any other text field —what is edited is
        * text— and the component only adds what a seed needs and a password does not:
        * the code it produces right now, to be compared against the app still installed.
        *
        * Only on a login: a card has no second factor, and neither does a note.
        */}
      {type === 'login' && (
        <TotpField value={watch('totp')} error={errors.totp?.message} register={register('totp')} />
      )}

      {/*
        * The tags are not registered with `register` because what is edited is an array
        * and not the text of an input. They are watched and written with `setValue`,
        * with `shouldDirty` so that the unsaved-changes warning of #303 also covers
        * adding a tag and leaving without saving.
        */}
      <TagField
        value={watch('etiquetas')}
        suggestions={tagsInUse}
        error={errors.etiquetas?.message ?? errors.etiquetas?.root?.message}
        onChange={(tags) => setValue('etiquetas', tags, { shouldDirty: true })}
      />
    </div>
  )
}
