/**
 * Copiar al portapapeles, con vaciado automático.
 *
 * Copiar es la operación más frecuente de un gestor de contraseñas, muy por
 * encima de crear o editar, y es también la que más superficie de riesgo tiene:
 * lo copiado se queda ahí indefinidamente y cualquier aplicación del sistema
 * puede leerlo. Por eso se programa un vaciado.
 *
 * **Dos caminos, y el moderno no siempre está.** navigator.clipboard exige
 * contexto seguro, así que por http y sobre un dominio que no sea localhost ni
 * acabe en .localhost la API sencillamente no existe: isSecureContext es false y
 * navigator.clipboard es undefined. El plan B con execCommand no es un adorno
 * para navegadores viejos, es lo que se ejecuta en cualquier despliegue por http
 * sin certificado.
 *
 * Durante dos iteraciones ese fue el caso del entorno local de este proyecto y el
 * plan B se usaba a diario. Dejó de serlo en el issue #112, al mover el entorno a
 * .localhost, que sí da contexto seguro. La decisión se toma mirando
 * isSecureContext en tiempo de ejecución y NUNCA el entorno, y por eso el vaciado
 * volvió solo el día que hubo contexto seguro, sin tocar este fichero.
 *
 * **Y el plan B no puede vaciar.** execCommand solo funciona dentro de un gesto
 * del usuario: durante el clic sí, pero en el temporizador de treinta segundos
 * después ya no hay gesto y el navegador lo ignora. Comprobado en navegador, la
 * contraseña seguía en el portapapeles pasado el plazo. De ahí que el resultado
 * de copiar distinga si el vaciado se ha programado: quien avisa al usuario no
 * debe prometer una limpieza que no va a ocurrir.
 *
 * `copied-without-clear` sigue siendo un caso real aunque el entorno local ya no
 * lo produzca: le pasa a quien despliegue por http en su red sin certificado, y
 * también a quien deniegue el permiso del portapapeles teniendo contexto seguro.
 */

/**
 * Segundos antes de vaciar el portapapeles.
 *
 * Treinta es lo que tarda una persona en pegar la contraseña donde iba, con
 * margen para equivocarse de pestaña una vez. Bajarlo mucho convierte la medida
 * en una molestia, y subirlo la deja en decorativa.
 */
export const SECONDS_UNTIL_CLEAR = 30

/**
 * `copied-without-clear` no es un caso raro: es lo que ocurre en cualquier
 * despliegue sin contexto seguro, y también cuando el usuario deniega el permiso
 * y hay que recurrir al plan B.
 */
export type CopyResult = 'copied-with-clear' | 'copied-without-clear' | 'error'

/** Por qué vía se consiguió copiar, o null si no se consiguió. */
type Via = 'modern' | 'fallback' | null

let vaciadoPendiente: ReturnType<typeof setTimeout> | null = null

/**
 * Plan B para contextos no seguros.
 *
 * execCommand está marcado como obsoleto, pero es lo único que funciona sin
 * https. El textarea va fuera de la vista y se quita en cuanto termina; aun así,
 * durante ese instante la contraseña existe en el DOM, que es una diferencia
 * real respecto al camino moderno y conviene tenerla presente.
 */
function copyWithHiddenTextarea(text: string): boolean {
  const campo = document.createElement('textarea')

  campo.value = text
  campo.setAttribute('readonly', '')
  campo.setAttribute('aria-hidden', 'true')
  campo.style.position = 'fixed'
  campo.style.top = '-9999px'
  campo.style.opacity = '0'

  document.body.appendChild(campo)

  try {
    campo.select()

    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    campo.remove()
  }
}

async function escribir(text: string): Promise<Via> {
  if (window.isSecureContext && typeof navigator.clipboard?.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text)

      return 'modern'
    } catch {
      // El usuario pudo denegar el permiso. Se intenta el plan B antes de rendirse.
    }
  }

  return copyWithHiddenTextarea(text) ? 'fallback' : null
}

/**
 * Copia un texto y, si puede, programa el vaciado del portapapeles.
 *
 * El vaciado solo se programa cuando la copia ha ido por la vía moderna, porque
 * es la única que seguirá disponible treinta segundos más tarde. Si se ha
 * necesitado el plan B, programarlo sería dejar un temporizador que no hace nada
 * y dar la falsa impresión de que la medida está activa.
 *
 * Limitación asumida de la vía que sí funciona, y que conviene no vender como más
 * de lo que es: el vaciado escribe encima sin comprobar antes qué hay.
 * Comprobarlo exigiría leer el portapapeles, que pide permiso explícito al
 * usuario y sería peor remedio que enfermedad. En la práctica significa que, si
 * el usuario copia otra cosa por su cuenta dentro de la ventana de tiempo, el
 * vaciado se la lleva por delante.
 *
 * @param vaciarDespues falso para lo que no es secreto, como el nombre de usuario
 */
export async function copyToClipboard(text: string, clearAfterwards = true): Promise<CopyResult> {
  const via = await escribir(text)

  if (via === null) {
    return 'error'
  }

  // Solo hay un vaciado en vuelo: copiar otra cosa reinicia la cuenta en vez de
  // acumular temporizadores que se dispararían a destiempo.
  cancelClear()

  if (!clearAfterwards || via !== 'modern') {
    return 'copied-without-clear'
  }

  vaciadoPendiente = setTimeout(() => {
    vaciadoPendiente = null
    void escribir('')
  }, SECONDS_UNTIL_CLEAR * 1000)

  return 'copied-with-clear'
}

export function cancelClear(): void {
  if (vaciadoPendiente !== null) {
    clearTimeout(vaciadoPendiente)
    vaciadoPendiente = null
  }
}
