import { startCustodyHost } from '../../custody/host'

/**
 * Chrome's custody host: the offscreen document (ADR-023 §2.2).
 *
 * It closes itself once the key is gone, so a locked extension holds no document — which
 * is also how the popup knows it is locked without asking (src/platform/chrome/index.ts).
 */
startCustodyHost(() => window.close())
