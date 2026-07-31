import axios, { AxiosError } from 'axios'

/**
 * Cliente HTTP único de la aplicación.
 *
 * La URL base viene de VITE_API_URL y no se hardcodea: el mismo build tiene que
 * poder servir al SaaS y a un despliegue self-hosted. Ver ADR-005.
 */
const baseURL = import.meta.env.VITE_API_URL

if (!baseURL) {
  // Falla al arrancar y no en la primera petición. Un error aquí es una
  // configuración que falta; descubrirlo al pulsar «entrar» lo disfrazaría de
  // problema de red.
  throw new Error(
    'Falta VITE_API_URL. Copia web/.env.example a web/.env y ajusta la URL de la API.',
  )
}

export const api = axios.create({
  baseURL,
  headers: {
    // Sin esto Laravel puede responder HTML en algunos errores, y el cliente
    // recibiría una página donde espera JSON.
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
})

/**
 * Forma de los errores que devuelve la API.
 *
 * Es el contrato fijado al cerrar el issue #3: `message` para humanos técnicos y
 * logs, `errors` indexado por campo cuando son de validación.
 */
interface RespuestaDeError {
  message?: string
  errors?: Record<string, string[]>
}

/**
 * Error de la API ya interpretado, para que las pantallas no tengan que hurgar
 * en la estructura de axios.
 *
 * Importante sobre los textos: los `message` de la API son para desarrolladores
 * y no se enseñan al usuario. Quien decide qué se muestra es el cliente, a partir
 * del código HTTP y de la clave del campo. Ver el comentario de contrato en el
 * issue #5.
 */
export class ErrorDeApi extends Error {
  // Declarados aparte y no como parámetros del constructor con modificador: el
  // tsconfig activa erasableSyntaxOnly, que prohíbe la sintaxis de TypeScript que
  // genera código en tiempo de ejecución en vez de limitarse a desaparecer.
  readonly estado: number | null
  readonly erroresPorCampo: Record<string, string[]>

  constructor(
    estado: number | null,
    erroresPorCampo: Record<string, string[]>,
    mensajeTecnico: string,
  ) {
    super(mensajeTecnico)
    this.estado = estado
    this.erroresPorCampo = erroresPorCampo
    this.name = 'ErrorDeApi'
  }

  /** 422: el servidor rechazó algún campo. */
  get esDeValidacion(): boolean {
    return this.estado === 422
  }

  /** 401: credenciales incorrectas o token no válido. */
  get esDeCredenciales(): boolean {
    return this.estado === 401
  }

  /** Sin respuesta: la API no contestó (caída, CORS mal configurado, sin red). */
  get esDeRed(): boolean {
    return this.estado === null
  }
}

export function interpretarError(error: unknown): ErrorDeApi {
  if (!(error instanceof AxiosError)) {
    return new ErrorDeApi(null, {}, error instanceof Error ? error.message : 'Error desconocido')
  }

  const respuesta = error.response

  if (!respuesta) {
    return new ErrorDeApi(null, {}, error.message)
  }

  const datos = respuesta.data as RespuestaDeError | undefined

  return new ErrorDeApi(
    respuesta.status,
    datos?.errors ?? {},
    datos?.message ?? error.message,
  )
}
