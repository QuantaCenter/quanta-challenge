import {
   createPopper,
   type ModifierArguments,
   type Options,
} from '@popperjs/core';
import { logger } from '~~/lib/logger';

type Modifier = Options['modifiers'][number];

export interface IUsePopperOptions {
   containerKey?: string;
   popperKey?: string;
   fillWidth?: boolean;
   options?: Partial<Options>;
}

const phases: Modifier['phase'][] = [
   'afterMain',
   'afterRead',
   'afterWrite',
   'beforeMain',
   'beforeRead',
   'beforeWrite',
   'main',
   'read',
   'write',
];

export const usePopper = (options?: IUsePopperOptions) => {
   // use-template ref keys
   const containerKey = options?.containerKey ?? 'popper-container';
   const popperKey = options?.popperKey ?? 'popper-instance';

   // template refs
   const container = useTemplateRef<HTMLElement | null>(containerKey);
   const popper = useTemplateRef<HTMLElement | null>(popperKey);
   const popperInstance = ref<ReturnType<typeof createPopper> | null>(null);

   // popper 更新监听器
   const watchersMap = new Map<Modifier['phase'], Set<Modifier['fn']>>();
   const onPopperUpdate = (phase: Modifier['phase'], fn: Modifier['fn']) => {
      !watchersMap.has(phase) && watchersMap.set(phase, new Set());
      watchersMap.get(phase)?.add(fn);
   };
   const watchers: Modifier[] = phases.map((phase) => ({
      name: `watcher-${phase}`,
      phase: phase,
      enabled: true,
      fn: (args: ModifierArguments<any>) => {
         const phaseWatchers = watchersMap.get(phase);
         if (phaseWatchers) {
            phaseWatchers.forEach((fn) => fn && fn(args));
         }
      },
   }));

   // first update 监听器
   const firstUpdateWatchers = new Set<Options['onFirstUpdate']>();
   const onFirstUpdate = (fn: Options['onFirstUpdate']) => {
      !firstUpdateWatchers.has(fn) && firstUpdateWatchers.add(fn);
   };

   const createInstance = () => {
      if (!container.value || !popper.value) return false;
      if (typeof options?.fillWidth === 'undefined' || options.fillWidth) {
         const containerWidth = container.value.getBoundingClientRect().width;
         popper.value.style.width = `${containerWidth}px`;
      }
      popperInstance.value = createPopper(container.value, popper.value, {
         placement: 'bottom-start',
         ...options?.options,
         modifiers: [
            { name: 'offset', options: { offset: [0, 8] } },
            { name: 'preventOverflow', options: { padding: 8 } },
            ...watchers,
         ].concat(options?.options?.modifiers || []),
         onFirstUpdate(arg0) {
            firstUpdateWatchers.forEach((fn) => fn && fn(arg0));
         },
      });
      return true;
   };

   // 挂载创建 Popper 实例
   onMounted(() => {
      if (createInstance()) return;
      const stop = watch([container, popper], () => {
         if (createInstance()) stop();
      });
   });

   // 销毁 Popper 实例
   onUnmounted(() => {
      popperInstance.value && popperInstance.value.destroy();
   });

   return {
      popperInstance,
      containerKey,
      container,
      popper,
      popperKey,
      onPopperUpdate,
      onFirstUpdate,
   };
};
