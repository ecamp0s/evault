import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
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
import { Notice } from '@/components/ui/notice'
import { useSession } from '@/lib/session'
import { OfflineWrite } from '@/lib/vault/api'
import { useCreateItem, useUpdateItem } from '@/lib/vault/hooks'
import {
  ImportError,
  groupDuplicates,
  parseImportFile,
  planImport,
  summarise,
  type DuplicateGroup,
  type GroupDecision,
  type ImportPreview,
  type ImportProblem,
  type ImportSummary,
} from '@/lib/vault/import'
import { ReconcileStep } from './ReconcileStep'
import { useUnsavedWorkWhile } from '@/lib/vault/unsavedWork'
import type { Item } from '@/lib/vault/types'

interface ImportDialogProps {
  vaultId: string
  items: Item[]
  onClose: () => void
}

/*
 * Typed by `ImportProblem` and not by `string`, so adding a problem without its sentence
 * fails to compile. The dialog's job when an import is refused is to say what to do
 * about it, and a missing key here would have shown «No hemos podido leer el fichero.»
 * — the fallback, which says nothing.
 */
const PROBLEM_MESSAGES: Record<ImportProblem, string> = {
  'formato-desconocido':
    'No reconocemos este fichero. Aceptamos copias de eVault y CSV de Chrome, Firefox, Bitwarden o NordPass.',
  /*
   * Not a variant of the one above, and the difference matters to whoever reads it: the
   * file was understood too well, by two formats at once. Saying «no lo reconocemos»
   * would send them to check the export they made, which is fine.
   */
  'formato-ambiguo':
    'Este fichero encaja con dos formatos a la vez y no vamos a adivinar cuál es: leer una columna por otra pondría contraseñas donde van los nombres. Expórtalo de nuevo desde tu gestor, sin mezclar formatos.',
  'passphrase-incorrecta': 'Esa no es la contraseña de este fichero, o el fichero está dañado.',
  'version-desconocida': 'Este fichero lo escribió una versión más nueva de eVault. Actualiza antes de importarlo.',
  'fichero-vacio': 'El fichero está vacío.',
}

/**
 * What each format is called in the notes when two of them are merged.
 *
 * It is the source's name and not the format's id because it gets read by a person, in
 * a sentence that says where a note came from.
 */
