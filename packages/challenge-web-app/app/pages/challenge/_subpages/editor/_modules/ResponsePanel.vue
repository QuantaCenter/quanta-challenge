<script setup lang="ts">
import {
   Api,
   CodeBrackets,
   Copy,
   GridTwo,
   LoadingFour,
   SpeedOne,
   Text,
   TextWrapOverflow,
   TextWrapTruncation,
   Timer,
} from '@icon-park/vue-next';
import { useMessage } from '~/components/st/Message/use-message';
import KvTextEditor from './KvTextEditor.vue';
import {
   MAX_BODY_CHARS,
   formatBytes,
   formatDuration,
   statusClass,
   type IResponseState,
} from '../_utils/response-format';

/** 响应面板：响应体（Monaco）/ 响应头（方格表格，可切文本方式）。 */
const props = defineProps<{
   response: IResponseState | null;
   /** 请求失败（连不上 / 脚本报错 / 超时）时的原因 */
   requestError: string | null;
   sending: boolean;
   /** 响应体是否被展示上限截断 */
   truncated: boolean;
   /** 服务端口，仅用于失败提示里的 127.0.0.1:<port> */
   port: number;
}>();

const message = useMessage();

// ————————————————— 页签 —————————————————
const responseTabs = [
   { label: '响应体', value: 'body' },
   { label: '响应头', value: 'headers' },
];
const responseTab = ref<string>('body');
const isBodyTab = computed(() => responseTab.value === 'body');

/** 两个 Monaco 都按这个设置换行 */
const wrap = ref(true);

// ————————————————— 响应体 —————————————————
const bodyEditor = useTemplateRef<{ setValue: (value: string) => void }>(
   'body-editor',
);

/** 截断过的 body 已经不是合法 JSON，不能美化 */
const prettyBody = computed(() => {
   if (!props.response || props.truncated) return null;
   try {
      return JSON.stringify(JSON.parse(props.response.bodyText), null, 2);
   } catch {
      return null;
   }
});

const bodyText = computed(() => prettyBody.value ?? props.response?.bodyText ?? '');

watch(bodyText, (value) => bodyEditor.value?.setValue(value), { flush: 'post' });

// ————————————————— 响应头：表格 / 文本 —————————————————
const headerTextMode = ref(false);
const headerEditor = useTemplateRef<{ setValue: (value: string) => void }>(
   'header-editor',
);

const headerLines = computed(() =>
   (props.response?.headers ?? []).map(([name, value]) => `${name}: ${value}`),
);
const headerText = computed(() => headerLines.value.join('\n'));

watch(headerText, (value) => headerEditor.value?.setValue(value), {
   flush: 'post',
});

// ————————————————— 复制 —————————————————
const copyText = async (text: string, tip: string) => {
   try {
      await navigator.clipboard.writeText(text);
      message.success(tip);
   } catch {
      message.error('复制失败', '请手动选择复制');
   }
};

const copyBody = () => copyText(bodyText.value, '已复制响应体');

const copyHeadersAsJson = () =>
   copyText(
      JSON.stringify(
         Object.fromEntries(props.response?.headers ?? []),
         null,
         2,
      ),
      '已复制响应头（JSON）',
   );

const copyHeadersAsKv = () =>
   copyText(headerText.value, '已复制响应头（KV）');
</script>

