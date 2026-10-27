import Connection from '../entities/Connection.js';
import { getProvider } from './oauthProviders.js';
import { exchangeCodeForTokens } from './OAuthService.js';
import { pkceStore } from './StartConnectionController.js';

/**
 * RU-16 / RU-49 step 2: the provider sends the user back here.
 *
 * This runs in the user's BROWSER, not the app, so it cannot rely on the app's JWT —
 * the `state` created in step 1 is what identifies the user, and it is single-use.
 * The response is a small HTML page because a browser is what renders it.
 */
function page(title, message, ok) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#000;color:#fff;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
.card{max-width:22rem;padding:2rem}h1{font-size:1.25rem;margin:0 0 .75rem;color:${ok ? '#34C759' : '#FF453A'}}
p{color:#A2A9AD;line-height:1.5;font-size:.9rem;margin:0}
</style></head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

async function connectionCallback(req, res) {
  const { code, state, error: providerError } = req.query;

  try {
    // The user pressed "Deny", or the provider refused.
    if (providerError) {
      return res.status(200).send(page('Not connected',
        'You cancelled, or the service refused the request. Nothing has been linked to your account.', false));
    }
    if (!code || !state) {
      return res.status(400).send(page('Something went wrong',
        'That link is missing information. Start again from the app.', false));
    }

    const pending = await Connection.consumeState(state);
    if (!pending) {
      return res.status(400).send(page('This link has expired',
        'Connection links are valid for a few minutes and can only be used once. Start again from the app.', false));
    }
    if (pending.provider !== req.params.provider) {
      return res.status(400).send(page('Something went wrong', 'That link does not match the service it came from.', false));
    }

    const provider = getProvider(pending.provider);
    const verifier = pkceStore.get(state);
    pkceStore.delete(state);

    const exchange = await exchangeCodeForTokens(pending.provider, { code, codeVerifier: verifier });
    if (!exchange.ok) {
      console.error('Token exchange failed:', pending.provider, exchange.error);
      return res.status(502).send(page('Could not finish connecting',
        `${provider.label} did not accept the request. Please try again.`, false));
    }

    await Connection.save({
      userId: pending.user_id,
      provider: pending.provider,
      kind: pending.kind,
      ...exchange.tokens,
    });

    return res.status(200).send(page(`${provider.label} connected`,
      'You can close this window and return to Run League.', true));
  } catch (err) {
    console.error('Connection callback error:', err);
    return res.status(500).send(page('Something went wrong',
      'We could not finish connecting that account. Please try again.', false));
  }
}

export default connectionCallback;
