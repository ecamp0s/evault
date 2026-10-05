/**
 * The browser this build is for, from `EVAULT_EXTENSION_BROWSER` (ADR-025 §2.8).
 *
 * WITHOUT IT, CHROME, so the build that is already installed against kastor does not
 * change by somebody forgetting a variable. Firefox is a known name and is refused with
 * its reason until #680 gives it an implementation: building it today would produce an
 * extension whose manifest and custody are Chrome's, which installs nowhere.
 */

export const DEFAULT_BROWSER = 'chrome'

/** The browsers this build can produce. Firefox joins with #680. */
export const BROWSERS = ['chrome'] as const
export type Browser = (typeof BROWSERS)[number]

/** Why a configured browser was refused, in the words the build prints. */
export class InvalidTarget extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidTarget'
  }
}

export function parseBrowser(raw: string | undefined): Browser {
  const name = (raw ?? DEFAULT_BROWSER).trim().toLowerCase() || DEFAULT_BROWSER

  if ((BROWSERS as readonly string[]).includes(name)) return name as Browser

  if (name === 'firefox') {
    throw new InvalidTarget('la build de Firefox todavía no existe: llega con el #680 (ADR-025)')
  }

  throw new InvalidTarget(`«${raw}» no es un navegador para el que se construya: ${BROWSERS.join(', ')}`)
}
