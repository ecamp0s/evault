/**
 * Copiar al portapapeles, con vaciado automático.
 *
 * Copiar es la operación más frecuente de un gestor de contraseñas, muy por
 * encima de crear o editar, y es también la que más superficie de riesgo tiene:
 * lo copiado se queda ahí indefinidamente y cualquier aplicación del sistema
 * puede leerlo. Por eso se programa un vaciado.
 *
 * **Dos caminos, y el moderno no siempre está.** navigator.clipboard exige
 * contexto seguro, y el entorno local de este proyecto sirve la web por http
 * sobre un dominio que no es localhost, así que allí la API sencillamente no
 * existe: comprobado en navegador, isSecureContext es false y navigator.clipboard
 * es undefined. El plan B con execCommand no es un adorno para navegadores
 * viejos, es el camino que se usa en desarrollo todos los días.
 *
 * **Y el plan B no puede vaciar.** execCommand solo funciona dentro de un gesto
 * del usuario: durante el clic sí, pero en el temporizador de treinta segundos
 * después ya no hay gesto y el navegador lo ignora. Comprobado en navegador, la
 * contraseña seguía en el portapapeles pasado el plazo. De ahí que el resultado
 * de copiar distinga si el vaciado se ha programado: quien avisa al usuario no
 * debe prometer una limpieza que no va a ocurrir.
 */

/**
 * Segundos antes de vaciar el portapapeles.
 *
 * Treinta es lo que tarda una persona en pegar la contraseña donde iba, con
 * margen para equivocarse de pestaña una vez. Bajarlo mucho convierte la medida
 * en una molestia, y subirlo la deja en decorativa.
 */
export const SEGUNDOS_HASTA_VACIAR = 30

/**
 * `copiado-sin-vaciado` no es un caso raro: es lo que ocurre siempre en el
 * entorno local, y también cuando el usuario deniega el permiso y hay que
 * recurrir al plan B.
 */
export type ResultadoDeCopia = 'copiado-con-vaciado' | 'copiado-sin-vaciado' | 'error'

/** Por qué vía se consiguió copiar, o null si no se consiguió. */
type Via = 'moderna' | 'plan-b' | null

let vaciadoPendiente: ReturnType<typeof setTimeout> | null = null

/**
 * Plan B para contextos no seguros.
 *
 * execCommand está marcado como obsoleto, pero es lo único que funciona sin
 * https. El textarea va fuera de la vista y se quita en cuanto termina; aun así,
 * durante ese instante la contraseña existe en el DOM, que es una diferencia
 * real respecto al camino moderno y conviene tenerla presente.
 */
function copiarConTextareaOculto(texto: string): boolean {
  const campo = document.createElement('textarea')

  campo.value = texto
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

async function escribir(texto: string): Promise<Via> {
  if (window.isSecureContext && typeof navigator.clipboard?.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(texto)

      return 'moderna'
    } catch {
      // El usuario pudo denegar el permiso. Se intenta el plan B antes de rendirse.
    }
  }

  return copiarConTextareaOculto(texto) ? 'plan-b' : null
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
export async function copiar(texto: string, vaciarDespues = true): Promise<ResultadoDeCopia> {
  const via = await escribir(texto)

  if (via === null) {
    return 'error'
  }

  // Solo hay un vaciado en vuelo: copiar otra cosa reinicia la cuenta en vez de
  // acumular temporizadores que se dispararían a destiempo.
  cancelarVaciado()

  if (!vaciarDespues || via !== 'moderna') {
    return 'copiado-sin-vaciado'
  }

  vaciadoPendiente = setTimeout(() => {
    vaciadoPendiente = null
    void escribir('')
  }, SEGUNDOS_HASTA_VACIAR * 1000)

  return 'copiado-con-vaciado'
}

export function cancelarVaciado(): void {
  if (vaciadoPendiente !== null) {
    clearTimeout(vaciadoPendiente)
    vaciadoPendiente = null
  }
}
