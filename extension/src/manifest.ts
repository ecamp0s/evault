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
 * Only what the extension uses: the list of ADR-023 §4, complete since #673.
 *
 * - `activeTab`: the address of the tab the popup was opened over, to put its entries
 *   first. Granted per click on the icon, for that tab only; `tabs` would read every tab.
 * - `clipboardWrite`: clearing the clipboard from the offscreen document. WITHOUT IT THE
 *   CLEARING RETURNS AND DOES NOTHING, silently — measured in #672 — so a password copied
 *   would stay in the clipboard with the popup saying it would not.
 * - `idle`: locking when the operating system locks.
 * - `offscreen`: the document that holds the unlocked key.
 * - `scripting`: filling a form, injected at the click and only into the tab `activeTab`
 *   granted. Without content scripts, this is the only way code of the extension enters a
 *   page, and it only does on a gesture.
 * - `storage`: the remembered email, which is not a secret.
 */
export const PERMISSIONS = ['activeTab', 'clipboardWrite', 'idle', 'offscreen', 'scripting', 'storage'] as const

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

/**
 * The same in both browsers. The name says no browser on purpose: Mozilla refuses an
 * add-on whose name carries «Firefox» or «Mozilla», measured in #749.
 *
 * THE VERSION GOES UP WITH EVERY FIREFOX SIGNATURE, because Mozilla does not sign the same
 * version twice (ADR-025 §4). Chrome loads the folder and does not care.
 */
const NAME = 'eVault'
export const VERSION = '0.1.4'
const DESCRIPTION = 'Tu vault de eVault desde la barra del navegador.'

/**
 * The extension's icon at the sizes both browsers ask for (#767): the toolbar at 16 and 32,
 * the extensions page at 48 and the store-sized 128. Without them each shows a generic
 * puzzle piece. They are rendered from web/public/favicon.svg by scripts/build-icons.mjs,
 * the same drawing as the PWA, and Vite copies them from src/public.
 */
export const ICONS = Object.fromEntries([16, 32, 48, 128].map((size) => [String(size), `icons/icon-${size}.png`]))
const TOOLBAR_ICONS = { '16': ICONS['16'], '32': ICONS['32'] }

export function buildManifest(origins: string[]) {
  return {
    manifest_version: 3,
    name: NAME,
    version: VERSION,
    description: DESCRIPTION,
    icons: ICONS,
    action: { default_popup: 'popup.html', default_icon: TOOLBAR_ICONS },
    background: { service_worker: 'background.js', type: 'module' },
    permissions: [...PERMISSIONS],
    host_permissions: hostPatterns(origins),
  }
}

/**
 * Firefox's permissions, ADR-025 §4: Chrome's without `offscreen`, which Firefox does not
 * have, and without `idle`, which there cannot see the system locking (#748) and would be
 * asked for and never used.
 */
export const FIREFOX_PERMISSIONS = ['activeTab', 'clipboardWrite', 'scripting', 'storage'] as const

/** The identifier Mozilla ties to the account that signs it, for good (ADR-025 §2.6). */
export const FIREFOX_ID = 'evault@ecamp0s.github.io'

/**
 * Firefox's manifest (ADR-025 §4).
 *
 * MANIFEST V2, because its background page can be persistent and that is where the key
 * lives (§2.1): Firefox's V3 background is an event page that unloads, and the key would go
 * with it. #716 also found that under V3 Firefox does not grant host permissions at install.
 *
 * NO `update_url`, and that is what keeps updating a manual act: without it Firefox asks
 * Mozilla's update service, which does not offer unlisted versions (#749). Host permissions
 * go in `permissions`, which is where V2 keeps them, and without their port for the same
 * reason as in Chrome.
 */
export function buildFirefoxManifest(origins: string[]) {
  return {
    manifest_version: 2,
    name: NAME,
    version: VERSION,
    description: DESCRIPTION,
    icons: ICONS,
    browser_action: { default_popup: 'popup.html', default_icon: TOOLBAR_ICONS },
    background: { page: 'background.html', persistent: true },
    permissions: [...FIREFOX_PERMISSIONS, ...hostPatterns(origins)],
    browser_specific_settings: {
      gecko: {
        id: FIREFOX_ID,
        // The version #748 and #749 measured on, and nothing older has been tried.
        strict_min_version: '156.0',
        // Required of every new add-on (#749). eVault sends Mozilla nothing.
        data_collection_permissions: { required: ['none'] },
      },
    },
  }
}
