import { Hono } from 'hono';
import { loadEnv } from '../middlewares/env';
import taskRoute from './task';
import codeRoute from './code';
import cacheRoute from './cache';
import { globalExpectionFilter } from '../filters/gloabl-expection-filter';

const app = new Hono();

app.use('*', loadEnv());

app.onError(globalExpectionFilter);

app.route('/task', taskRoute);
app.route('/code', codeRoute);
app.route('/cache', cacheRoute);

app.get('/health', (c) => {
   return c.json({ status: 'ok' });
});

export default app;
