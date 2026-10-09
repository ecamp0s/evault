#!/usr/bin/env node
/**
 * Builds the Firefox extension for an instance, has Mozilla sign it as unlisted, and checks
 * that what comes back is what was built (ADR-025 §2.4 and §4).
 *
 *   npm run sign:firefox
 *
 * The instance comes from ~/.config/evault/extension.env (#798), or from
 * EVAULT_EXTENSION_ORIGINS, which wins over the file.
 *
 * WHAT IT REFUSES, each one before anything is sent to Mozilla:
 *
 * - No instance. The default is the development one, and signing it spends a version on an
 *   extension that only opens localhost.
 * - Credentials anyone else on the machine can read. They sign anything under the
 *   extension's identifier, so the file must be the owner's alone (mode 600).
 *
 * THE CREDENTIALS NEVER APPEAR: they are read from a file outside the repository —
 * ~/.config/evault/amo.env, or EVAULT_AMO_ENV — and handed to web-ext in its environment
 * only. They are never an argument, which `ps` would show.
 *
 * WEB-EXT RUNS THROUGH NPX AT AN EXACT VERSION, and is not a dependency on purpose: its
 * Android tooling pulls in three high advisories with no fix but a version years old, and
 * in a public repository they would be three alerts for code this never runs.
 *
 * The version in src/manifest.ts goes up before each signature: Mozilla refuses to sign
 * the same one twice.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'
import { compareSignedToBuild } from '../src/signedBuild.ts'
import { VERSION } from '../src/manifest.ts'
import { LOCAL_INSTANCE_FILE, localInstance } from './localInstance.mjs'

const WEB_EXT = 'web-ext@10.7.0'
const EXTENSION = new URL('..', import.meta.url).pathname
const DIST = join(EXTENSION, 'dist-firefox')
const SIGNED = join(EXTENSION, 'signed-firefox')
const CREDENTIALS = process.env.EVAULT_AMO_ENV ?? join(homedir(), '.config', 'evault', 'amo.env')

const fail = (message) => {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}

const { origins } = localInstance()
if (!origins) {
  fail(`Falta EVAULT_EXTENSION_ORIGINS, ni en el entorno ni en ${LOCAL_INSTANCE_FILE}. Sin ella la build apunta a localhost, y firmarla gasta una versión en Mozilla.`)
}

if (!existsSync(CREDENTIALS)) fail(`No están las claves de Mozilla en ${CREDENTIALS}.`)
if ((statSync(CREDENTIALS).mode & 0o077) !== 0) {
  fail(`${CREDENTIALS} lo puede leer alguien más que su dueño: chmod 600 antes de firmar.`)
}

const credentials = Object.fromEntries(
  readFileSync(CREDENTIALS, 'utf8')
    .split('\n')
    .map((line) => line.trim().match(/^(WEB_EXT_API_KEY|WEB_EXT_API_SECRET)=(.+)$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value]),
)
if (!credentials.WEB_EXT_API_KEY || !credentials.WEB_EXT_API_SECRET) {
  fail(`${CREDENTIALS} tiene que traer WEB_EXT_API_KEY y WEB_EXT_API_SECRET.`)
}

const run = (command, args, env = {}) => {
  const result = spawnSync(command, args, { cwd: EXTENSION, stdio: 'inherit', env: { ...process.env, EVAULT_EXTENSION_ORIGINS: origins, ...env } })
  if (result.status !== 0) fail(`${command} ${args[0]} terminó con ${result.status}.`)
}

console.log(`Construyendo la de Firefox ${VERSION} para ${origins}…`)
run('npx', ['tsc', '-b'])
run('npx', ['vite', 'build'], { EVAULT_EXTENSION_BROWSER: 'firefox' })

console.log('\nPidiendo la firma a Mozilla, sin publicarla (unlisted). Tarda unos minutos…')
run('npx', ['--yes', WEB_EXT, 'sign', '--channel=unlisted', '--source-dir', DIST, '--artifacts-dir', SIGNED, '--approval-timeout', '900000'], credentials)

const xpi = readdirSync(SIGNED).find((name) => name.endsWith(`-${VERSION}.xpi`))
if (!xpi) fail(`Mozilla no devolvió ningún .xpi de la versión ${VERSION} en ${SIGNED}.`)
const xpiPath = join(SIGNED, xpi)

const builtFiles = (directory) =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(DIST, join(entry.parentPath, entry.name)))

const built = new Map(builtFiles(DIST).map((name) => [name, readFileSync(join(DIST, name))]))
const listed = spawnSync('unzip', ['-Z1', xpiPath], { encoding: 'utf8' }).stdout.split('\n').filter((name) => name && !name.endsWith('/'))
const signed = new Map(listed.map((name) => [name, spawnSync('unzip', ['-p', xpiPath, name]).stdout]))

const problems = compareSignedToBuild(built, signed)
if (problems.length > 0) {
  fail(`Lo firmado NO es lo construido, y no hay que instalarlo:\n  - ${problems.join('\n  - ')}`)
}

console.log(`
✓ Firmada: ${relative(process.cwd(), xpiPath)}
  Es la build byte a byte, salvo manifest.json, que Mozilla reescribe y dice lo mismo (#749).
  Se instala en Firefox desde about:addons → engranaje → «Instalar complemento desde archivo…».`)
