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

const PROBLEMAS: Record<string, string> = {
  'formato-desconocido': 'No reconocemos este fichero. Aceptamos copias de eVault y CSV de Chrome o Bitwarden.',
  'passphrase-incorrecta': 'Esa no es la contraseña de este fichero, o el fichero está dañado.',
  'version-desconocida': 'Este fichero lo escribió una versión más nueva de eVault. Actualiza antes de importarlo.',
  'fichero-vacio': 'El fichero está vacío.',
}

/**
 * Meter entradas desde un fichero. Ver ADR-011.
 *
 * Dos pasos y en este orden: primero se enseña qué se ha entendido, y solo después
 * se escribe. Nada se guarda antes de que el usuario vea cuántas entradas van, qué
 * campos no caben y cuáles parecen repetidas.
 *
 * El import AÑADE. Nunca sustituye ni borra, así que un fichero equivocado nunca
 * puede llevarse por delante lo que ya había.
 */
export function ImportDialog({ vaultId, items, onClose }: ImportDialogProps) {
  const crear = useCreateItem(vaultId)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [repetidos, setRepetidos] = useState<Set<number>>(new Set())
  const [excluidos, setExcluidos] = useState<Set<number>>(new Set())
  const [texto, setTexto] = useState<string | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [necesitaPassphrase, setNecesitaPassphrase] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [escritos, setEscritos] = useState<number | null>(null)
  const [importando, setImportando] = useState(false)

  const leer = async (contenido: string, clave?: string) => {
    setError(null)

    try {
      const leido = await parseImportFile(contenido, clave)
      const duplicados = findDuplicates(
        leido.items,
        items.map((i) => i.content),
      )

      setPreview(leido)
      setRepetidos(duplicados)
      // Los repetidos vienen deseleccionados: la detección avisa, y lo que hace con
      // el aviso lo decide quien importa.
      setExcluidos(new Set(duplicados))
      setNecesitaPassphrase(false)
    } catch (e) {
      if (e instanceof ImportError && e.problem === 'passphrase-incorrecta' && !clave) {
        setNecesitaPassphrase(true)

        return
      }

      setError(e instanceof ImportError ? PROBLEMAS[e.problem] : 'No hemos podido leer el fichero.')
    }
  }

  const elegir = async (fichero: File | undefined) => {
    if (!fichero) return

    const contenido = await fichero.text()

    setTexto(contenido)
    setPreview(null)
    await leer(contenido)
  }

  const importar = async () => {
    if (!preview) return

    setImportando(true)
    setError(null)

    const aEscribir = preview.items.filter((_, indice) => !excluidos.has(indice))
    let hechos = 0

    try {
      /*
       * De uno en uno y contando. Si algo falla a mitad —la red, un 429— lo que ya
       * se escribió se queda: el import añade, así que nada de lo anterior se ha
       * perdido. Lo que no se puede hacer es callarse cuántas entraron, porque
       * entonces el usuario no sabe si repetir el fichero entero o no.
       */
      for (const item of aEscribir) {
        await crear.mutateAsync(item as ItemContent)
        hechos += 1
      }

      setEscritos(hechos)
    } catch {
      setError(
        `Se han importado ${hechos} de ${aEscribir.length} y ha fallado la conexión. Las que faltan siguen en tu fichero: puedes volver a importarlo y deseleccionar las que ya están.`,
      )
      setEscritos(hechos)
    } finally {
      setImportando(false)
    }
  }

  const aImportar = preview ? preview.items.length - excluidos.size : 0

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>Importar entradas</DialogTitle>
        <DialogDescription>
          Se leen en este dispositivo y se cifran aquí antes de guardarse. El fichero no
          sale de tu navegador.
        </DialogDescription>

        {escritos === null ? (
          <div className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="fichero">Fichero</FieldLabel>
              <Input
                id="fichero"
                type="file"
                accept=".evault,.csv,.json,text/csv,application/json"
                onChange={(evento) => void elegir(evento.target.files?.[0])}
              />
              <p className="text-xs text-muted-foreground">
                Una copia de eVault, o un CSV exportado de Chrome o Bitwarden.
              </p>
            </Field>

            {necesitaPassphrase && (
              <Field>
                <FieldLabel htmlFor="passphrase">Contraseña del fichero</FieldLabel>
                <Input
                  id="passphrase"
                  type="password"
                  value={passphrase}
                  onChange={(evento) => setPassphrase(evento.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 self-start"
                  onClick={() => void (texto && leer(texto, passphrase))}
                >
                  Abrir el fichero
                </Button>
              </Field>
            )}

            {error && <FieldError>{error}</FieldError>}

            {preview && (
              /*
               * La previsualización es el punto entero de esta pantalla: nada se
               * escribe hasta que el usuario ha visto qué va a entrar y qué se ha
               * movido de sitio.
               */
              <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
                <p className="font-medium">
                  {preview.items.length} {preview.items.length === 1 ? 'entrada' : 'entradas'} en el
                  fichero
                </p>

                {repetidos.size > 0 && (
                  <label className="flex items-start gap-2 text-muted-foreground">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={excluidos.size === 0}
                      onChange={(evento) =>
                        setExcluidos(evento.target.checked ? new Set() : new Set(repetidos))
                      }
                    />
                    <span>
                      {repetidos.size}{' '}
                      {repetidos.size === 1 ? 'parece que ya está' : 'parecen que ya están'} en tu
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
                disabled={!preview || aImportar === 0 || importando}
                onClick={() => void importar()}
              >
                {importando ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="size-4" aria-hidden="true" />
                )}
                {importando ? 'Importando…' : `Importar ${aImportar}`}
              </Button>
              <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p role="status" className="text-sm">
              {escritos} {escritos === 1 ? 'entrada importada' : 'entradas importadas'}.
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
