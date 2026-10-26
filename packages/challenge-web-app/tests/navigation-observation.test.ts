import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createNavigationTracker, detectDevice, routeTemplate } from '../app/utils/navigation-observation.ts';
import type { NavigationObservation } from '../app/utils/navigation-observation.ts';

function router() {
   return createRouter({ history: createMemoryHistory(), routes: [
      { path: '/', redirect: '/app/dashboard' },
      { path: '/app/dashboard', component: {} },
      { path: '/app/problems', component: {}, alias: '/problems' },
      { path: '/app/space/:id', component: {} },
      { path: '/challenge/:path(.*)*', component: {} },
      { path: '/blocked', component: {}, beforeEnter: () => false },
   ] });
}

test('device detection distinguishes desktop and mobile including tablets/desktop-mode iPad', () => {
   for (const userAgent of ['Windows NT 10.0', 'Macintosh; Intel Mac OS X', 'X11; Linux x86_64'])
      assert.equal(detectDevice({ userAgent }), 'pc');
   for (const userAgent of ['iPhone', 'Android', 'iPad', 'Tablet', 'Windows Phone'])
      assert.equal(detectDevice({ userAgent }), 'mobile');
   assert.equal(detectDevice({ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 }), 'mobile');
   assert.equal(detectDevice({ userAgent: 'desktop', userAgentData: { mobile: true } }), 'mobile');
   assert.equal(detectDevice({ userAgent: 'Windows NT', maxTouchPoints: 10 }), 'pc');
});

test('route templates hide dynamic usernames/IDs and canonicalize aliases', () => {
   const r = router();
   assert.equal(routeTemplate(r.resolve('/app/space/private-user?token=secret#details')), '/app/space/:id');
   assert.equal(routeTemplate(r.resolve('/problems')), '/app/problems');
   assert.equal(routeTemplate(r.resolve('/challenge/editor/123')), '/challenge/editor/:id');
   assert.equal(routeTemplate(r.resolve('/challenge/record/456?id=789')), '/challenge/record/:id');
   assert.equal(routeTemplate(r.resolve('/missing-private-id')), 'unknown');
});

test('first hydrated page is reported once and successful navigation includes from/to', async () => {
   const r = router();
   const events: NavigationObservation[] = [];
   const tracker = createNavigationTracker(r, { origin: 'https://app.test', referrer: '', device: 'pc', send: event => events.push(event) });
   await r.push('/');
   assert.equal(events.length, 0);
   tracker.start();
   tracker.start();
   assert.deepEqual(events, [{ version: 1, kind: 'entry', from: 'direct', to: '/app/dashboard', device: 'pc' }]);
   await r.push('/app/problems');
   assert.deepEqual(events[1], { version: 1, kind: 'navigation', from: '/app/dashboard', to: '/app/problems', device: 'pc' });
   await r.push('/app/problems?search=secret#details');
   await r.push('/blocked');
   await r.push('/app/problems?search=secret#details');
   assert.equal(events.length, 2);
   tracker.stop();
   await r.push('/app/dashboard');
   assert.equal(events.length, 2);
});

test('different dynamic IDs count as distinct visits with the same safe template', async () => {
   const r = router();
   await r.push('/app/space/alice');
   const events: NavigationObservation[] = [];
   const tracker = createNavigationTracker(r, { origin: 'https://app.test', referrer: '', device: 'mobile', send: event => events.push(event) });
   tracker.start();
   await r.push('/app/space/bob');
   assert.equal(events.length, 2);
   assert.equal(events[1].from, '/app/space/:id');
   assert.equal(events[1].to, '/app/space/:id');
   assert.ok(!JSON.stringify(events).includes('alice') && !JSON.stringify(events).includes('bob'));
   tracker.stop();
});

test('entry referrer strips credentials, query/hash and normalizes internal source routes', async () => {
   const r = router();
   await r.push('/app/dashboard');
   for (const [referrer, source] of [
      ['https://user:pass@outside.test/path?token=secret#fragment', { from: 'external', referrer_origin: 'https://outside.test' }],
      ['https://app.test/app/space/private-user?token=secret', { from: '/app/space/:id' }],
      ['javascript:secret', { from: 'unknown' }],
      ['not a URL', { from: 'unknown' }],
   ] as const) {
      const events: NavigationObservation[] = [];
      const tracker = createNavigationTracker(r, { origin: 'https://app.test', referrer, device: 'mobile', send: event => events.push(event) });
      tracker.start();
      assert.deepEqual(events[0], { version: 1, kind: 'entry', ...source, to: '/app/dashboard', device: 'mobile' });
      tracker.stop();
   }
});

test('reporting failures never break routing', async () => {
   const r = router();
   await r.push('/app/dashboard');
   const tracker = createNavigationTracker(r, { origin: 'https://app.test', referrer: '', device: 'pc', send: () => { throw new Error('offline'); } });
   assert.doesNotThrow(() => tracker.start());
   await r.push('/app/problems');
   assert.equal(r.currentRoute.value.path, '/app/problems');
   tracker.stop();
});

test('browser-style back/forward navigations report their actual source and destination', async () => {
   const r = router();
   await r.push('/app/dashboard');
   const events: NavigationObservation[] = [];
   const tracker = createNavigationTracker(r, { origin: 'https://app.test', referrer: '', device: 'pc', send: event => events.push(event) });
   tracker.start();
   await r.push('/app/problems');
   const back = new Promise<void>(resolve => {
      const remove = r.afterEach(() => { remove(); resolve(); });
      r.back();
   });
   await back;
   assert.equal(events[2].from, '/app/problems');
   assert.equal(events[2].to, '/app/dashboard');
   const forward = new Promise<void>(resolve => {
      const remove = r.afterEach(() => { remove(); resolve(); });
      r.forward();
   });
   await forward;
   assert.equal(events[3].from, '/app/dashboard');
   assert.equal(events[3].to, '/app/problems');
   tracker.stop();
});
