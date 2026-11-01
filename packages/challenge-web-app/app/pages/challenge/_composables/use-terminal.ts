import type { WebContainerProcess } from '@webcontainer/api';
import type { Terminal } from 'xterm';
import type { ITheme } from 'xterm';
import type { FitAddon } from 'xterm-addon-fit';

type TerminalReadyCallback = (terminal: Terminal, fitAddon: FitAddon) => void;

export interface IUseTerminalOptions {
   containerKey?: string;
   containerElement?: HTMLElement;
   theme?: ITheme;
}

export const useTerminal = (options?: IUseTerminalOptions) => {
   const containerKey = options?.containerKey ?? 'terminal-container';
   const container = options?.containerElement
      ? ref(options.containerElement)
      : useTemplateRef<HTMLElement>(containerKey);

   let terminalInstance: Terminal | null = null;
   let fitAddonInstance: FitAddon | null = null;

   const terminalReadyCallbacks = new Set<TerminalReadyCallback>();
   const onTerminalReady = (callback: TerminalReadyCallback) => {
      if (terminalInstance && fitAddonInstance) {
         return callback(terminalInstance, fitAddonInstance);
      }
      terminalReadyCallbacks.add(callback);
   };

   const getInstance = () => {
      return new Promise<{
         terminal: Terminal;
         fitAddon: FitAddon;
      }>((resolve) => {
         onTerminalReady((terminal, fitAddon) => {
            resolve({ terminal, fitAddon });
         });
      });
   };

   const initializeTerminal = async () => {
      if (terminalInstance) {
         return; // 已经初始化过了
      }

      if (!container.value) {
         throw new Error('Terminal container not found');
      }

      const [{ Terminal }, { FitAddon }] = await Promise.all([
         import('xterm'),
         import('xterm-addon-fit'),
         import('xterm/css/xterm.css'),
      ]);

      terminalInstance = new Terminal({
         convertEol: true,
         fontSize: 12,
         fontFamily: 'monospace',
         ...(options?.theme ? { theme: options.theme } : {}),
      });
      fitAddonInstance = new FitAddon();

      terminalInstance.open(container.value);
      terminalInstance.loadAddon(fitAddonInstance);
      fitAddonInstance.fit();

      terminalReadyCallbacks.forEach((callback) =>
         callback(terminalInstance!, fitAddonInstance!)
      );
      terminalReadyCallbacks.clear();
   };

   const attachProcess = async (
      process: WebContainerProcess
   ): Promise<{
      writer: WritableStreamDefaultWriter<string>;
      chunk: globalThis.Ref<string | undefined, string | undefined>;
   }> => {
      const { terminal } = await getInstance();
      const writer = process.input.getWriter();
      const currentChunk = ref<string>();
      // terminal.clear();

      const dataListener = terminal.onData((data) => {
         writer.write(data);
      });

      process.output.pipeTo(
         new WritableStream({
            write(chunk) {
               currentChunk.value = chunk;
               terminal.write(chunk);
            },
         })
      );

      process.exit.then(() => {
         dataListener.dispose();
         writer.close();
      });

      return {
         writer,
         chunk: currentChunk,
      };
   };

   onMounted(async () => {
      await initializeTerminal();
   });

   return {
      containerKey,
      onTerminalReady,
      getInstance,
      initializeTerminal,
      container,
      attachProcess,
   };
};
