#!/usr/bin/env node
/**
 * Builds the Chrome extension for the instance and leaves it in the folder Chrome loads it
 * from (#798), both read from ~/.config/evault/extension.env. After it, the only step left
 * is «Recargar» in chrome://extensions.
 *
 *   npm run release:chrome
 *
 * Until #798 this was a build into dist/ and a copy by hand, and neither the folder nor the
 * origins were written anywhere: in the 20 the first rebuild went to an old folder Chrome
 * did not load.
 *
 * IT EMPTIES THE FOLDER ONLY IF IT HOLDS AN eVault EXTENSION, or nothing: the path comes
 * from a file a person edits (see isReplaceableChromeDir).
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { isReplaceableChromeDir } from '../src/localInstance.ts'
import { VERSION } from '../src/manifest.ts'
import { LOCAL_INSTANCE_FILE, localInstance } from './localInstance.mjs'

const EXTENSION = new URL('..', import.meta.url).pathname
const DIST = join(EXTENSION, 'dist')

const fail = (message) => {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}

const { origins, chromeDir } = localInstance()
if (!origins) fail(`Falta EVAULT_EXTENSION_ORIGINS en ${LOCAL_INSTANCE_FILE}. Cómo rehacerlo, en DEPLOYMENT.md §9.`)
if (!chromeDir) fail(`Falta EVAULT_CHROME_EXTENSION_DIR en ${LOCAL_INSTANCE_FILE}: la carpeta de «Cargado desde» en chrome://extensions.`)
if (!existsSync(chromeDir)) fail(`${chromeDir} no existe. Es la carpeta de «Cargado desde» en chrome://extensions, vista desde WSL.`)

const entries = readdirSync(chromeDir)
const manifestPath = join(chromeDir, 'manifest.json')
const manifest = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : null
if (!isReplaceableChromeDir(entries, manifest)) {
  fail(`${chromeDir} no está vacía ni tiene una extensión eVault de Chrome dentro, así que no se toca.`)
}

const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: EXTENSION, stdio: 'inherit', env: { ...process.env, EVAULT_EXTENSION_ORIGINS: origins } })
  if (result.status !== 0) fail(`${command} ${args[0]} terminó con ${result.status}.`)
}

console.log(`Construyendo la de Chrome ${VERSION} para ${origins}…`)
run('npx', ['tsc', '-b'])
run('npx', ['vite', 'build'])

for (const entry of entries) rmSync(join(chromeDir, entry), { recursive: true, force: true })
cpSync(DIST, chromeDir, { recursive: true })

console.log(`
✓ La ${VERSION} está en ${chromeDir}.
  Falta pulsar «Recargar» en eVault, en chrome://extensions.`)
