import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { exportEncrypted, exportPlain } from '@/lib/vault/export'
import type { Item } from '@/lib/vault/types'

interface ExportDialogProps {
  items: Item[]
  onClose: () => void
}

/** Descarga un texto como fichero, sin pasar por ningún servidor. */
function downloadFile(contents: string, fileName: string, mimeType: string) {
  const blob = new Blob([contents], { type: mimeType })
  const link = document.createElement('a')

  link.href = URL.createObjectURL(blob)
  link.download = fileName
  link.click()
  URL.revokeObjectURL(link.href)
}

function datedName(extension: string): string {
  /*
   * La fecha va en el NOMBRE y no dentro del fichero, que es donde el usuario puede
   * quitarla si le estorba. Dentro sería un metadato que un fichero robado regalaría
   * gratis. Ver ADR-011.
   */
  return `evault-${new Date().toISOString().slice(0, 10)}.${extension}`
}

/**
 * Sacar la vault. Ver ADR-011.
 *
 * Dos formatos con propósitos que no se solapan, y la interfaz no los presenta como
 * dos sabores del mismo botón: el cifrado es la copia de seguridad, el CSV existe
 * para poder irse a otro gestor.
 */
export function ExportDialog({ items, onClose }: ExportDialogProps) {
  const [passphrase, setPassphrase] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [askingPlain, setAskingPlain] = useState(false)

  const runEncryptedExport = async () => {
    setError(null)

    if (passphrase.length < 8) {
      setError('Usa al menos 8 caracteres.')

      return
    }

    if (passphrase !== confirmation) {
      setError('Las dos no coinciden.')

      return
    }

    setExporting(true)

    try {
      const { contents, unreadable } = await exportEncrypted(items, passphrase)

      downloadFile(contents, datedName('evault'), 'application/json')

      /*
       * Si alguna entrada no se pudo leer se dice, y se dice DESPUÉS de descargar,
       * no en vez de descargar: quien tiene una entrada rota es justo quien más
       * necesita la copia de las demás.
       */
      setNotice(
        unreadable > 0
          ? `Copia descargada. ${unreadable} ${unreadable === 1 ? 'entrada no se pudo leer y no está' : 'entradas no se pudieron leer y no están'} en el fichero.`
          : 'Copia descargada.',
      )
    } finally {
      setExporting(false)
    }
  }

  const runPlainExport = () => {
    const { contents, unreadable } = exportPlain(items)

    downloadFile(contents, datedName('csv'), 'text/csv')

    setNotice(
      unreadable > 0
        ? `Fichero descargado. ${unreadable} no se pudieron leer y no están.`
        : 'Fichero descargado. Recuerda borrarlo cuando ya no lo necesites.',
    )
    setAskingPlain(false)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>Sacar una copia de la vault</DialogTitle>
        <DialogDescription>
          Se genera en este dispositivo. El servidor no participa: no puede leer tus
          entradas, así que tampoco puede construir esta copia.
        </DialogDescription>

        {notice && (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        )}

        {!askingPlain ? (
          <div className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="passphrase">Contraseña del fichero</FieldLabel>
              <Input
                id="passphrase"
                type="password"
                autoComplete="new-password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Distinta de tu contraseña maestra, a propósito: esta copia tiene que
                servirte el día que hayas perdido la otra.
              </p>
            </Field>

            <Field>
              <FieldLabel htmlFor="confirmacion">Repítela</FieldLabel>
              <Input
                id="confirmacion"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
              {error && <FieldError>{error}</FieldError>}
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={exporting} onClick={() => void runEncryptedExport()}>
                {exporting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="size-4" aria-hidden="true" />
                )}
                {exporting ? 'Cifrando…' : 'Descargar copia cifrada'}
              </Button>
              <DialogClose render={<Button type="button" variant="ghost" />}>Cerrar</DialogClose>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium">¿Te vas a otro gestor?</p>
              <p className="text-xs text-muted-foreground">
                Puedes sacar un CSV que entienden otros programas. No va cifrado.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setAskingPlain(true)}
              >
                Exportar sin cifrar
              </Button>
            </div>
          </div>
        ) : (
          /*
           * La confirmación del export en claro no es un «¿estás seguro?» que se
           * acepta sin leer: describe lo que se va a crear. Lo pide ADR-011, y el
           * motivo es que este fichero acaba en la carpeta de descargas y a menudo
           * sincronizado a alguna nube sin que nadie lo piense.
           */
          <div className="flex flex-col gap-4">
            <p className="text-sm font-medium">
              Vas a crear un fichero con todas tus contraseñas legibles.
            </p>
            <p className="text-sm text-muted-foreground">
              Cualquiera que lo abra las verá, sin contraseña ninguna. Bórralo en cuanto
              lo hayas importado en el otro gestor, y ten en cuenta que tu carpeta de
              descargas puede estar sincronizada con la nube.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="destructive" onClick={runPlainExport}>
                Lo entiendo, descargar sin cifrar
              </Button>
              <Button type="button" variant="ghost" onClick={() => setAskingPlain(false)}>
                Mejor no
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
