import { defineEventHandler, getCookie, getQuery, sendRedirect, setHeader } from 'h3';
import { verifyToken } from '../../../utils/jwt';
import { bind, consumeState, exchange, requireSettings, returnPath } from '../../../services/github/accounts';

export default defineEventHandler(async event => {
   setHeader(event, 'cache-control', 'no-store');
   setHeader(event, 'referrer-policy', 'no-referrer');
   let target = '/app/settings/security';
   try {
      const user = verifyToken(getCookie(event, 'quanta_access_token') || '');
      const query = getQuery(event);
      const state = await consumeState(event, query.state, user.userId, false);
      target = returnPath(state.target);
      if (query.error || typeof query.code !== 'string') throw new Error('Denied');
      const config = requireSettings();
      const tokens = await exchange({ code: query.code, code_verifier: state.verifier, redirect_uri: `${config.origin}/api/auth/github/callback` });
      await bind(user.userId, tokens);
      return sendRedirect(event, `${target}${target.includes('?') ? '&' : '?'}github=connected`, 303);
   } catch {
      return sendRedirect(event, `${target}${target.includes('?') ? '&' : '?'}github=failed`, 303);
   }
});
