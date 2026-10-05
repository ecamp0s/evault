import { CUSTODY_CHANNEL } from '../../custody/protocol'
import { onIdleStateChanged } from './systemLock'

/**
 * The service worker. It holds nothing: Manifest V3 stops it after thirty seconds of
 * idleness, which is exactly why the key lives in the offscreen document (ADR-023 §2.2).
 * Its only job is the one the document cannot do, listening to `chrome.idle`.
 *
 * CHROME ONLY. Firefox never reports the `locked` state, so there is nothing to listen to
 * and its build has no worker at all (ADR-025 §2.3).
 */

const channel = new BroadcastChannel(CUSTODY_CHANNEL)

chrome.idle.onStateChanged.addListener((state) => onIdleStateChanged(state, (message) => channel.postMessage(message)))
