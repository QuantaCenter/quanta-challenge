<script setup lang="ts">
import { useTerminal } from '../../../_composables/use-terminal';
import Tab from '../_components/Tab.vue';
import { DeleteFour, Plus, Down, Up } from '@icon-park/vue-next';
import type { WebContainerProcess } from '~/utils/vivari-runtime';
import TabSkeleton from '../_skeletons/TabSkeleton.vue';
import type { IPanelMethods } from '~/components/st/SplitPanel/index.vue';

type UseTerminalInstance = ReturnType<typeof useTerminal>;

type Terminal = {
   id: string;
   currentProcess: WebContainerProcess;
   terminalInstance: UseTerminalInstance;
   name: string;
};

const terminals = ref<Array<Terminal>>([]);

const hasProcessReady = ref(false);

const terminalRefs = ref<Record<string, HTMLElement>>({});

const createTerminal = async (props?: {
   process?: WebContainerProcess;
   silence?: boolean;
   name?: string;
}) => {
   const { process, silence, name } = props ?? {};

   const id = `terminal-${Date.now()}`;
   terminals.value.push({ id, name: name ?? 'jsh' } as any);
   const terminal = terminals.value.find((t) => t.id === id)!;

   // 等待 DOM 更新，确保元素已经渲染
   await nextTick();

   // 等待一帧，确保 ref 已经绑定
   await new Promise((resolve) => requestAnimationFrame(resolve));

   // 手动获取 DOM 元素
   const containerElement = terminalRefs.value[id];
   if (!containerElement) {
      console.error('[ERROR] Terminal container not found for id:', id);
      throw new Error(`Terminal container not found for id: ${id}`);
   }

   const terminalInstance = useTerminal({
      containerKey: id,
      containerElement: containerElement,
   });

   terminalInstance.onTerminalReady((_, fitAddon) => {
      const debounceFit = useDebounceFn(() => {
         fitAddon.fit();
      }, 200);
      const resizeObserver = new ResizeObserver(debounceFit);
      resizeObserver.observe(containerElement);
   });

   terminal.terminalInstance = terminalInstance as any;
   terminal.currentProcess = process!;

   // 手动初始化 terminal
   await terminalInstance.initializeTerminal();

   let attachResult = null;
   if (process) {
      hasProcessReady.value = true;
      // attach process
      attachResult = await terminalInstance.attachProcess(process);
      process.exit.then(async (code) => {
         const { terminal } = await terminalInstance.getInstance();
         terminal.write(`\nProcess has exited with code ${code}.\n`);
      });
   }

   if (!silence) {
      currentTerminalId.value = id;
   }

   return { ...terminalInstance, attachResult, id };
};

const currentTerminalId = defineModel<string>('currentTerminalId', {
   default: '',
});

const writeTerminal = async (str: string, id?: string) => {
   const terminalId = id || currentTerminalId.value;
   const terminal = terminals.value.find((t) => t.id === terminalId);
   if (!terminal) {
      console.info('[ERROR]', `terminal ${terminalId} is not found`, {
         str,
         id,
      });
      return;
   }
   const instance = await terminal.terminalInstance.getInstance();
   instance.terminal.write(str);
};

const attachProcess = async (props: {
   process: WebContainerProcess;
   id?: string;
   name?: string;
}) => {
   const { process, id, name } = props;
   let terminalId = id || currentTerminalId.value;
   let terminal = terminals.value.find((t) => t.id === terminalId);
   if (!terminal) {
      const { attachResult } = await createTerminal({ process, name });
      return attachResult!;
   }
   terminal.name = name || terminal.name;
   hasProcessReady.value = true;
   return await terminal.terminalInstance.attachProcess(process);
};

const removeTerminal = async (id: string) => {
   const terminal = terminals.value.find((item) => item.id === id);
   if (!terminal) return;

   terminal.currentProcess.kill();

   const instance = await terminal.terminalInstance.getInstance();
   instance.terminal.dispose();

   terminals.value = terminals.value.filter((item) => item !== terminal);
   currentTerminalId.value = terminals.value[0]?.id ?? '';
};

const emits = defineEmits<{
   (e: 'addTerminal'): void;
}>();
const addTerminal = async () => {
   emits('addTerminal');
};

const props = defineProps<IPanelMethods>();

const folded = ref(false);
const toggleFold = () => {
   folded.value = !folded.value;

   if (folded.value) {
      props.storePanelState();
      props.resizeToFit();
      props.setPanelLockState(true);
   } else {
      props.restorePanelState();
      props.setPanelLockState(false);
   }
};

defineExpose({
   attachProcess,
   writeTerminal,
   createTerminal,
   toggleFold,
});
</script>

<template>
   <StSpace
      fill-x
      direction="vertical"
      gap="0"
      class="bg-[#181818] rounded-xl max-md:rounded-b-none"
      :class="{ 'h-full': !folded }">
      <StSpace
         fill-x
         class="p-1 rounded-t-xl bg-accent-600"
         :class="{ 'rounded-b-xl max-md:rounded-b-none': folded }"
         justify="between"
         align="center"
         gap="0">
         <StSpace
            fill-x
            class="h-[2.15rem] relative overflow-x-auto mini-scrollbar">
            <StSpace fill-x gap="0.5rem" class="absolute left-0 top-0 p-1">
               <StSkeleton :loading="!hasProcessReady">
                  <template #loading>
                     <TabSkeleton :count="2" />
                  </template>
                  <Tab
                     v-for="terminal in terminals"
                     :key="terminal.id"
                     :content="terminal.name"
                     :class="{
                        '!bg-secondary !text-background hover:!border-secondary':
                           currentTerminalId === terminal.id,
                        'bg-accent-500 text-accent-200 hover:border-secondary border border-transparent':
                           currentTerminalId !== terminal.id,
                     }"
                     @remove="removeTerminal(terminal.id)"
                     @click="currentTerminalId = terminal.id">
                     <template #remove-icon>
                        <DeleteFour />
                     </template>
                  </Tab>
                  <StSpace
                     @click="addTerminal"
                     class="p-[0.325rem] rounded-[0.375rem] bg-accent-500 hover:bg-accent-400 transition-colors text-accent-200 cursor-pointer">
                     <Plus />
                  </StSpace>
               </StSkeleton>
               <StSpace fill-x justify="end">
                  <StSpace
                     @click="toggleFold"
                     class="p-[0.325rem] rounded-[0.375rem] bg-accent-500 hover:bg-accent-400 transition-colors text-accent-200 cursor-pointer">
                     <Up v-if="folded" />
                     <Down v-else />
                  </StSpace>
               </StSpace>
            </StSpace>
         </StSpace>
      </StSpace>
      <StSpace v-show="!folded" fill class="relative overflow-hidden">
         <StSpace fill class="relative my-2 mx-3">
            <main
               v-for="terminal in terminals"
               :key="terminal.id"
               v-show="hasProcessReady && currentTerminalId === terminal.id"
               :ref="(el: any) => el && (terminalRefs[terminal.id] = el)"
               class="absolute left-0 top-0 w-full h-[calc(100%-1rem)]"></main>
         </StSpace>
      </StSpace>
   </StSpace>
</template>

<style lang="css">
.xterm-viewport {
   background: transparent !important;
}
</style>
