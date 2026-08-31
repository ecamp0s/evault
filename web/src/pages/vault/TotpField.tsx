import { useEffect, useState } from 'react'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { parseTotp, totpCode } from '@/lib/vault/totp'

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
 * IT SHOWS THE CODE THE SEED PRODUCES RIGHT NOW, and that is not a decoration: it is the
 * mitigation for the worst thing this feature can do. A seed decoded wrong —an O typed
 * for a zero, a `digits=8` ignored— produces six plausible digits that no service
 * accepts, and by the time anybody finds out the QR code has been thrown away and the
 * previous app uninstalled. Comparing this number against the app that is still
 * installed, BEFORE retiring it, is what turns an irreversible mistake into a typo.
 *
 * THE CODE HERE DOES NOT TICK, and that is deliberate rather than unfinished. It is
 * recomputed when the seed changes and not on a timer, because a timer is exactly the
 * branch ADR-017 §2.4 warns about —a counter refreshing every second is not activity by
 * the user, and treating it as such would keep the vault unlocked forever— and shipping
 * it here would ship it without the test that guards it. The live countdown, and that
 * guarantee, are #417.
 *
 * The seed is hidden like a password because it IS one, and a longer-lived one: a
 * password is rotated in five minutes, a seed means reconfiguring the second factor with
 * its QR code and its backup codes.
 */
export function TotpField({ value, error, register }: TotpFieldProps) {
  const [visible, setVisible] = useState(false)
  const [preview, setPreview] = useState<{ seed: string; code: string } | null>(null)

  const seed = value.trim()

  /*
   * THE CODE IS KEPT NEXT TO THE SEED THAT PRODUCED IT, and shown only while the two
   * still match. Generating is asynchronous, so typing fast leaves codes in flight and
   * the older one can land last; without this pairing the field would show six digits
   * belonging to a seed it no longer holds, which is the one thing this preview exists
   * to rule out. It also means an unreadable seed shows nothing without having to store
   * that it is unreadable — the form's validation already says so, once.
   */
  const shown = preview?.seed === seed ? preview.code : null

  useEffect(() => {
    if (!seed) return

    let cancelled = false

    void (async () => {
      try {
        const code = await totpCode(parseTotp(seed), Date.now())

        if (!cancelled) setPreview({ seed, code })
      } catch {
        // Reported by the form's validation, and not a second time here.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [seed])

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor="totp">Segundo factor</FieldLabel>
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

      <p id="totp-ayuda" className="text-sm text-muted-foreground">
        Cuando un servicio te enseñe un código QR, busca la opción «no puedo escanearlo»:
        lo que da es la clave que va aquí.
      </p>

      {shown && !error && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
          <span>
            Ahora mismo saldría{' '}
            <strong className="font-mono tracking-widest text-foreground">{shown}</strong>.
            Compruébalo en tu aplicación actual antes de dejar de usarla.
          </span>
        </p>
      )}
    </Field>
  )
}
