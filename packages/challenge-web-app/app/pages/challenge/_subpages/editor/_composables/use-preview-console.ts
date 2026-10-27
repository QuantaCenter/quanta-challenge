import {
   PREVIEW_CONSOLE_CHANNEL,
   type IPreviewConsoleEnvelope,
   type PreviewConsoleIncoming,
   type PreviewConsoleLevel,
   type PreviewConsoleOutgoing,
   type PreviewConsoleValue,
} from '../../../_composables/use-web-container/preview-console';

export interface IPreviewConsoleEntry {
   id: number;
   kind: 'log' | 'input' | 'result';
   level: PreviewConsoleLevel;
   args: PreviewConsoleValue[];
   code?: string;
   stack?: string;
   repeat: number;
}

const MAX_ENTRIES = 1000;

export interface IUsePreviewConsoleOptions {
   getTarget: () => Window | null | undefined;
}

export const usePreviewConsole = (options: IUsePreviewConsoleOptions) => {
   const entries = shallowRef<IPreviewConsoleEntry[]>([]);
   const ready = ref(false);
   let targetOrigin: string | undefined;
   let nextId = 0;
   let lastSignature = '';

   const push = (entry: Omit<IPreviewConsoleEntry, 'id' | 'repeat'>) => {
      const signature =
         entry.kind === 'log' ? JSON.stringify([entry.level, entry.args, entry.stack]) : '';
      const last = entries.value.at(-1);
      if (signature && last && signature === lastSignature) {
         entries.value = [
            ...entries.value.slice(0, -1),
            { ...last, repeat: last.repeat + 1 },
         ];
         return;
      }
      lastSignature = signature;
      const next = [...entries.value, { ...entry, id: nextId++, repeat: 1 }];
      entries.value =
         next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
   };

   const clear = () => {
      entries.value = [];
      lastSignature = '';
   };

   const handleMessage = (event: MessageEvent) => {
      const target = options.getTarget();
      if (!target || event.source !== target) return;
      const data = event.data as IPreviewConsoleEnvelope<PreviewConsoleOutgoing>;
      if (data?.channel !== PREVIEW_CONSOLE_CHANNEL || !data.payload) return;
      const message = data.payload;

      switch (message.type) {
         case 'ready':
            targetOrigin = event.origin;
            ready.value = true;
            clear();
            break;
         case 'clear':
            clear();
            break;
         case 'log':
            push({
               kind: 'log',
               level: message.level,
               args: message.args,
               stack: message.stack,
            });
            break;
         case 'result':
            push({
               kind: 'result',
               level: message.error ? 'error' : 'log',
               args: [message.value],
            });
            break;
      }
   };

   useEventListener(window, 'message', handleMessage);

   const execute = (code: string) => {
      const target = options.getTarget();
      if (!code.trim() || !target || !targetOrigin) return false;
      const id = nextId;
      push({ kind: 'input', level: 'log', args: [], code });
      const envelope: IPreviewConsoleEnvelope<PreviewConsoleIncoming> = {
         channel: PREVIEW_CONSOLE_CHANNEL,
         payload: { type: 'eval', id, code },
      };
      target.postMessage(envelope, targetOrigin);
      return true;
   };

   const reset = () => {
      ready.value = false;
      targetOrigin = undefined;
   };

   const counts = computed(() => {
      let errors = 0;
      let warnings = 0;
      for (const entry of entries.value) {
         if (entry.kind === 'input') continue;
         if (entry.level === 'error') errors += entry.repeat;
         else if (entry.level === 'warn') warnings += entry.repeat;
      }
      return { errors, warnings };
   });

   return { entries, ready, counts, execute, clear, reset };
};
