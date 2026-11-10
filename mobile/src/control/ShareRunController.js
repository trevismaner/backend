import { Share } from 'react-native';
import { shareMessage } from '../utils/routeShare.js';

/**
 * Shares a run as a picture of it, falling back to text.
 *
 * This used to be one line — `Share.share({ message: 'I just ran 5.2km on Run League! 🏃' })`
 * — which shared the distance and nothing else: no route, no time, no pace, no date. The run
 * had been drawn on a map on the same screen and none of it reached the share sheet.
 *
 * WHY THE CAPTURE IS PASSED IN RATHER THAN DONE HERE
 * Capturing a view needs a ref to that view, and a ref belongs to the screen that rendered
 * it. Taking one here would put a React view handle inside a controller, which is the
 * boundary's job in this project's BCE split, and would make this function impossible to
 * test without mounting a component. So the boundary passes `capture`, an async function
 * returning a file URI, and this decides what to do with the result.
 *
 * WHY EVERY STEP CAN FAIL WITHOUT THE SHARE FAILING
 * There are four ways the image route can fall over, and all of them are ordinary rather
 * than exceptional: the device has no sharing UI for files, the map snapshot needs a Maps
 * key that may be rejected, the capture itself returns nothing on some Android versions, and
 * a run may have no GPS route at all. None of those should stop someone sharing a run, so
 * each one falls through to the text share that always worked.
 */

const ok = (data) => ({ success: true, field: null, message: '', data });
const failed = (message) => ({ success: false, field: null, message });

/** Text-only share. Also the fallback for every failure below. */
async function shareText(run) {
  await Share.share({ message: shareMessage(run) });
  return ok({ shared: 'text' });
}

async function shareRunController(run, { capture } = {}) {
  try {
    if (typeof capture !== 'function') return shareText(run);

    // Imported here rather than at module scope. expo-sharing is a native module, and a
    // static import would make every screen that imports this controller fail to load in an
    // environment that does not have it — the test harness among them.
    let Sharing;
    try {
      Sharing = await import('expo-sharing');
    } catch {
      return shareText(run);
    }

    const available = await Sharing.isAvailableAsync?.().catch(() => false);
    if (!available) return shareText(run);

    const uri = await capture();
    if (!uri) return shareText(run);

    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      dialogTitle: 'Share your run',   // Android's chooser title; iOS ignores it
      UTI: 'public.png',
    });

    return ok({ shared: 'image', uri });
  } catch (err) {
    // A share the person cancelled throws on some platforms, and that is not an error worth
    // putting in front of them. Anything else gets one more go as text before it is reported.
    try {
      return await shareText(run);
    } catch {
      return failed(err?.message ?? 'Could not share this run.');
    }
  }
}

export default shareRunController;
