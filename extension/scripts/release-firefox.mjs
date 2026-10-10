#!/usr/bin/env node
/**
 * Signs the Firefox extension and publishes it on the instance, where it is installed from
 * a link (#796): `https://<instance>/extension/evault-firefox.xpi`.
 *
 *   npm run release:firefox
 *
 * Until #796 the signed file was handed over by hand and the old version removed before
 * installing the new one. Firefox installs a newer version over the old one with the same
 * identifier (measured in #796), so what was left was handing the file over.
 *
 * STILL A MANUAL INSTALL, AND ON PURPOSE: the manifest has no `update_url`, so nothing
 * reaches a Firefox until somebody opens the link and accepts (ADR-025 §2.4). The instance
 * serves the file; it does not push it.
 *
 * WHERE IT GOES is EVAULT_FIREFOX_PUBLISH in ~/.config/evault/extension.env, as scp writes
 * it: `kastor:Apps/evault/downloads`, the folder compose.deploy.yaml serves on /extension/.
 *
 * WHAT IT REFUSES, each one before anything is sent to Mozilla, which signs a version once:
 * no target or a malformed one, a folder that is not there or not writable, and a version
 * that is already published there.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseOrigins } from '../src/instance.ts'
import { publishTarget, publishedNames } from '../src/localInstance.ts'
import { VERSION } from '../src/manifest.ts'
import { LOCAL_INSTANCE_FILE, localInstance } from './localInstance.mjs'

const EXTENSION = new URL('..', import.meta.url).pathname
const SIGNED = join(EXTENSION, 'signed-firefox')

const fail = (message) => {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}

const { origins, firefoxPublish } = localInstance()
if (!origins) fail(`Falta EVAULT_EXTENSION_ORIGINS en ${LOCAL_INSTANCE_FILE}. Cómo rehacerlo, en DEPLOYMENT.md §9.`)
if (!firefoxPublish) fail(`Falta EVAULT_FIREFOX_PUBLISH en ${LOCAL_INSTANCE_FILE}: dónde se publica, como host:carpeta. Ver DEPLOYMENT.md §9.3.`)

const target = publishTarget(firefoxPublish)
if (!target) fail(`EVAULT_FIREFOX_PUBLISH tiene que ser host:carpeta, como kastor:Apps/evault/downloads, y es «${firefoxPublish}».`)

const { versioned, latest } = publishedNames(VERSION)
const remote = (command) => spawnSync('ssh', [target.host, command], { encoding: 'utf8' })

const folder = remote(`test -d '${target.folder}' && test -w '${target.folder}'`)
if (folder.status !== 0) {
  fail(`${target.host}:${target.folder} no existe o no se puede escribir en ella. Se crea antes de levantar el despliegue; si Docker la creó, es de root. Ver DEPLOYMENT.md §9.3.`)
}
if (remote(`test -e '${target.folder}/${versioned}'`).status === 0) {
  fail(`La ${VERSION} ya está publicada en ${target.host}. Sube la versión de src/manifest.ts: Mozilla no firma dos veces la misma.`)
}

const signed = spawnSync('node', [join(EXTENSION, 'scripts', 'sign-firefox.mjs')], { cwd: EXTENSION, stdio: 'inherit' })
if (signed.status !== 0) fail('La firma no salió bien, así que no se publica nada.')

const xpi = readdirSync(SIGNED).find((name) => name.endsWith(`-${VERSION}.xpi`))
if (!xpi) fail(`No está el .xpi firmado de la ${VERSION} en ${SIGNED}.`)

/*
 * The versioned name first, and the stable one replaced by a rename on the instance: a
 * person opening the link mid-publish gets the previous build whole, never half of this one.
 */
const copied = spawnSync('scp', ['-q', join(SIGNED, xpi), `${target.host}:${target.folder}/${versioned}`], { stdio: 'inherit' })
if (copied.status !== 0) fail(`No se pudo copiar a ${target.host}:${target.folder}.`)
const swapped = remote(`cp '${target.folder}/${versioned}' '${target.folder}/.${latest}.tmp' && mv '${target.folder}/.${latest}.tmp' '${target.folder}/${latest}'`)
if (swapped.status !== 0) fail(`Se copió ${versioned}, pero no se pudo dejar como ${latest}: ${swapped.stderr.trim()}`)

const link = `${parseOrigins(origins)[0]}/extension/${latest}`
console.log(`
✓ La ${VERSION} está publicada: ${link}
  Se instala abriendo ese enlace en Firefox: pedirá permiso al sitio y después «Añadir».
  Se instala encima de la anterior, sin quitarla.`)
