import { chromePlatform } from './chrome'
import { firefoxPlatform } from './firefox'
import type { Platform } from './types'

/**
 * The browser this build runs in, chosen by the target the build was given (src/target.ts)
 * and the only place that chooses.
 *
 * `__BROWSER__` is a constant the build writes in, so the bundle carries both objects but
 * only ever touches one. That is why neither reads its namespace when it loads: in Chrome
 * there is no `browser`, and the getters keep the Firefox object from asking for it.
 */
export const platform: Platform = __BROWSER__ === 'firefox' ? firefoxPlatform : chromePlatform
