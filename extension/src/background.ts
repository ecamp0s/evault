import { CUSTODY_CHANNEL } from './custody/protocol'
import { onIdleStateChanged } from './systemLock'

/**
 * The service worker. It holds nothing: Manifest V3 stops it after thirty seconds of
 * idleness, which is exactly why the key lives in the offscreen document (ADR-023 §2.2).
 * Its only job is the one the document cannot do, listening to `chrome.idle`.
 */

const channel = new BroadcastChannel(CUSTODY_CHANNEL)

chrome.idle.onStateChanged.addListener((state) => onIdleStateChanged(state, (message) => channel.postMessage(message)))
