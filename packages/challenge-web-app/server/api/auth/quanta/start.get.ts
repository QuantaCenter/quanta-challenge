import { opaque } from '../../../services/quanta-oauth/core';
import { authorization } from '../../../services/quanta-oauth/provider';
import { browser, ephemeral, guarded, limit } from '../../../services/quanta-oauth/http';

export default defineEventHandler(event => guarded(event, async () => {
   await limit(event, 'start', 60);
   const binding = browser(event, true);
   const verifier = opaque(), nonce = opaque();
   const state = await ephemeral().issue('state', { verifier, nonce }, binding, 600);
   return sendRedirect(event, (await authorization(state.token, verifier, nonce)).href, 302);
}, true));
