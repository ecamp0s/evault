import { useState } from 'react'
import type { UseFormRegister } from 'react-hook-form'
import type { FieldErrors } from 'react-hook-form'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { DatosItem } from '@/lib/vault/esquema'

interface CamposDeItemProps {
  register: UseFormRegister<DatosItem>
  errors: FieldErrors<DatosItem>
}

/**
 * Los cinco campos de una entrada.
 *
 * Separados del diálogo para que se vea de un vistazo qué se guarda, que es la
 * lista que hay que revisar cada vez que alguien proponga añadir un campo nuevo:
 * todos van dentro del blob y ninguno viaja suelto al servidor.
 */
export function CamposDeItem({ register, errors }: CamposDeItemProps) {
  const [contrasenaVisible, setContrasenaVisible] = useState(false)

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
        <Input id="usuario" autoComplete="off" {...register('usuario')} />
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
            type={contrasenaVisible ? 'text' : 'password'}
            autoComplete="new-password"
            className="flex-1"
            {...register('password')}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-pressed={contrasenaVisible}
            aria-label={contrasenaVisible ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
            onClick={() => setContrasenaVisible((visible) => !visible)}
          >
            {contrasenaVisible ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </Button>
        </div>
        {errors.password && <FieldError>{errors.password.message}</FieldError>}
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
