import { useState } from 'react'
import { RefreshCw, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGeneratorPreferences } from '@/lib/vault/generatorPreferences'
import {
  MAX_LENGTH,
  MIN_LENGTH,
  type CharacterClass,
  generatePassword,
} from '@/lib/vault/passwordGenerator'

/**
 * El generador, desplegable bajo el campo de contraseña.
 *
 * Panel inline y no un popover a propósito: esto vive dentro del diálogo de una
 * entrada, y una capa flotante dentro de otra complica el foco sin que el usuario
 * gane nada. Además evita añadir un componente más al sistema de diseño para un
 * único uso.
 *
 * Los controles son nativos —range y checkbox— estilados con Tailwind. Un slider
 * propio tendría que reimplementar el teclado, y el nativo ya lo trae.
 */

const CLASS_LABELS: Record<CharacterClass, string> = {
  lowercase: 'Minúsculas',
  uppercase: 'Mayúsculas',
  digits: 'Números',
  symbols: 'Símbolos',
}

interface PasswordGeneratorProps {
  /** Recibe la contraseña generada. Quien llama decide qué hacer con ella. */
  onGenerate: (password: string) => void
}

export function PasswordGenerator({ onGenerate }: PasswordGeneratorProps) {
  const [open, setOpen] = useState(false)
  const { length, classes, setLength, toggleClass } = useGeneratorPreferences()

  /*
   * Genera y entrega en el mismo gesto. Enseñar la contraseña dentro del panel y
   * pedir un segundo clic para usarla añadiría un paso y dejaría un secreto pintado
   * en un sitio más: el campo ya la muestra si el usuario quiere verla.
   */
  const generate = () => {
    onGenerate(generatePassword({ length, classes }))
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start text-muted-foreground"
        onClick={() => {
          setOpen(true)
          generate()
        }}
      >
        <Wand2 className="size-4" aria-hidden="true" />
        Generar una contraseña
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="generator-length" className="text-sm text-muted-foreground">
          Longitud
        </label>
        <div className="flex flex-1 items-center gap-3">
          <input
            id="generator-length"
            type="range"
            min={MIN_LENGTH}
            max={MAX_LENGTH}
            value={length}
            onChange={(event) => setLength(Number(event.target.value))}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
          />
          {/* tabular-nums para que el número no baile al cambiar de ancho. */}
          <span className="w-7 text-right text-sm tabular-nums">{length}</span>
        </div>
      </div>

      <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
        <legend className="sr-only">Tipos de carácter</legend>
        {(Object.keys(CLASS_LABELS) as CharacterClass[]).map((name) => (
          <label key={name} className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={classes[name]}
              onChange={() => toggleClass(name)}
              className="size-4 accent-primary"
            />
            {CLASS_LABELS[name]}
          </label>
        ))}
      </fieldset>

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={generate}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Generar otra
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cerrar
        </Button>
      </div>
    </div>
  )
}
