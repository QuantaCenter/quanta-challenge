export interface GlobalImageOpenOptions {
   source?: HTMLElement | null;
   alt?: string;
}

export interface GlobalImageState {
   open: boolean;
   closing: boolean;
   src: string;
   alt: string;
   source: HTMLElement | null;
   /** 递增序号，用于丢弃过期的异步加载结果 */
   seq: number;
}

class GlobalImageManager {
   private state = ref<GlobalImageState>({
      open: false,
      closing: false,
      src: '',
      alt: '',
      source: null,
      seq: 0,
   });

   private isServer() {
      return typeof window === 'undefined';
   }

   open(src: string, options: GlobalImageOpenOptions = {}) {
      if (this.isServer()) {
         console.warn(
            '[GlobalImage] globalImage.open called on server side, ignored'
         );
         return;
      }
      if (!src) return;

      this.state.value = {
         open: true,
         closing: false,
         src,
         alt: options.alt ?? '',
         source: options.source ?? null,
         seq: this.state.value.seq + 1,
      };
   }

   close() {
      if (!this.state.value.open || this.state.value.closing) return;
      this.state.value.closing = true;
   }

   finalizeClose() {
      this.state.value = {
         open: false,
         closing: false,
         src: '',
         alt: '',
         source: null,
         seq: this.state.value.seq + 1,
      };
   }

   isOpen() {
      return this.state.value.open;
   }

   getState() {
      return this.state;
   }
}

// 全局单例
const globalImageManager = new GlobalImageManager();

export const globalImage = {
   open: globalImageManager.open.bind(globalImageManager),
   close: globalImageManager.close.bind(globalImageManager),
   isOpen: globalImageManager.isOpen.bind(globalImageManager),
};

export function useGlobalImage() {
   return {
      open: globalImageManager.open.bind(globalImageManager),
      close: globalImageManager.close.bind(globalImageManager),
   };
}

export function useGlobalImageManager() {
   return {
      state: globalImageManager.getState(),
      finalizeClose: globalImageManager.finalizeClose.bind(globalImageManager),
   };
}
