import { z } from 'zod'

/**
 * Zod without its `new Function` probe (#774).
 *
 * On first use Zod 4 checks whether it may compile its validators with `new Function("")`,
 * inside a try/catch. The production CSP has no `unsafe-eval` (src/lib/csp.ts), so the
 * browser blocks it, Zod catches it and validates without the shortcut — and the browser
 * still records a CSP violation, which Chrome lists under «Issues» on every page that
 * validates a form. Nothing breaks and nothing is weaker: it is the CSP working. Zod's own
 * code names the way out, and it is this: with `jitless` it never tries.
 *
 * IMPORTED FIRST IN main.tsx, before anything that defines or runs a schema, so no
 * validation happens before the setting does. What it costs is Zod's compiled fast path,
 * which forms of this size do not notice.
 */
z.config({ jitless: true })
