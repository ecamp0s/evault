import { useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
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
import { useCreateItem } from '@/lib/vault/hooks'
import { ImportError, findDuplicates, parseImportFile, type ImportPreview } from '@/lib/vault/import'
import type { Item, ItemContent } from '@/lib/vault/types'

interface ImportDialogProps {
  vaultId: string
  items: Item[]
  onClose: () => void
}

const PROBLEM_MESSAGES: Record<string, string> = {
  'formato-desconocido': 'No reconocemos este fichero. Aceptamos copias de eVault y CSV de Chrome o Bitwarden.',
  'passphrase-incorrecta': 'Esa no es la contraseña de este fichero, o el fichero está dañado.',
  'version-desconocida': 'Este fichero lo escribió una versión más nueva de eVault. Actualiza antes de importarlo.',
  'fichero-vacio': 'El fichero está vacío.',
}

/**
 * Bringing entries in from a file. See ADR-011.
 *
 * Two steps and in this order: first what was understood is shown, and only then is
 * anything written. Nothing is stored before the user sees how many entries are coming,
 * which fields do not fit and which look like duplicates.
 *
 * Importing ADDS. It never replaces and never deletes, so a wrong file can never take
 * down what was already there.
 */
export function ImportDialog({ vaultId, items, onClose }: ImportDialogProps) {
  const create = useCreateItem(vaultId)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [duplicates, setDuplicates] = useState<Set<number>>(new Set())
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [fileText, setFileText] = useState<string | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [needsPassphrase, setNeedsPassphrase] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [written, setWritten] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)

  const read = async (content: string, providedPassphrase?: string) => {
    setError(null)

    try {
      const parsed = await parseImportFile(content, providedPassphrase)
      const detected = findDuplicates(
        parsed.items,
        items.map((i) => i.content),
      )

      setPreview(parsed)
      setDuplicates(detected)
      // Duplicates come unticked: the detection warns, and what to do with the warning
      // is decided by whoever imports.
      setExcluded(new Set(detected))
      setNeedsPassphrase(false)
    } catch (e) {
      if (e instanceof ImportError && e.problem === 'passphrase-incorrecta' && !providedPassphrase) {
        setNeedsPassphrase(true)

        return
      }

      setError(e instanceof ImportError ? PROBLEM_MESSAGES[e.problem] : 'No hemos podido leer el fichero.')
    }
  }

  const pickFile = async (file: File | undefined) => {
    if (!file) return

    const content = await file.text()

    setFileText(content)
    setPreview(null)
    await read(content)
  }

  const runImport = async () => {
    if (!preview) return

    setImporting(true)
    setError(null)

    const toWrite = preview.items.filter((_, index) => !excluded.has(index))
    let done = 0

    try {
      /*
       * One at a time and counting. If something fails halfway — the network, a 429 —
       * what was already written stays: importing adds, so nothing that came before has
       * been lost. What cannot be done is staying quiet about how many got in, because
       * then the user does not know whether to repeat the whole file or not.
       */
      for (const item of toWrite) {
        await create.mutateAsync(item as ItemContent)
        done += 1
      }

      setWritten(done)
    } catch {
      setError(
        `Se han importado ${done} de ${toWrite.length} y ha fallado la conexión. Las que faltan siguen en tu fichero: puedes volver a importarlo y deseleccionar las que ya están.`,
      )
      setWritten(done)
    } finally {
      setImporting(false)
    }
  }

  const selectedCount = preview ? preview.items.length - excluded.size : 0

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>Importar entradas</DialogTitle>
        <DialogDescription>
          Se leen en este dispositivo y se cifran aquí antes de guardarse. El fichero no
          sale de tu navegador.
        </DialogDescription>

        {written === null ? (
          <div className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="fichero">Fichero</FieldLabel>
              <Input
                id="fichero"
                type="file"
                accept=".evault,.csv,.json,text/csv,application/json"
                onChange={(event) => void pickFile(event.target.files?.[0])}
              />
              <p className="text-xs text-muted-foreground">
                Una copia de eVault, o un CSV exportado de Chrome o Bitwarden.
              </p>
            </Field>

            {needsPassphrase && (
              <Field>
                <FieldLabel htmlFor="passphrase">Contraseña del fichero</FieldLabel>
                <Input
                  id="passphrase"
                  type="password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 self-start"
                  onClick={() => void (fileText && read(fileText, passphrase))}
                >
                  Abrir el fichero
                </Button>
              </Field>
            )}

            {error && <FieldError>{error}</FieldError>}

            {preview && (
              /*
               * The preview is the whole point of this screen: nothing is written until
               * the user has seen what is going in and what has been moved.
               */
              <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
                <p className="font-medium">
                  {preview.items.length} {preview.items.length === 1 ? 'entrada' : 'entradas'} en el
                  fichero
                </p>

                {duplicates.size > 0 && (
                  <label className="flex items-start gap-2 text-muted-foreground">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={excluded.size === 0}
                      onChange={(event) =>
                        setExcluded(event.target.checked ? new Set() : new Set(duplicates))
                      }
                    />
                    <span>
                      {duplicates.size}{' '}
                      {duplicates.size === 1 ? 'parece que ya está' : 'parecen que ya están'} en tu
                      vault. Se quedan fuera salvo que marques esto.
                    </span>
                  </label>
                )}

                {preview.movedFields.length > 0 && (
                  <p className="text-muted-foreground">
                    Estos campos no existen en eVault y se guardarán dentro de las notas:{' '}
                    {preview.movedFields.join(', ')}.
                  </p>
                )}

                {preview.skipped > 0 && (
                  <p className="text-muted-foreground">
                    {preview.skipped} {preview.skipped === 1 ? 'fila no tiene' : 'filas no tienen'}{' '}
                    nombre y no se puede importar.
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={!preview || selectedCount === 0 || importing}
                onClick={() => void runImport()}
              >
                {importing ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="size-4" aria-hidden="true" />
                )}
                {importing ? 'Importando…' : `Importar ${selectedCount}`}
              </Button>
              <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p role="status" className="text-sm">
              {written} {written === 1 ? 'entrada importada' : 'entradas importadas'}.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="button" onClick={onClose}>
              Terminar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
