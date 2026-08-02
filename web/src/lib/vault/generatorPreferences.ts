import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_OPTIONS,
  type CharacterClass,
  type PasswordOptions,
} from '@/lib/vault/passwordGenerator'

/**
 * Las preferencias del generador, recordadas entre usos.
 *
 * Esto **sí** se persiste, al contrario que el token y que la clave de la vault, y
 * la diferencia no es de comodidad sino de qué es cada cosa: aquí no hay ningún
 * secreto, solo cuánto mide una contraseña y qué caracteres lleva. Nadie descifra
 * nada con eso.
 *
 * Se recuerda porque quien cambia la longitud a 32 lo hace por una razón, y volver
 * a ponerla en cada entrada nueva convierte una preferencia en una tarea.
 *
 * Store aparte y no dentro del componente: el diálogo se monta y se desmonta con
 * cada entrada —con key por item, ver ListaDeItems— así que su estado local moriría
 * entre una y otra.
 */

interface GeneratorPreferencesState extends PasswordOptions {
  setLength: (length: number) => void
  toggleClass: (name: CharacterClass) => void
}

export const useGeneratorPreferences = create<GeneratorPreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULT_OPTIONS,
      setLength: (length) => set({ length }),
      /*
       * Desmarcar la última clase activa dejaría unas opciones con las que no se
       * puede generar nada, así que la casilla no responde. La alternativa —dejar
       * desmarcarla y enseñar un error— sería castigar al usuario por un estado que
       * la interfaz no debería haberle dejado alcanzar.
       */
      toggleClass: (name) =>
        set((state) => {
          const classes = { ...state.classes, [name]: !state.classes[name] }

          return Object.values(classes).some(Boolean) ? { classes } : {}
        }),
    }),
    { name: 'evault.generador' },
  ),
)
