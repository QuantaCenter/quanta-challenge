import type { Component, VNode } from 'vue';

export interface DialogButton {
   label: string;
   variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
   onClick?: () => void | Promise<void>;
}

export interface BaseDialogOptions {
   title?: string;
   description?: string;
   content?: string | Component | (() => VNode);
   cancelable?: boolean;
   onCancel?: () => void;
}

export interface ConfirmDialogOptions extends BaseDialogOptions {
   confirmText?: string;
   cancelText?: string;
   variant?: 'default' | 'danger';
   onConfirm?: () => void | Promise<void>;
}

export interface PromptDialogOptions extends BaseDialogOptions {
   placeholder?: string;
   defaultValue?: string;
   inputType?: 'text' | 'password';
   /** 多行 textarea */
   multiline?: boolean;
   maxLength?: number;
   validator?: (value: string) => boolean | string;
   confirmText?: string;
   cancelText?: string;
   onConfirm?: (value: string) => void | Promise<void>;
}

export interface CustomDialogOptions extends BaseDialogOptions {
   buttons?: DialogButton[];
   closeOnClickOutside?: boolean;
}

interface DialogState {
   id: string;
   type: 'confirm' | 'prompt' | 'custom';
   options: BaseDialogOptions;
   resolve: (value: any) => void;
   reject: (reason?: any) => void;
}

class DialogManager {
   private dialogs = ref<DialogState[]>([]);
   private idCounter = 0;

   private isServer() {
      return typeof window === 'undefined';
   }

   private generateId(): string {
      return `dialog-${++this.idCounter}-${Date.now()}`;
   }

   private createDialog<T>(
      type: DialogState['type'],
      options: BaseDialogOptions
   ): Promise<T> {
      // 服务端渲染时的冷处理
      if (this.isServer()) {
         console.warn(
            '[DialogManager] Dialog API called on server side, returning default value'
         );
         // 根据类型返回合理的默认值
         if (type === 'confirm') return Promise.resolve(false as T);
         if (type === 'prompt') return Promise.resolve('' as T);
         return Promise.resolve(null as T);
      }

      return new Promise<T>((resolve, reject) => {
         const id = this.generateId();
         const state: DialogState = {
            id,
            type,
            options,
            resolve,
            reject,
         };

         this.dialogs.value.push(state);
      });
   }

   /**
    * 显示确认对话框
    * @returns Promise<boolean> - true 表示确认，false 表示取消
    * @example
    * const confirmed = await dialog.confirm({
    *   title: '删除确认',
    *   description: '确定要删除这个文件吗？',
    *   variant: 'danger'
    * });
    */
   confirm(options: ConfirmDialogOptions): Promise<boolean> {
      return this.createDialog<boolean>('confirm', options);
   }

   /**
    * 显示输入对话框
    * @returns Promise<string | null> - 用户输入的值，取消返回 null
    * @example
    * const filename = await dialog.prompt({
    *   title: '新建文件',
    *   placeholder: '请输入文件名',
    *   defaultValue: 'untitled.txt',
    *   validator: (value) => value.length > 0 || '文件名不能为空'
    * });
    */
   prompt(options: PromptDialogOptions): Promise<string | null> {
      return this.createDialog<string | null>('prompt', options);
   }

   /**
    * 显示自定义对话框
    * @returns Promise<string | null> - 返回点击的按钮的 label，取消返回 null
    * @example
    * const result = await dialog.custom({
    *   title: '选择操作',
    *   buttons: [
    *     { label: '保存', variant: 'primary' },
    *     { label: '放弃', variant: 'danger' },
    *     { label: '取消', variant: 'ghost' }
    *   ]
    * });
    */
   custom(options: CustomDialogOptions): Promise<string | null> {
      return this.createDialog<string | null>('custom', options);
   }

   /**
    * 关闭指定对话框
    * @internal
    */
   close(id: string, value?: any) {
      const index = this.dialogs.value.findIndex((d) => d.id === id);
      if (index !== -1) {
         const dialog = this.dialogs.value[index];
         dialog?.resolve(value);
         this.dialogs.value.splice(index, 1);
      }
   }

   /**
    * 取消指定对话框
    * @internal
    */
   cancel(id: string, reason?: any) {
      const index = this.dialogs.value.findIndex((d) => d.id === id);
      if (index !== -1) {
         const dialog = this.dialogs.value[index];
         dialog?.options.onCancel?.();
         dialog?.resolve(
            dialog.type === 'confirm'
               ? false
               : dialog.type === 'prompt'
               ? null
               : undefined
         );
         this.dialogs.value.splice(index, 1);
      }
   }

   /**
    * 获取所有对话框状态
    * @internal
    */
   getDialogs() {
      return this.dialogs;
   }

   /**
    * 关闭所有对话框
    */
   closeAll() {
      this.dialogs.value.forEach((dialog) => {
         dialog.resolve(
            dialog.type === 'confirm'
               ? false
               : dialog.type === 'prompt'
               ? null
               : undefined
         );
      });
      this.dialogs.value = [];
   }
}

// 创建单例
const dialogManager = new DialogManager();

/**
 * 对话框 API
 * 提供 confirm, prompt, custom 等方法
 * 可在任何地方使用，无需依赖 setup 上下文
 */
export const dialog = {
   confirm: dialogManager.confirm.bind(dialogManager),
   prompt: dialogManager.prompt.bind(dialogManager),
   custom: dialogManager.custom.bind(dialogManager),
   closeAll: dialogManager.closeAll.bind(dialogManager),
};

/**
 * 在组件中使用对话框管理器
 * @internal 仅供 DialogOverlay 组件使用
 */
export function useDialogManager() {
   return {
      dialogs: dialogManager.getDialogs(),
      close: dialogManager.close.bind(dialogManager),
      cancel: dialogManager.cancel.bind(dialogManager),
   };
}
