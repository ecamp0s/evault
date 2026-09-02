import { describe, expect, it } from 'vitest'
// With ?raw, and for the same reason as startup.test.ts: it keeps the test from needing
// Node's types in tsconfig.app.json and from depending on where Vitest was invoked.
import html from '../../index.html?raw'
import manifestSource from '../../public/manifest.webmanifest?raw'

/*
 * What makes the application installable on a home screen. See issue #464.
 *
 * LIKE startup.test.ts, THIS FILE DOES NOT TEST A FUNCTION: IT PROTECTS A PROMISE, and
 * the promise is one nobody notices breaking. Renaming an icon, or moving the manifest,
 * leaves an application that still works perfectly in a browser tab and silently stops
 * installing — or installs with a blank square where the mark should be. Nothing throws,
 * no request fails in a way anyone looks at, and the first report comes from a person
 * holding a phone.
 *
 * THE ICONS ARE READ FROM DISK ON PURPOSE. Asserting that the manifest *names*
 * `/icons/icon-192.png` proves only that the manifest is internally consistent, which is
 * exactly the kind of check that stays green while the file it points at is gone.
 */

interface ManifestIcon {
  src: string
  sizes: string
  type: string
  purpose: string
}

/*
 * Every PNG that actually exists under public/icons, by its absolute URL path — which is
 * the form the manifest and the HTML use, so the two sides can be compared directly.
 *
 * eager so the keys are available synchronously, and the value is ignored: what is being
 * asked is whether the module resolved at all, which for an asset means the file is
 * there.
 */
const iconsOnDisk = new Set(
  Object.keys(import.meta.glob('../../public/icons/*.png', { eager: true })).map((file) =>
    file.replace('../../public', ''),
  ),
)

const document = new DOMParser().parseFromString(html, 'text/html')
const manifest = JSON.parse(manifestSource) as {
  name: string
  short_name: string
  start_url: string
  scope: string
  display: string
  icons: ManifestIcon[]
}

describe('the application can be installed on a home screen', () => {
  it('index.html links the manifest', () => {
    expect(document.querySelector('link[rel="manifest"]')?.getAttribute('href')).toBe(
      '/manifest.webmanifest',
    )
  })

  it('the manifest asks to start without an address bar', () => {
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
  })

  it('every icon the manifest names exists', () => {
    expect(manifest.icons.length).toBeGreaterThan(0)

    for (const icon of manifest.icons) {
      expect(iconsOnDisk, `el manifest nombra ${icon.src}`).toContain(icon.src)
    }
  })

  /*
   * Android crops icons to whatever shape the launcher wants, and only the inner 80 % of
   * the canvas survives. Without an icon drawn for that, the mark comes out beheaded —
   * and it looks fine everywhere the developer tends to check.
   */
  it('there is an icon drawn for a launcher that crops it', () => {
    const maskable = manifest.icons.filter((icon) => icon.purpose === 'maskable')

    expect(maskable.length).toBeGreaterThan(0)
    expect(iconsOnDisk).toContain(maskable[0].src)
  })

  /*
   * iOS does not read the manifest's icons for the home screen. If this link goes, the
   * icon on an iPhone degrades to a screenshot of the page, and nothing anywhere says so.
   */
  it('iOS gets its own icon, because it does not read the manifest for this', () => {
    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')

    expect(appleIcon).toBeTruthy()
    expect(iconsOnDisk).toContain(appleIcon)
  })

  it('the home screen name is stated instead of inherited from the title', () => {
    expect(
      document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content'),
    ).toBe(manifest.short_name)
  })
})
