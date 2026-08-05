import { toast } from 'sonner'
import { SECONDS_UNTIL_CLEAR, copyToClipboard } from '@/lib/clipboard'

/**
 * Copiar desde la vault, con el aviso que ve el usuario.
 *
 * Está aparte de lib/clipboard.ts porque aquel no debe saber nada de textos ni
 * de toasts: es mecánica de navegador y se prueba sin pintar nada.
 */

const FALLO = 'No hemos podido acceder al portapapeles. Cópialo a mano desde la entrada.'

/**
 * Copia un secreto y avisa.
 *
 * El aviso solo menciona la cuenta atrás **cuando el vaciado se ha programado de
 * verdad**. En contexto no seguro no puede programarse, y prometerlo igualmente
 * sería peor que no decir nada: el usuario creería que su portapapeles se limpia
 * solo cuando no es cierto.
 *
 * Si el usuario no supiera que hay cuenta atrás cuando sí la hay, descubrirla
 * sería encontrarse con que pegar no funciona y no entender por qué. De ahí que
 * se diga en un caso y se calle en el otro.
 */
export async function copySecret(text: string, what: string): Promise<void> {
  const result = await copyToClipboard(text)

  if (result === 'error') {
    toast.error(FALLO)

    return
  }

  toast.success(
    result === 'copied-with-clear'
      ? `${what} copiada. Se borrará del portapapeles en ${SECONDS_UNTIL_CLEAR} s.`
      : `${what} copiada.`,
  )
}

/**
 * Copia algo que no es secreto, como el nombre de usuario. Sin cuenta atrás:
 * vaciar el portapapeles por un nombre de usuario sería molestar sin ganar nada.
 */
export async function copyValue(text: string, what: string): Promise<void> {
  const result = await copyToClipboard(text, false)

  if (result === 'error') {
    toast.error(FALLO)

    return
  }

  toast.success(`${what} copiado.`)
}
