import { chromePlatform } from './chrome'
import type { Platform } from './types'

/**
 * The browser this build runs in.
 *
 * Only Chrome today: the build refuses any other target (src/target.ts), and Firefox's
 * implementation arrives with #680 (ADR-025). When it does, this is the one place that
 * chooses between them, by the target the build was given.
 *
 * FIREFOX'S WILL CALL `browser.*` AND NOT `chrome.*`. ADR-025 §4 asked whether Firefox's
 * `chrome` namespace returns promises under Manifest V2, and #748 did not record which of
 * the two filled. Calling the namespace whose promises Firefox documents means not having
 * to depend on the answer.
 */
export const platform: Platform = chromePlatform
