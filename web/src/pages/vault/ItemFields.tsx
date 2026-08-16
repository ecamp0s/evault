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
 * Los cinco campos de una entrada.
 *
 * Separados del diálogo para que se vea de un vistazo qué se guarda, que es la
 * lista que hay que revisar cada vez que alguien proponga añadir un campo nuevo:
 * todos van dentro del blob y ninguno viaja suelto al servidor.
 */
export function ItemFields({ register, errors, watch, setValue }: ItemFieldsProps) {
  const [passwordVisible, setPasswordVisible] = useState(false)

  // Se leen del formulario y no del item para copiar lo que hay escrito ahora,
  // incluido lo que el usuario acaba de teclear y todavía no ha guardado.
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
            * Oculta por defecto. autoComplete="new-password" evita que el gestor
            * del navegador se ofrezca a rellenar aquí: sería absurdo que otro
            * gestor de contraseñas interfiriese justo en este campo.
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
          * shouldDirty marca el formulario como modificado, que es lo que hace que
          * el aviso de cambios sin guardar aparezca si se cierra el diálogo después
          * de generar. Sin él, una contraseña generada y no guardada se perdería en
          * silencio.
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
