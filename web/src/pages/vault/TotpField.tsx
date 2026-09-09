import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { TotpCode } from './TotpCode'

interface TotpFieldProps {
  /** What is typed, watched from the form so the preview follows it. */
  value: string
  error?: string
  /** Registers the input with the form, so validation and dirtiness work as usual. */
  register: React.ComponentProps<'input'>
}

/**
 * The second factor's seed.
 *
 * IT SHOWS THE CODE THE SEED PRODUCES, and that is not a decoration: it is the
 * mitigation for the worst thing this feature can do. A seed decoded wrong —an O typed
 * for a zero, a `digits=8` ignored— produces six plausible digits that no service
 * accepts, and by the time anybody finds out the QR code has been thrown away and the
 * previous app uninstalled. Comparing this number against the app that is still
 * installed, BEFORE retiring it, is what turns an irreversible mistake into a typo.
 *
 * That is also why the code stays in the editor once the entry is saved: reading it is
 * the everyday gesture, and the entry is where somebody goes to do it. `TotpCode` holds
 * the counting and the guarantee that its counter is not activity for the lock.
 *
 * The seed is hidden like a password because it IS one, and a longer-lived one: a
 * password is rotated in five minutes, a seed means reconfiguring the second factor with
 * its QR code and its backup codes.
 */
export function TotpField({ value, error, register }: TotpFieldProps) {
  const [visible, setVisible] = useState(false)

  const seed = value.trim()

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor="totp">Verificación en dos pasos</FieldLabel>
      <div className="flex gap-2">
        <Input
          id="totp"
          type={visible ? 'text' : 'password'}
          autoComplete="off"
          className="flex-1"
          placeholder="Pega aquí la clave o la dirección otpauth://"
          aria-invalid={error ? true : undefined}
          aria-describedby="totp-ayuda"
          {...register}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-pressed={visible}
          aria-label={visible ? 'Ocultar la clave' : 'Mostrar la clave'}
          onClick={() => setVisible((shown) => !shown)}
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </Button>
      </div>

      {error && <FieldError>{error}</FieldError>}

      {/*
        * WHAT IT IS COMES BEFORE HOW TO FILL IT IN, and that order is the whole fix of
        * #545. This help used to open with the QR code, which is an instruction for
        * somebody who has already decided; the two people who own vaults on this
        * instance had not, and said so: «no entendemos para qué sirve». Nobody reads
        * past a sentence about scanning a code when they do not know what the field is.
        *
        * AND THE PRICE IS IN THE SAME PARAGRAPH AS THE BENEFIT, which is the lesson of
        * #498: a text that only sells is not an explanation. Keeping the seed here means
        * one unlocked vault yields both halves — `ADR-017` §5 accepted that consequence
        * knowingly, and whoever is deciding whether to use it deserves the same
        * information the ADR had.
        */}
      <p id="totp-ayuda" className="text-sm text-muted-foreground">
        Algunos servicios piden, además de la contraseña, un código de seis dígitos que
        cambia cada treinta segundos: así, quien te robe la contraseña tampoco entra. Si
        pegas aquí su clave, eVault genera ese código y no te hace falta otra aplicación.
        A cambio, la contraseña y el código quedan en el mismo sitio: quien abriera tu
        vault tendría los dos.
      </p>

      <p className="text-sm text-muted-foreground">
        Para conseguir esa clave, cuando el servicio te enseñe un código QR busca la
        opción «no puedo escanearlo».
      </p>

      {seed && !error && (
        <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/30 p-3">
          <TotpCode seed={seed} />
          <p className="text-sm text-muted-foreground">
            Compruébalo en tu aplicación actual antes de dejar de usarla.
          </p>
        </div>
      )}
    </Field>
  )
}
