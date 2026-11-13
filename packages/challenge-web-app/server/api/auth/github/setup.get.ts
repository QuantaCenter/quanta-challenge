import { defineEventHandler, getCookie, getQuery, sendRedirect, setHeader } from 'h3';
import { verifyToken } from '../../../utils/jwt';
import { consumeState, returnPath } from '../../../services/github/accounts';

export default defineEventHandler(async event => {
   setHeader(event, 'cache-control', 'no-store');
   setHeader(event, 'referrer-policy', 'no-referrer');
   try {
      const user = verifyToken(getCookie(event, 'quanta_access_token') || '');
      const state = await consumeState(event, getQuery(event).state, user.userId, true);
      // Never grant access based on installation_id or setup_action query parameters.
      return sendRedirect(event, returnPath(state.target), 303);
   } catch { return sendRedirect(event, '/app/settings/security?github=setup', 303); }
});
