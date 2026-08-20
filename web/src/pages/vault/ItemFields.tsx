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
import { PasswordGenerator } from './PasswordGenerator'

interface ItemFieldsProps {
  register: UseFormRegister<ItemFormData>
  errors: FieldErrors<ItemFormData>
  watch: UseFormWatch<ItemFormData>
  setValue: UseFormSetValue<ItemFormData>
}

/**
 * An entry's five fields.
 *
 * Kept apart from the dialog so that what is stored can be seen at a glance, which is
 * the list to review every time somebody proposes adding a new field: they all travel
 * inside the blob and none goes loose to the server.
 */
export function ItemFields({ register, errors, watch, setValue }: ItemFieldsProps) {
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
            onClick={() => void copyValue(currentUser, 'Usuario')}
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
            onClick={() => void copySecret(currentPassword, 'Contraseña')}
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

      <Field data-invalid={errors.notas ? true : undefined}>
        <FieldLabel htmlFor="notas">Notas</FieldLabel>
        <Textarea id="notas" rows={3} {...register('notas')} />
        {errors.notas && <FieldError>{errors.notas.message}</FieldError>}
      </Field>
    </div>
  )
}
