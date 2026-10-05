import { describe, expect, it } from 'vitest'
import { compareSignedToBuild } from './signedBuild'

const text = (value: string) => new TextEncoder().encode(value)
const files = (entries: Record<string, string>) => new Map(Object.entries(entries).map(([name, value]) => [name, text(value)]))

const MANIFEST = '{\n  "name": "eVault",\n  "description": "Tu vault desde la extensión"\n}'
const BUILD = { 'manifest.json': MANIFEST, 'popup.html': '<p>hola</p>', 'assets/popup.js': 'run()' }
const SIGNATURE = { 'META-INF/mozilla.rsa': 'firma', 'META-INF/manifest.mf': 'resumen' }

describe('what Mozilla signed against what was built', () => {
  it('accepts the build plus its signature', () => {
    expect(compareSignedToBuild(files(BUILD), files({ ...BUILD, ...SIGNATURE }))).toEqual([])
  })

  /*
   * #749: Mozilla escaped an accented o as \u00f3 when signing. The same JSON written differently,
   * and Firefox reads the same thing, so it has to pass — or every signature would fail.
   */
  it('accepts a manifest Mozilla reserialised, as #749 measured', () => {
    const reserialised = '{"description":"Tu vault desde la extensi\\u00f3n","name":"eVault"}'
    expect(compareSignedToBuild(files(BUILD), files({ ...BUILD, ...SIGNATURE, 'manifest.json': reserialised }))).toEqual([])
  })

  it('refuses a manifest that says something else', () => {
    const changed = MANIFEST.replace('}', ',\n  "update_url": "https://otro.test/updates.json"\n}')
    expect(compareSignedToBuild(files(BUILD), files({ ...BUILD, ...SIGNATURE, 'manifest.json': changed }))).toEqual([
      'manifest.json firmado dice otra cosa que el de la build',
    ])
  })

  it('refuses a file that changed by a single byte', () => {
    expect(compareSignedToBuild(files(BUILD), files({ ...BUILD, ...SIGNATURE, 'assets/popup.js': 'run();' }))).toEqual([
      'assets/popup.js no es byte a byte el de la build',
    ])
  })

  it('refuses a file added outside the signature, and one taken away', () => {
    const { 'popup.html': _gone, ...rest } = BUILD
    void _gone
    expect(compareSignedToBuild(files(BUILD), files({ ...rest, ...SIGNATURE, 'assets/extra.js': 'leak()' }))).toEqual([
      'popup.html está en la build y no en lo firmado',
      'assets/extra.js está en lo firmado y no en la build',
    ])
  })

  it('refuses a package that is not signed at all', () => {
    expect(compareSignedToBuild(files(BUILD), files(BUILD))).toEqual(['el paquete no trae META-INF/: no está firmado'])
  })

  it('ignores the dotfile web-ext leaves in the folder it signs', () => {
    const built = files({ ...BUILD, '.amo-upload-uuid': '{"uploadUuid":"x"}' })
    expect(compareSignedToBuild(built, files({ ...BUILD, ...SIGNATURE }))).toEqual([])
  })
})
