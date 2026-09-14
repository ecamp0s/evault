import type { Item } from '@/lib/vault/types'
import { fillHostOf } from '../entries'
import { fillInPage, type FillOutcome } from './inPage'

/**
 * Injects the fill into a tab: the first of the two barriers that keep it out of frames.
 *
 * NO `allFrames` AND NO `frameIds`, which is what makes Chrome run it in the top frame
 * alone. `fillInPage` checks the same thing again inside the page, and the two are kept
 * separate on purpose — with only the second, a change that injected into every frame
 * would still be safe and nobody would notice the first one had gone. A test holds this
 * one in place on its own.
 */
export async function injectFill(
  scripting: Pick<typeof chrome.scripting, 'executeScript'>,
  tabId: number,
  item: Item,
): Promise<FillOutcome | 'unreachable'> {
  try {
    const [injection] = await scripting.executeScript({
      target: { tabId },
      func: fillInPage,
      args: [item.content.username ?? '', item.content.password ?? '', fillHostOf(item)],
    })
    return (injection?.result as FillOutcome | undefined) ?? 'unreachable'
  } catch {
    // The tab navigated to a page this click no longer grants, or it is a browser page.
    return 'unreachable'
  }
}
