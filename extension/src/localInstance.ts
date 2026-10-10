/**
 * The instance the extensions are built for, and where Chrome loads them from, read from a
 * file OUTSIDE THE REPOSITORY (#798): ~/.config/evault/extension.env, next to Mozilla's
 * amo.env. The instance names never go in a versioned file (ADR-023 §2.5), and until #798
 * they lived in nobody's notes: the only copy was the manifest of the last build.
 *
 * Plain KEY=VALUE lines, `#` for comments, and only the two keys this needs: anything else
 * in the file is ignored rather than handed to a build.
 */
export interface LocalInstance {
  /** EVAULT_EXTENSION_ORIGINS: the tailnet name first, because the passkeys are bound to it. */
  origins?: string
  /** EVAULT_CHROME_EXTENSION_DIR: the folder chrome://extensions shows under «Cargado desde». */
  chromeDir?: string
  /** EVAULT_FIREFOX_PUBLISH: where the signed Firefox build goes, as scp writes it: host:folder (#796). */
  firefoxPublish?: string
}

const KEYS = {
  EVAULT_EXTENSION_ORIGINS: 'origins',
  EVAULT_CHROME_EXTENSION_DIR: 'chromeDir',
  EVAULT_FIREFOX_PUBLISH: 'firefoxPublish',
} as const

export function parseLocalInstance(text: string): LocalInstance {
  const instance: LocalInstance = {}

  for (const line of text.split('\n')) {
    const match = line.trim().match(/^([A-Z_]+)=(.*)$/)
    if (!match || !(match[1] in KEYS)) continue

    const value = match[2].trim().replace(/^(["'])(.*)\1$/, '$2')
    if (value !== '') instance[KEYS[match[1] as keyof typeof KEYS]] = value
  }

  return instance
}

/**
 * Whether the Chrome folder may be emptied and filled with a new build.
 *
 * ONLY IF IT IS EMPTY OR ALREADY HOLDS AN eVault EXTENSION. The folder comes from a file a
 * person edits, and a wrong path there must not cost whatever happens to live at it: the
 * build is copied after the folder is emptied, so this is the only thing standing between
 * a typo and a deleted folder.
 */
export function isReplaceableChromeDir(entries: string[], manifest: string | null): boolean {
  if (entries.length === 0) return true
  if (manifest === null) return false

  try {
    const parsed = JSON.parse(manifest) as { name?: unknown; manifest_version?: unknown }
    return parsed.name === 'eVault' && parsed.manifest_version === 3
  } catch {
    return false
  }
}

/**
 * Where a published Firefox build lands, split for `ssh` and `scp` (#796): `kastor:Apps/x`
 * gives the host and the folder. Null when it is not that shape, so a typo is refused
 * before anything is signed rather than after.
 */
export function publishTarget(value: string): { host: string; folder: string } | null {
  const match = value.trim().match(/^([^:\s]+):(\S+)$/)
  return match ? { host: match[1], folder: match[2].replace(/\/+$/, '') } : null
}

/**
 * The two names a build is published under: one per version, which is what refuses
 * publishing the same version twice, and a stable one, which is the link people keep.
 */
export function publishedNames(version: string): { versioned: string; latest: string } {
  return { versioned: `evault-firefox-${version}.xpi`, latest: 'evault-firefox.xpi' }
}
