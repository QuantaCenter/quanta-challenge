import * as Sentry from '@sentry/nuxt';
import { createNavigationTracker, detectDevice } from '~/utils/navigation-observation';

export default defineNuxtPlugin({
   name: 'navigation-observation',
   dependsOn: ['sentry-client-config'],
   setup(nuxtApp) {
      if (!Sentry.getClient()) return;
      const device = detectDevice(navigator);
      Sentry.setTag('device_type', device);
      const tracker = createNavigationTracker(useRouter(), {
         origin: window.location.origin,
         referrer: document.referrer,
         device,
         send(navigation) {
            Sentry.captureEvent({
               message: 'observation.navigation',
               level: 'info',
               contexts: { navigation: { ...navigation } },
               tags: { device_type: device },
            });
         },
      });
      nuxtApp.hook('app:mounted', () => tracker.start());
      if (import.meta.hot) import.meta.hot.dispose(() => tracker.stop());
   },
});
