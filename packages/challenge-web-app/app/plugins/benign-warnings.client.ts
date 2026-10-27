const BENIGN_WARNINGS = [
   'Component inside <Transition> renders non-element root node that cannot be animated.',
];

export default defineNuxtPlugin({
   name: 'benign-warnings',
   setup(nuxtApp) {
      nuxtApp.vueApp.config.warnHandler = (msg, _instance, trace) => {
         if (BENIGN_WARNINGS.some((w) => msg.includes(w))) return;
         console.warn(`[Vue warn]: ${msg}${trace}`);
      };
   },
});
