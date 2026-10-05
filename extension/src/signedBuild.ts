/**
 * Whether the `.xpi` Mozilla signed is the build that was sent, file by file (ADR-025 §4).
 *
 * It is the check that makes the unlisted signature acceptable under the first criterion
 * of ADR-015 — whoever controls the code controls the encryption — and #749 measured what
 * it has to allow:
 *
 * - `META-INF/`, which is the signature itself and is all Mozilla adds.
 * - `manifest.json` NOT BYTE FOR BYTE: Mozilla rewrites it when signing, escaping every
 *   character outside ASCII (an accented o comes back as the escape `\u00f3`). It is compared as
 *   parsed JSON, which is what Firefox reads, so a field added or changed still fails.
 * - Every other file byte for byte.
 *
 * Dotfiles of the build are left out: `web-ext` writes `.amo-upload-uuid` into the folder it
 * signs, and does not put it in the package.
 *
 * Returns what does not match, in the words the signing script prints; empty means it is
 * the same build.
 */
export function compareSignedToBuild(built: Map<string, Uint8Array>, signed: Map<string, Uint8Array>): string[] {
  const problems: string[] = []
  const isSignature = (name: string) => name.startsWith('META-INF/')
  const isDotfile = (name: string) => name.split('/').some((part) => part.startsWith('.'))

  if (![...signed.keys()].some(isSignature)) problems.push('el paquete no trae META-INF/: no está firmado')

  for (const [name, bytes] of built) {
    if (isDotfile(name)) continue

    const returned = signed.get(name)
    if (!returned) {
      problems.push(`${name} está en la build y no en lo firmado`)
    } else if (name === 'manifest.json') {
      if (!sameJson(bytes, returned)) problems.push('manifest.json firmado dice otra cosa que el de la build')
    } else if (!sameBytes(bytes, returned)) {
      problems.push(`${name} no es byte a byte el de la build`)
    }
  }

  for (const name of signed.keys()) {
    if (!isSignature(name) && !built.has(name)) problems.push(`${name} está en lo firmado y no en la build`)
  }

  return problems
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index])
}

function sameJson(a: Uint8Array, b: Uint8Array): boolean {
  const decoder = new TextDecoder()
  try {
    return canonical(JSON.parse(decoder.decode(a))) === canonical(JSON.parse(decoder.decode(b)))
  } catch {
    return false
  }
}

/** JSON with its keys sorted, so the same object in another order compares equal. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`).join(',')}}`
  }
  return JSON.stringify(value)
}
