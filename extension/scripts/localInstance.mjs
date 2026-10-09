/**
 * The local instance file, ~/.config/evault/extension.env (#798), for the scripts that build
 * for kastor. What the environment says wins over the file, so a one-off build for another
 * instance is still `EVAULT_EXTENSION_ORIGINS=… npm run …`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseLocalInstance } from '../src/localInstance.ts'

export const LOCAL_INSTANCE_FILE = process.env.EVAULT_INSTANCE_ENV ?? join(homedir(), '.config', 'evault', 'extension.env')

export function localInstance() {
  const fromFile = existsSync(LOCAL_INSTANCE_FILE) ? parseLocalInstance(readFileSync(LOCAL_INSTANCE_FILE, 'utf8')) : {}

  return {
    origins: process.env.EVAULT_EXTENSION_ORIGINS || fromFile.origins,
    chromeDir: process.env.EVAULT_CHROME_EXTENSION_DIR || fromFile.chromeDir,
  }
}
