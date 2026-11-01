import type { WebContainer, WebContainerProcess } from '@webcontainer/api';
import {
   REQUEST_RUNNER_DESCRIPTOR_PATH,
   REQUEST_RUNNER_SCRIPT,
   REQUEST_RUNNER_SCRIPT_PATH,
   type IRequestRunnerDescriptor,
   type IRequestRunnerResult,
} from '../_utils/request-runner';
import { MAX_BODY_CHARS, type IResponseState } from '../_utils/response-format';

const REQUEST_TIMEOUT_MS = 30_000;

const readProcessOutput = async (process: WebContainerProcess) => {
   const reader = process.output.getReader();
   let text = '';
   let timedOut = false;
   const timer = setTimeout(() => {
      timedOut = true;
      process.kill();
   }, REQUEST_TIMEOUT_MS);

   try {
      for (;;) {
         const { done, value } = await reader.read();
         if (done) break;
         text += value;
      }
   } finally {
      clearTimeout(timer);
   }
   return { text, timedOut };
};

/**
 * 发请求（在 WebContainer 里跑一段 node 脚本）并保存响应状态。
 *
 * 请求内容由调用方通过 `buildDescriptor` 现场组装，所以这里不需要知道
 * 方法 / 路径 / 请求体是怎么来的。
 */
export const useRequestSend = (options: {
   buildDescriptor: () => IRequestRunnerDescriptor;
   getWcInstance: () => Promise<WebContainer>;
   writeFile: (path: string, content: string) => Promise<void>;
}) => {
   const sending = ref(false);
   const error = ref<string | null>(null);
   const response = ref<IResponseState | null>(null);
   const truncated = ref(false);

   const applyResult = (result: IRequestRunnerResult) => {
      if (!result.ok) {
         error.value = result.error;
         return;
      }

      const binary = atob(result.bodyBase64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const bodyText = new TextDecoder('utf-8').decode(bytes);

      truncated.value = bodyText.length > MAX_BODY_CHARS;
      response.value = {
         status: result.status,
         statusText: result.statusText,
         headers: result.headers,
         bodyText: truncated.value ? bodyText.slice(0, MAX_BODY_CHARS) : bodyText,
         // atob 的结果每个字符就是一个字节，长度即字节数
         byteLength: binary.length,
         durationMs: result.durationMs,
      };
   };

   const send = async () => {
      // StInput 的 $attrs 会同时落到外层和内部 input 上，回车可能触发两次。
      if (sending.value) return;

      sending.value = true;
      error.value = null;
      response.value = null;
      truncated.value = false;

      try {
         const descriptor = options.buildDescriptor();

         const instance = await options.getWcInstance();
         await options.writeFile(
            REQUEST_RUNNER_SCRIPT_PATH,
            REQUEST_RUNNER_SCRIPT,
         );
         await options.writeFile(
            REQUEST_RUNNER_DESCRIPTOR_PATH,
            JSON.stringify(descriptor),
         );

         const process = await instance.spawn('node', [
            REQUEST_RUNNER_SCRIPT_PATH,
            REQUEST_RUNNER_DESCRIPTOR_PATH,
         ]);
         const { text, timedOut } = await readProcessOutput(process);
         const exitCode = await process.exit;

         if (timedOut && !text.trim()) {
            throw new Error(
               `请求超过 ${REQUEST_TIMEOUT_MS / 1000} 秒没有返回（服务可能卡住了）。`,
            );
         }
         if (!text.trim()) {
            throw new Error(
               `请求脚本没有返回结果（退出码 ${exitCode}）。请查看终端是否有报错。`,
            );
         }

         try {
            applyResult(JSON.parse(text) as IRequestRunnerResult);
         } catch {
            // 脚本只往 stdout 写一行 JSON；能走到这里说明容器里有别的东西污染了输出
            throw new Error(`请求脚本返回了非预期输出：${text.slice(0, 500)}`);
         }
      } catch (err) {
         error.value = err instanceof Error ? err.message : String(err);
      } finally {
         sending.value = false;
      }
   };

   const reset = () => {
      response.value = null;
      error.value = null;
      truncated.value = false;
   };

   return { sending, error, response, truncated, send, reset };
};
