import type { ISelectOption } from '~/components/st/Select/type';
import { useMessage } from '~/components/st/Message/use-message';
import type { IKvEditorHandle } from './use-request-kv-lists';

export type BodyMode = 'none' | 'json' | 'text';

export const BODY_OPTIONS: ISelectOption[] = [
   { label: '无', value: 'none' },
   { label: 'JSON', value: 'json' },
   { label: '文本', value: 'text' },
];

/** 请求体：类型 / 文本 / 美化压缩 / 真正发出去的内容 */
export const useRequestBody = (options: { getMethod: () => string }) => {
   const message = useMessage();

   const mode = ref<BodyMode>('none');
   const text = ref('');
   const editor = useTemplateRef<IKvEditorHandle>('body-editor');

   const label = computed(
      () => BODY_OPTIONS.find((item) => item.value === mode.value)!.label,
   );

   /** GET / HEAD 带 body 会被 undici 直接拒绝，这里也一并挡掉 */
   const allowed = computed(() => {
      const method = options.getMethod();
      return method !== 'GET' && method !== 'HEAD';
   });

   /** 编辑器不可编辑的情况：方法不带 body，或明确选了「无」 */
   const editorDisabled = computed(
      () => !allowed.value || mode.value === 'none',
   );

   const payload = computed<string | null>(() => {
      if (!allowed.value || mode.value === 'none') return null;
      return text.value ? text.value : null;
   });

   const read = () => editor.value?.getValue() ?? text.value;

   /** 真正发出去的请求体：取编辑器里的当前内容 */
   const currentPayload = () => {
      if (!allowed.value || mode.value === 'none') return null;
      return read() || null;
   };

   const write = (value: string) => {
      text.value = value;
      editor.value?.setValue(value);
   };

   /** 美化 / 压缩 只针对 JSON 请求体 */
   const transform = (label: string, run: (value: unknown) => string) => {
      try {
         write(run(JSON.parse(read().trim())));
      } catch (error) {
         message.error(
            'JSON 格式有误',
            `${label}失败：${error instanceof Error ? error.message : String(error)}`,
         );
      }
   };

   const beautify = () =>
      transform('美化', (value) => JSON.stringify(value, null, 2));

   const minify = () => transform('压缩', (value) => JSON.stringify(value));

   /** 内容类型由请求体类型推断，用户自己填了 Content-Type 就不覆盖 */
   const autoContentType = computed(() => {
      if (!payload.value) return null;
      return mode.value === 'json' ? 'application/json' : 'text/plain';
   });

   const reset = () => {
      mode.value = 'none';
      text.value = '';
   };

   return {
      mode,
      options: BODY_OPTIONS,
      label,
      text,
      editor,
      allowed,
      editorDisabled,
      payload,
      currentPayload,
      autoContentType,
      beautify,
      minify,
      write,
      read,
      reset,
   };
};