<template>
   <StSpace
      fill
      direction="vertical"
      gap="0"
      class="bg-[#1F1F1F] rounded-xl max-md:rounded-none border border-accent-600 overflow-hidden">
      <!-- 顶部只有页签（状态码 / 耗时 / 字节数 都在底部状态栏） -->
      <StSpace
         v-if="response"
         fill-x
         gap="0.5rem"
         align="center"
         class="shrink-0">
         <StTabs
            v-model="responseTab"
            :options="responseTabs"
            class="st-font-caption" />
      </StSpace>

      <StScrollable fill scrollY class="flex-1 min-h-0">
         <!-- 请求尚未开始 / 失败（失败的具体原因在底部状态栏） -->
         <StEmptyStatus
            v-if="!response && !sending"
            :icon="Api"
            gap="0.75rem"
            :content="requestError ? '请求失败' : '请求尚未开始'"
            class="opacity-50" />

         <!-- 发送中 -->
         <StSpace v-else-if="sending" fill center gap="0.5rem" class="p-6 text-accent-300">
            <LoadingFour class="animate-spin" />
            <span class="st-font-caption">请求发送中…</span>
         </StSpace>

         <div v-else-if="response" class="flex h-full min-h-0 flex-col">
            <!-- 响应体：Monaco，可切换行 / 复制 -->
            <template v-if="isBodyTab">
               <StSpace
                  fill-x
                  align="center"
                  justify="between"
                  class="shrink-0 px-3 py-2">
                  <span class="st-font-caption text-accent-300">响应体</span>
                  <StSpace align="center" gap="0.25rem" class="shrink-0">
                     <span
                        v-if="!bodyText"
                        class="st-font-tooltip text-accent-400">
                        响应体为空
                     </span>
                     <StPopover
                        :content="wrap ? '改为不换行' : '改为自动换行'"
                        :z-index="10005">
                        <button
                           type="button"
                           :aria-label="wrap ? '改为不换行' : '改为自动换行'"
                           class="flex size-6 items-center justify-center rounded-[0.375rem] text-accent-300 transition-colors cursor-pointer hover:bg-accent-600 hover:text-primary"
                           @click="wrap = !wrap">
                           <TextWrapTruncation v-if="wrap" size="1rem" />
                           <TextWrapOverflow v-else size="1rem" />
                        </button>
                     </StPopover>
                     <StPopover content="复制响应体" :z-index="10005">
                        <button
                           type="button"
                           aria-label="复制响应体"
                           class="flex size-6 items-center justify-center rounded-[0.375rem] text-accent-300 transition-colors cursor-pointer hover:bg-accent-600 hover:text-primary"
                           @click="copyBody">
                           <Copy size="1rem" />
                        </button>
                     </StPopover>
                  </StSpace>
               </StSpace>
               <div class="min-h-0 flex-1">
                  <KvTextEditor
                     ref="body-editor"
                     :model-value="bodyText"
                     language="json"
                     :readonly="true"
                     :wrap="wrap" />
               </div>
            </template>

            <!-- 响应头：方格表格 / 文本方式 -->
            <template v-else>
               <StSpace
                  fill-x
                  align="center"
                  justify="between"
                  class="shrink-0 px-3 pt-2 pb-0">
                  <span class="st-font-caption text-accent-300">响应头列表</span>
                  <StSpace align="center" gap="0.25rem" class="shrink-0">
                     <StPopover content="复制为 JSON" :z-index="10005">
                        <button
                           type="button"
                           aria-label="复制为 JSON"
                           class="flex size-6 items-center justify-center rounded-[0.375rem] text-accent-300 transition-colors cursor-pointer hover:bg-accent-600 hover:text-primary"
                           @click="copyHeadersAsJson">
                           <CodeBrackets size="1rem" />
                        </button>
                     </StPopover>
                     <StPopover content="复制为 KV" :z-index="10005">
                        <button
                           type="button"
                           aria-label="复制为 KV"
                           class="flex size-6 items-center justify-center rounded-[0.375rem] text-accent-300 transition-colors cursor-pointer hover:bg-accent-600 hover:text-primary"
                           @click="copyHeadersAsKv">
                           <Copy size="1rem" />
                        </button>
                     </StPopover>
                     <StPopover
                        :content="headerTextMode ? '切换回表格' : '切换成文本'"
                        :z-index="10005">
                        <button
                           type="button"
                           :aria-label="
                              headerTextMode ? '切换回表格' : '切换成文本'
                           "
                           class="flex size-6 items-center justify-center rounded-[0.375rem] text-accent-300 transition-colors cursor-pointer hover:bg-accent-600 hover:text-primary"
                           @click="headerTextMode = !headerTextMode">
                           <GridTwo v-if="headerTextMode" size="1rem" />
                           <Text v-else size="1rem" />
                        </button>
                     </StPopover>
                  </StSpace>
               </StSpace>

               <div class="min-h-0 flex-1 px-3 pt-2 pb-3">
                  <KvTextEditor
                     v-if="headerTextMode"
                     ref="header-editor"
                     :model-value="headerText"
                     language="plaintext"
                     :readonly="true"
                     :wrap="wrap" />

                  <template v-else>
                     <table
                        v-if="headerLines.length"
                        class="w-full table-fixed border-collapse text-xs font-family-fira-code">
                        <colgroup>
                           <col style="width: 38%" />
                           <col />
                        </colgroup>
                        <tbody>
                           <tr
                              v-for="([name, value], idx) in response.headers"
                              :key="idx">
                              <td
                                 class="border border-accent-500 px-2 py-[0.4rem] align-top break-all">
                                 {{ name }}
                              </td>
                              <td
                                 class="border border-accent-500 px-2 py-[0.4rem] align-top break-all st-selectable">
                                 {{ value }}
                              </td>
                           </tr>
                        </tbody>
                     </table>
                     <span
                        v-else
                        class="st-font-tooltip text-accent-400">
                        该响应没有响应头
                     </span>
                  </template>
               </div>
            </template>
         </div>
      </StScrollable>

      <!-- 底部状态栏：状态码 / 耗时 / 字节数 + 请求状态相关的提示 -->
      <StSpace
         v-if="response || requestError || truncated"
         fill-x
         direction="vertical"
         gap="0.25rem"
         class="shrink-0 border-t border-t-accent-600 px-3 py-2">
         <StSpace align="center" gap="0.625rem" class="w-full">
            <template v-if="response">
               <span
                  class="px-2 py-0.5 rounded-[0.375rem] st-font-tooltip font-bold shrink-0"
                  :class="statusClass(response.status)">
                  {{ response.status }} {{ response.statusText }}
               </span>
               <span
                  class="flex items-center gap-1 st-font-tooltip text-accent-300 shrink-0">
                  <Timer />
                  {{ formatDuration(response.durationMs) }}
               </span>
               <span
                  class="flex items-center gap-1 st-font-tooltip text-accent-300 shrink-0">
                  <SpeedOne />
                  {{ formatBytes(response.byteLength) }}
               </span>
            </template>
            <span v-if="requestError" class="st-font-caption font-bold text-error">
               请求失败
            </span>
            <span
               v-if="truncated"
               class="ml-auto st-font-tooltip text-warning">
               响应体过大，只展示前 {{ formatBytes(MAX_BODY_CHARS) }}
            </span>
         </StSpace>

         <template v-if="requestError">
            <span
               class="st-font-tooltip text-accent-100 font-family-fira-code break-all st-selectable">
               {{ requestError }}
            </span>
            <span class="st-font-tooltip text-accent-300">
               若提示 ECONNREFUSED / fetch failed，通常是服务还没监听
               127.0.0.1:{{ props.port }}（启动命令失败或端口不一致），
               看一眼左侧终端即可。
            </span>
         </template>
      </StSpace>
   </StSpace>
</template>

<style lang="css" src="@/assets/css/utils.css" />