const SOURCE_LABEL: Record<ImportPreview['format'], string> = {
  evault: 'una copia de eVault',
  chrome: 'Chrome',
  firefox: 'Firefox',
  bitwarden: 'Bitwarden',
  nordpass: 'NordPass',
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
  const navigate = useNavigate()
  const create = useCreateItem(vaultId)
  const update = useUpdateItem(vaultId)
  const offline = useSession((state) => state.offline)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  /*
   * One decision per group, keyed by its identity and not by its position: the list is
   * rebuilt whenever a file is read, and a position would silently point at another
   * group.
   */
  const [decisions, setDecisions] = useState<
    Map<string, { decision: GroupDecision; survivor: DuplicateGroup['survivor'] }>
  >(new Map())
  const [fileText, setFileText] = useState<string | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [needsPassphrase, setNeedsPassphrase] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [written, setWritten] = useState<number | null>(null)
  /*
   * The three numbers of #620, kept from the plan that was executed and not recomputed
   * afterwards: what the summary says has to be what the import did.
   */
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [importing, setImporting] = useState(false)

  /*
   * How many are in so far. See #353.
   *
   * THE NUMBER THAT DECIDED ITS SHAPE: the import used to take 4 min 19 s and now takes
   * about 16 seconds for 370 entries (#352). That is still long enough to wonder whether
   * the thing has hung — it is well past the couple of seconds a person waits without
   * asking — but not long enough to deserve a whole progress screen. A count of how many
   * are in is the right size, and it was already being kept: `done` existed and was only
   * used if something failed.
   */
  const [progress, setProgress] = useState(0)

  /*
   * What locking would take away here is not the file — that gets picked again — but
   * **the exclusions ticked by hand**: whoever has just gone through forty entries
   * deciding which ones not to import, goes through them again. And the passphrase of
   * an encrypted file, which has to be typed again too. See #329.
   *
   * The condition is not an `isDirty` because this dialog has no form: it is having
   * read a file, which is the point from which there is a decision on screen worth
   * keeping.
   */
  useUnsavedWorkWhile(preview !== null && written === null)

  const read = async (content: string, providedPassphrase?: string) => {
    setError(null)

    try {
      const parsed = await parseImportFile(content, providedPassphrase)
      const detected = groupDuplicates(
        parsed.items,
        items.map((i) => i.content),
      )

      setPreview(parsed)
      setGroups(detected)
      /*
       * MERGE IS THE DEFAULT, and it is a change of stance from the tick box it replaces.
       * That one left duplicates OUT, because leaving them out was the only thing it
       * could do without losing something. Merging loses nothing now — what does not win
       * goes to the history — so the safe default is the one that removes the duplicate
       * instead of the one that drops an entry.
       */
      setDecisions(
        new Map(
          detected.map((group) => [
            group.identity,
            { decision: 'merge' as GroupDecision, survivor: group.survivor },
          ]),
        ),
      )
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

    setPreview(null)

    /*
     * READING THE FILE GOES INSIDE THE TRY, and it used to be outside. See #355.
     *
     * `read()` catches its own problems and turns each one into a sentence — including
     * «el fichero está vacío», which exists. But `file.text()` was one line above it,
     * so a failure there rejected a promise nobody caught: an `Uncaught (in promise)`
     * in the console and a dialog that said absolutely nothing, with «Importar 0»
     * greyed out and no hint as to why.
     *
     * It happens to real people: a USB pulled out, a network drive that drops, a file
     * moved or deleted between choosing it and reading it, a permission. All of them at
     * the moment somebody is bringing their passwords over from another manager.
     */
    let content: string

    try {
      content = await file.text()
    } catch {
      setError('No hemos podido leer el fichero. Comprueba que sigue donde estaba y vuelve a elegirlo.')

      return
    }

    setFileText(content)
    await read(content)
  }

  /*
   * ONE PLAN, AND THE SAME ONE THAT GETS WRITTEN. The button says how many entries the
   * vault will end up with and the import writes exactly that: computing the number one
   * way and the writes another is how a screen ends up telling the truth about something
   * it is not doing.
   */
  const resolved = useMemo(
    () =>
      groups.map((group) => ({
        group,
        decision: decisions.get(group.identity)?.decision ?? ('merge' as GroupDecision),
        survivor: decisions.get(group.identity)?.survivor,
      })),
    [groups, decisions],
  )

  const plan = useMemo(
    () =>
      preview
        ? planImport(
            preview.items,
            items.map((one) => one.content),
            resolved,
            SOURCE_LABEL[preview.format],
          )
        : null,
    [preview, items, resolved],
  )

  const runImport = async () => {
    if (!preview || !plan) return

    setImporting(true)
    setError(null)
    setProgress(0)

    const total = plan.create.length + plan.update.length
    let done = 0

    try {
      /*
       * One at a time and counting. If something fails halfway — the network, a 429 —
       * what was already written stays: importing adds, so nothing that came before has
       * been lost. What cannot be done is staying quiet about how many got in, because
       * then the user does not know whether to repeat the whole file or not.
       */
      for (const item of plan.create) {
        await create.mutateAsync(item)
        done += 1
        setProgress(done)
      }

      /*
       * The updates go after the creations, and the order is not arbitrary: an update
       * touches an entry that already exists, so a run cut short halfway leaves the vault
       * with everything new in it and some merges pending — which is a state somebody can
       * fix by importing the file again. The other order leaves entries merged and their
       * companions missing, which looks identical to a finished import.
       */
      for (const { index, content } of plan.update) {
        await update.mutateAsync({ itemId: items[index].id, content })
        done += 1
        setProgress(done)
      }

      setSummary(summarise(plan, resolved))
      setWritten(done)
    } catch (failure) {
      /*
       * `OfflineWrite` deserves its own sentence: the other message says «the connection
       * failed», which invites trying again — and here trying again cannot work until the
       * session reconnects. Sending somebody to retry a hundred entries against something
       * that will refuse every one of them is worse than telling them plainly.
       */
      setError(
        failure instanceof OfflineWrite
          ? 'No se puede importar mientras estás viendo la copia guardada en este dispositivo. No se ha guardado nada. Vuelve a conectar e inténtalo otra vez.'
          : `Se han importado ${done} de ${total} y ha fallado la conexión. Las que faltan siguen en tu fichero: puedes volver a importarlo y deseleccionar las que ya están.`,
      )
      setWritten(done)
    } finally {
      setImporting(false)
    }
  }

  /*
   * How many entries the vault ends up gaining or changing, which is NOT how many rows
   * the file has: merging turns two into one. The button has to say what will happen,
   * not what was read.
   */
  const selectedCount = plan ? plan.create.length + plan.update.length : 0

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>Importar entradas</DialogTitle>
        <DialogDescription>
          Se leen en este dispositivo y se cifran aquí antes de guardarse. El fichero no
          sale de tu navegador.
        </DialogDescription>

        {/*
          * Said on opening and not when the import fails, because by then a file has been
          * chosen, its entries reviewed and the duplicates ticked — and all of that would
          * have been for nothing. Importing writes, and writing needs the server.
          *
          * The refusal itself lives in `vault/api.ts`, which is what guarantees nothing
          * gets written. This only stops the effort being wasted. See #493.
          */}
        {offline && (
          <Notice>
            Estás viendo la copia guardada en este dispositivo, así que no se puede
            importar. Vuelve a conectar para añadir entradas.
          </Notice>
        )}

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
                Una copia de eVault, o un CSV exportado de Chrome, Firefox, Bitwarden o NordPass.
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

                {groups.length > 0 && (
                  <ReconcileStep
                    groups={groups}
                    incoming={preview.items}
                    existing={items.map((one) => one.content)}
                    decisions={decisions}
                    onChange={(identity, decision) =>
                      setDecisions((current) => {
                        const next = new Map(current)
                        const previous = next.get(identity)

                        if (previous) next.set(identity, { ...previous, decision })

                        return next
                      })
                    }
                    onChooseSurvivor={(identity, survivor) =>
                      setDecisions((current) => {
                        const next = new Map(current)
                        const previous = next.get(identity)

                        if (previous) next.set(identity, { ...previous, survivor })

                        return next
                      })
                    }
                    onApplyToAll={(identities, decision) =>
                      setDecisions((current) => {
                        const next = new Map(current)

                        for (const identity of identities) {
                          const state = next.get(identity)

                          if (state) next.set(identity, { ...state, decision })
                        }

                        return next
                      })
                    }
                  />
                )}

                {preview.movedFields.length > 0 && (
                  <p className="text-muted-foreground">
                    Estos campos no existen en eVault y se guardarán dentro de las notas:{' '}
                    {preview.movedFields.join(', ')}.
                  </p>
                )}

                {/*
                  * Said and not left out, which is the point of `droppedFields` (#381).
                  * These columns carry the exporting program's bookkeeping and nothing
                  * a person could use, so they do not travel — but the user finds that
                  * out here and not months later.
                  */}
                {preview.droppedFields.length > 0 && (
                  <p className="text-muted-foreground">
                    Estos campos son de uso interno del gestor de origen y no se
                    importan: {preview.droppedFields.join(', ')}.
                  </p>
                )}

                {/*
                  * Said and not dropped in silence, which is `ADR-011` §2.4 applied to
                  * something it did not foresee: a row that was never an entry. NordPass
                  * writes one per folder, carrying only its name.
                  */}
                {preview.notItems > 0 && (
                  <p className="text-muted-foreground">
                    {preview.notItems === 1
                      ? 'Una fila del fichero no es una entrada sino una carpeta, y no se importa'
                      : `${preview.notItems} filas del fichero no son entradas sino carpetas, y no se importan`}
                    .
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
                {importing ? `Importando ${progress} de ${selectedCount}…` : `Importar ${selectedCount}`}
              </Button>
              <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
            </div>

            {/*
              * A progressbar and NOT a live region, and the difference matters here.
              *
              * The result at the end is announced, and should be: it is one sentence,
              * once. This changes once per entry — 370 times on a real vault — and a
              * polite live region would have a screen reader read every one of them
              * aloud, which is not information but noise. `role="progressbar"` is
              * exactly the case: assistive technology exposes the value when asked
              * instead of interrupting with it.
              */}
            {importing && (
              <div
                role="progressbar"
                aria-label="Progreso de la importación"
                aria-valuemin={0}
                aria-valuemax={selectedCount}
                aria-valuenow={progress}
                className="h-1 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full bg-primary transition-[width] duration-150"
                  style={{ width: `${selectedCount === 0 ? 0 : (progress / selectedCount) * 100}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/*
              * THREE NUMBERS AND NOT ONE, which is #620: «importado» on its own is what
              * makes somebody delete the source without checking. How many entries the
              * vault gained, how many groups came in as one instead of several, and —the
              * one that matters— how many were left with two known passwords and nobody's
              * word on which is current.
              *
              * One `role="status"` around the three and not one per line: a screen reader
              * reads the result once, as a sentence, instead of three interruptions.
              */}
            <div role="status" className="flex flex-col gap-1 text-sm">
              <p>
                {written} {written === 1 ? 'entrada importada' : 'entradas importadas'}.
              </p>
              {summary && summary.merged > 0 && (
                <p className="text-muted-foreground">
                  {summary.merged === 1
                    ? 'Una se ha unido con otra que ya era la misma cuenta'
                    : `${summary.merged} se han unido con otras que ya eran la misma cuenta`}
                  .
                </p>
              )}
              {summary && summary.unresolved > 0 && (
                <p className="text-muted-foreground">
                  {summary.unresolved === 1
                    ? 'Una tiene dos contraseñas y nadie ha dicho cuál vale'
                    : `${summary.unresolved} tienen dos contraseñas y nadie ha dicho cuál vale`}
                  . Las tienes marcadas en la revisión de contraseñas.
                </p>
              )}
            </div>
            {/*
              * The number is only worth giving if there is somewhere to go with it, and
              * the audit is where «lo que hay que revisar» already lives. It gains the
              * fourth finding in #622; until then this leads to the screen that will list
              * them, which is better than a number that leads nowhere.
              */}
            {summary && summary.unresolved > 0 && (
              <Button
                type="button"
                variant="outline"
                className="self-start"
                onClick={() => {
                  onClose()
                  void navigate('/audit')
                }}
              >
                Ver las que hay que revisar
              </Button>
            )}
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
