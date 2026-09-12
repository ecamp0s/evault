/**
 * The extension's manifest, as a function of the instance origins (src/instance.ts).
 *
 * A function and not a JSON file, for two reasons: the host permissions are the
 * instance's, which are not in the repository, and the permission list is the thing
 * ADR-023 §4 says must stay exactly what the extension uses — so it is tested, and a
 * permission added without a test changing is a red build.
 *
 * NO CONTENT SCRIPTS, and that is a decision and not a gap (ADR-023 §4): filling a form
 * enters the page with `chrome.scripting` at the moment of the gesture, and at no other,
 * so nothing of the extension runs in a page nobody asked to fill.
 */

/**
 * Only what this build uses. ADR-023 §4 lists the finished extension's — `activeTab`,
 * `scripting` and `clipboardWrite` arrive with the issues that need them.
 *
 * - `offscreen`: the document that holds the unlocked key.
 * - `idle`: locking when the operating system locks.
 * - `storage`: the remembered email, which is not a secret.
 */
export const PERMISSIONS = ['idle', 'offscreen', 'storage'] as const

/**
 * One host pattern per origin, WITHOUT ITS PORT, and the port is not dropped by accident.
 *
 * Measured in #671, in Chromium 152: with `http://localhost:5173/*` the extension could
 * fetch from the instance and WebAuthn refused its RP ID with a SecurityError; with
 * `http://localhost/*` both worked. Chrome checks the RP ID against a host permission
 * that matches the host alone, and a pattern carrying a port does not count for that —
 * while for fetch a pattern without a port covers every port of the host. The instance
 * of this project is on 443 and never noticed; the development one, on 5173, could not
 * unlock at all.
 */
export function hostPatterns(origins: string[]): string[] {
  return [...new Set(origins.map((origin) => {
    const url = new URL(origin)
    return `${url.protocol}//${url.hostname}/*`
  }))]
}

export function buildManifest(origins: string[]) {
  return {
    manifest_version: 3,
    name: 'eVault',
    version: '0.0.1',
    description: 'Tu vault de eVault desde la barra del navegador.',
    action: { default_popup: 'popup.html' },
    background: { service_worker: 'background.js', type: 'module' },
    permissions: [...PERMISSIONS],
    host_permissions: hostPatterns(origins),
  }
}
