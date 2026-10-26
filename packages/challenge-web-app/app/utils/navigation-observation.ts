import type { RouteLocationNormalized, Router } from 'vue-router';

export type DeviceType = 'pc' | 'mobile';
export interface NavigationObservation {
   version: 1;
   kind: 'entry' | 'navigation';
   from: string;
   to: string;
   device: DeviceType;
   referrer_origin?: string;
}

interface DeviceNavigator {
   userAgent: string;
   platform?: string;
   maxTouchPoints?: number;
   userAgentData?: { mobile: boolean };
}

export function detectDevice(navigator: DeviceNavigator): DeviceType {
   if (navigator.userAgentData?.mobile
      || /Android|iPhone|iPad|iPod|Mobile|Tablet|Windows Phone/i.test(navigator.userAgent)
      || (/MacIntel|Macintosh/i.test(navigator.platform ?? navigator.userAgent) && (navigator.maxTouchPoints ?? 0) > 1)) {
      return 'mobile';
   }
   return 'pc';
}

export function routeTemplate(route: Pick<RouteLocationNormalized, 'matched' | 'params'>): string {
   const record = route.matched.at(-1);
   if (!record) return 'unknown';
   const path = (record.aliasOf ?? record).path;
   if (path === '/challenge/:path(.*)*') {
      const mode = Array.isArray(route.params.path) ? route.params.path[0] : String(route.params.path ?? '').split('/')[0];
      return mode === 'editor' ? '/challenge/editor/:id' : '/challenge/record/:id';
   }
   return path.replace(/\([^)]*\)[?*+]?/g, '').replace(/(:\w+)[?*+]/g, '$1').replace(/\/$/, '') || '/';
}

export function createNavigationTracker(
   router: Pick<Router, 'currentRoute' | 'afterEach' | 'resolve'>,
   options: { origin: string; referrer: string; device: DeviceType; send: (event: NavigationObservation) => void },
) {
   let started = false;
   let lastPath = '';
   function send(event: NavigationObservation) {
      try { options.send(event); } catch {}
   }
   function entrySource(): { from: string; referrer_origin?: string } {
      if (!options.referrer) return { from: 'direct' };
      try {
         const url = new URL(options.referrer);
         if (!['http:', 'https:'].includes(url.protocol)) return { from: 'unknown' };
         if (url.origin !== options.origin) return { from: 'external', referrer_origin: url.origin };
         return { from: routeTemplate(router.resolve(url.pathname)) };
      } catch {
         return { from: 'unknown' };
      }
   }
   const removeHook = router.afterEach((to, from, failure) => {
      if (!started || failure || to.path === lastPath) return;
      lastPath = to.path;
      send({ version: 1, kind: 'navigation', from: routeTemplate(from), to: routeTemplate(to), device: options.device });
   });
   return {
      start() {
         if (started) return;
         started = true;
         const route = router.currentRoute.value;
         lastPath = route.path;
         send({ version: 1, kind: 'entry', ...entrySource(), to: routeTemplate(route), device: options.device });
      },
      stop() {
         started = false;
         removeHook();
      },
   };
}
