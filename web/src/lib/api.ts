import axios, { AxiosError } from 'axios'

/**
 * Cliente HTTP único de la aplicación.
 *
 * La URL base es RELATIVA, y eso es la decisión de ADR-016: la API vive en `/api`
 * del mismo origen que sirve la SPA, así que un `dist/` construido una vez funciona
 * servido desde cualquier hostname.
 *
 * Antes venía de `VITE_API_URL`, que Vite sustituía en tiempo de build y por tanto
 * quedaba escrita dentro del JavaScript generado: el artefacto era específico de un
 * despliegue. Eso se rompió al llegar Tailscale, que da UN nombre DNS por máquina —
 * el mismo bundle tenía que responder por `evault.local` y por el nombre de la
 * tailnet, y no podía. Ver ADR-016 §1 y el issue #296.
 *
 * Consecuencia que conviene tener presente: la API ya no es alcanzable por un
 * hostname propio. Para hablar con ella fuera de la SPA se usa `https://<host>/api`,
 * que es lo que hace la SPA misma.
 */
const baseURL = '/api'

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
interface ErrorResponse {
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
export class ApiError extends Error {
  // Declarados aparte y no como parámetros del constructor con modificador: el
  // tsconfig activa erasableSyntaxOnly, que prohíbe la sintaxis de TypeScript que
  // genera código en tiempo de ejecución en vez de limitarse a desaparecer.
  readonly state: number | null
  readonly fieldErrors: Record<string, string[]>

  constructor(
    state: number | null,
    fieldErrors: Record<string, string[]>,
    technicalMessage: string,
  ) {
    super(technicalMessage)
    this.state = state
    this.fieldErrors = fieldErrors
    this.name = 'ErrorDeApi'
  }

  /** 422: el servidor rechazó algún campo. */
  get isValidation(): boolean {
    return this.state === 422
  }

  /** 401: credenciales incorrectas o token no válido. */
  get isCredentials(): boolean {
    return this.state === 401
  }

  /** Sin respuesta: la API no contestó (caída o sin red). Desde ADR-016 comparte
   *  origen con la SPA, así que CORS ya no puede ser la causa. */
  get isNetwork(): boolean {
    return this.state === null
  }
}

export function interpretError(error: unknown): ApiError {
  if (!(error instanceof AxiosError)) {
    return new ApiError(null, {}, error instanceof Error ? error.message : 'Error desconocido')
  }

  const response = error.response

  if (!response) {
    return new ApiError(null, {}, error.message)
  }

  const data = response.data as ErrorResponse | undefined

  return new ApiError(
    response.status,
    data?.errors ?? {},
    data?.message ?? error.message,
  )
}
