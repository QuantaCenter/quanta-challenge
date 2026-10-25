<script setup lang="ts">
import {
   CheckOne,
   Clear,
   Copy,
   FullScreenTwo,
   GridTwo,
   History,
   IndentLeft,
   Link,
   LoadingFour,
   MagicWand,
   OffScreen,
   ReduceOne,
   Round,
   Text,
} from '@icon-park/vue-next';
import type { WebContainer } from '@webcontainer/api';
import { useMessage } from '~/components/st/Message/use-message';
import { useViewTransition } from '~/composables/use-view-transition';
import EditorEnvError from '../_components/EditorEnvError.vue';
import {
   CELL_INPUT_CLASS,
   filledKvRows,
   isBlankKvRow as isBlankRow,
   toKvText,
   useRequestKvLists,
   type KvListMode,
} from '../_composables/use-request-kv-lists';
import { useRequestBody, type BodyMode } from '../_composables/use-request-body';
import { useRequestSend } from '../_composables/use-request-send';
import {
   toHistoryRows,
   toKvRows,
   useRequestHistory,
   type IRequestHistoryEntry,
} from '../_composables/use-request-history';
import {
   METHOD_COLOR,
   methodOptions,
   useRequestTarget,
   type HttpMethod,
} from '../_composables/use-request-target';
import RequestHistoryPanel from './RequestHistoryPanel.vue';
import KvTextEditor from './KvTextEditor.vue';
import ResponsePanel from './ResponsePanel.vue';

/** 接口调试面板：控件优先用组件库（~/components/st），只有方格表格用原生 <table>。
 *  逻辑按「列表 / 目标 / 请求体 / 发送」四块拆在 _composables 里，这里只做编排。 */
const props = defineProps<{
   port: number;
   serverReady: boolean;
   steps?: { idle: string; running: string }[];
   currentStep?: number;
   unsupportedReason?: string | null;
   getWcInstance: () => Promise<WebContainer>;
   writeFile: (path: string, content: string) => Promise<void>;
}>();

const message = useMessage();
const { startViewTransition } = useViewTransition({ delay: 150 });

const {
   params,
   headers,
   removeRow,
   isTextMode,
   text: bulkText,
   switchMode,
   exitTextMode,
   reset: resetLists,
} = useRequestKvLists();

type RequestTab = 'params' | 'headers' | 'body';

const requestTabs: { label: string; value: RequestTab }[] = [
   { label: '参数', value: 'params' },
   { label: '请求头', value: 'headers' },
   { label: '请求体', value: 'body' },
];

/** 用 string 而不是联合类型：StTabs 的 model 就是 string。 */
const requestTab = ref<string>('params');

const isParamTab = computed(() => requestTab.value === 'params');
const isBodyTab = computed(() => requestTab.value === 'body');
const activeRows = computed(() =>
   isParamTab.value ? params.value : headers.value,
);

/** 表格上方那行小字 */
const listLabel = computed(() => (isParamTab.value ? '参数列表' : '请求头列表'));
const keyPlaceholder = computed(() =>
   isParamTab.value ? '键（如 page）' : '名称（如 Accept）',
);
const valuePlaceholder = computed(() =>
   isParamTab.value ? '值（如 1）' : '值（如 application/json）',
);

// 切页签前先把文本落盘，别让用户以为改了却白丢（编辑在另一张列表上）
watch(requestTab, () => {
   if (isTextMode.value) exitTextMode();
});

/** 表格 / 文本方式切换：作用于当前页签那张列表 */
const switchListMode = (mode: KvListMode) =>
   switchMode(mode, activeRows.value);

// ————————————————— 请求方法与地址 —————————————————
const { method, pathname, requestUrl, handlePathUpdate, reset: resetTarget } =
   useRequestTarget({ getPort: () => props.port, params });

// ————————————————— 请求体 —————————————————
const {
   mode: bodyMode,
   options: bodyOptions,
   label: bodyModeLabel,
   text: bodyText,
   allowed: bodyAllowed,
   editorDisabled: bodyEditorDisabled,
   currentPayload,
   autoContentType,
   beautify: beautifyBody,
   minify: minifyBody,
   read: readBodyText,
   write: writeBody,
   reset: resetBody,
} = useRequestBody({ getMethod: () => method.value });

/** 用户填写的请求头 + 自动补的 Content-Type */
const effectiveHeaders = computed(() => {
   const result: Record<string, string> = {};
   for (const row of filledKvRows(headers.value)) {
      result[row.key.trim()] = row.value;
   }
   const hasContentType = Object.keys(result).some(
      (key) => key.toLowerCase() === 'content-type',
   );
   if (autoContentType.value && !hasContentType) {
      result['Content-Type'] = autoContentType.value;
   }
   return result;
});

// ————————————————— 发送 —————————————————
const {
   sending,
   error: requestError,
   response,
   truncated: responseTruncated,
   send,
   reset: resetResponse,
} = useRequestSend({
   buildDescriptor: () => ({
      url: requestUrl.value,
      method: method.value,
      headers: effectiveHeaders.value,
      body: currentPayload(),
   }),
   getWcInstance: () => props.getWcInstance(),
   writeFile: (path, content) => props.writeFile(path, content),
});

// ————————————————— 请求历史 —————————————————
const {
   entries: historyEntries,
   record: recordHistory,
   clear: clearHistory,
} = useRequestHistory();
const historyOpened = ref(false);

/** 发送 + 记一条历史（记的是请求参数与结果，方便一键恢复） */
const sendRequest = async () => {
   await send();
   recordHistory({
      method: method.value,
      pathname: pathname.value,
      params: toHistoryRows(params.value),
      headers: toHistoryRows(headers.value),
      bodyMode: bodyMode.value,
      bodyText: readBodyText(),
      status: response.value?.status,
      statusText: response.value?.statusText,
      durationMs: response.value?.durationMs,
      failed: !!requestError.value,
   });
};

/** 恢复一条历史：方法 / 路径 / 参数 / 请求头 / 请求体全部回到当时的样子 */
const restoreHistory = (entry: IRequestHistoryEntry) => {
   // 文本方式先退掉，否则刚恢复的行会被编辑器里的旧文本覆盖
   if (isTextMode.value) exitTextMode();

   method.value = entry.method as HttpMethod;
   pathname.value = entry.pathname;
   params.value = toKvRows(entry.params);
   headers.value = toKvRows(entry.headers);
   bodyMode.value = entry.bodyMode as BodyMode;
   writeBody(entry.bodyText);
   resetResponse();

   historyOpened.value = false;
   message.success('已恢复这次请求的参数');
};

// ————————————————— 复制 / 清空 / 全屏 —————————————————
const copyText = async (text: string, tip: string) => {
   try {
      await navigator.clipboard.writeText(text);
      message.success(tip);
   } catch {
      message.error('复制失败', '请手动选择复制');
   }
};

/** 把整张列表按文本形式（一行一条）复制走 */
const copyList = () =>
   copyText(toKvText(activeRows.value), `已复制${listLabel.value}`);

const clearAll = () => {
   resetTarget();
   resetLists();
   resetBody();
   resetResponse();
};

const fullScreenMode = ref(false);const enterFullScreenMode = () => {
   startViewTransition(() => {
      fullScreenMode.value = true;
   });
};
const leaveFullScreenMode = () => {
   startViewTransition(() => {
      fullScreenMode.value = false;
   });
};
</script>

<template>
   <StSpace fill>
      <!-- 服务没起来之前不展示面板：此时发请求只会得到 ECONNREFUSED -->
      <StSpace
         v-if="!props.serverReady"
         fill
         direction="vertical"
         gap="0"
         class="bg-[#1F1F1F] rounded-xl max-md:rounded-none">
         <StSpace
            fill-x
            class="p-1 rounded-t-xl max-md:rounded-t-none bg-accent-600"
            justify="between"
            align="center"
            gap="0.25rem">
            <StSpace
               fill-x
               align="center"
               gap="0.5rem"
               class="h-[2rem] relative bg-accent-500 m-0.5 rounded-[0.5rem] px-3 text-accent-100">
               <Link class="shrink-0" />
               <StSpace
                  fill
                  align="center"
                  class="relative overflow-auto mini-scrollbar text-xs">
                  <div
                     class="absolute left-0 w-full overflow-ellipsis text-nowrap whitespace-nowrap flex shrink-0">
                     http://127.0.0.1:{{ props.port }}
                  </div>
               </StSpace>
            </StSpace>
         </StSpace>
         <StSpace
            fill
            class="rounded-b-xl max-md:rounded-b-none overflow-hidden border border-t-0 border-accent-600"
            direction="vertical"
            center
            :class="props.unsupportedReason ? '' : 'grayscale-100'">
            <!-- 出错时不要保留 grayscale：会把红色错误文字一并去色 -->
            <IconLogo
               v-if="!props.unsupportedReason"
               class="w-[24rem] scale-[175%] opacity-50 mb-4 -mt-4" />
            <EditorEnvError v-if="props.unsupportedReason" :reason="props.unsupportedReason" />
            <StSpace v-else direction="vertical" gap="0.5rem">
               <StSpace
                  v-for="(step, idx) in props.steps ?? []"
                  :key="idx"
                  align="center"
                  gap="0.5rem"
                  class="text-sm"
                  :class="
                     idx <= props.currentStep! ? 'text-accent-100' : 'text-accent-400'
                  ">
                  <CheckOne v-if="props.currentStep && props.currentStep > idx" />
                  <LoadingFour
                     v-else-if="props.currentStep === idx"
                     class="animate-spin" />
                  <Round v-else />
                  <div class="relative">
                     <div class="opacity-0 left-0 top-0">{{ step.running }}</div>
                     <div class="absolute left-0 top-0">
                        {{ props.currentStep === idx ? step.running : step.idle }}
                     </div>
                  </div>
               </StSpace>
            </StSpace>
         </StSpace>
      </StSpace>

      <!-- 服务就绪：请求面板 + 独立的响应面板（竖向分割，响应落在最下边） -->
      <Teleport v-else :disabled="!fullScreenMode" to="body">
         <div
            style="view-transition-name: requestPanel"
            :class="{
               'size-full': !fullScreenMode,
               'absolute w-[calc(100vw-4rem)] h-[calc(100vh-4rem)] left-8 top-8 rounded-xl overflow-hidden z-[10000] border border-accent-500 bg-[#1F1F1F]':
                  fullScreenMode,
            }">
            <StPopover
               v-if="fullScreenMode"
               content="退出全屏"
               :z-index="10005">
               <StButton
                  bordered
                  theme="primary"
                  class="!rounded-full !p-3 absolute right-4 top-4 z-[10001]"
                  aria-label="退出全屏"
                  @click="leaveFullScreenMode">
                  <OffScreen />
               </StButton>
            </StPopover>

            <StSplitPanel
               direction="vertical"
               class="size-full"
               storage-key="editor.request"
               :start-percent="55">
               <!-- 请求面板 -->
               <template #start>
                  <StSpace
                     fill
                     direction="vertical"
                     gap="0"
                     class="min-h-0 bg-[#1F1F1F] rounded-xl max-md:rounded-none">
                     <StSpace
                        fill-x
                        class="p-1 rounded-t-xl max-md:rounded-t-none bg-accent-600"
                        justify="between"
                        align="center"
                        gap="0.25rem">
                        <StSpace
                           fill-x
                           align="center"
                           gap="0.5rem"
                           class="h-[2rem] relative bg-accent-500 m-0.5 rounded-[0.5rem] px-3 text-accent-100">
                           <Link class="shrink-0" />
                           <StSpace
                              fill
                              align="center"
                              class="relative overflow-auto mini-scrollbar text-xs">
                              <div
                                 class="absolute left-0 w-full overflow-ellipsis text-nowrap whitespace-nowrap flex shrink-0">
                                 http://127.0.0.1:{{ props.port }}
                              </div>
                           </StSpace>
                        </StSpace>
                        <StPopover content="清空请求与响应" :z-index="10005">
                           <StRippleEffect>
                              <StSpace
                                 center
                                 no-shrink
                                 aria-label="清空请求与响应"
                                 class="size-[2rem] rounded-[0.5rem] m-0.5 text-accent-200 bg-accent-500 cursor-pointer"
                                 @click="clearAll">
                                 <Clear />
                              </StSpace>
                           </StRippleEffect>
                        </StPopover>
                        <StPopover content="请求历史" :z-index="10005">
                           <StRippleEffect>
                              <StSpace
                                 center
                                 no-shrink
                                 aria-label="请求历史"
                                 class="size-[2rem] rounded-[0.5rem] m-0.5 text-accent-200 bg-accent-500 cursor-pointer"
                                 @click="historyOpened = true">
                                 <History />
                              </StSpace>
                           </StRippleEffect>
                        </StPopover>
                        <StPopover content="全屏" :z-index="10005">
                           <StRippleEffect>
                              <StSpace
                                 center
                                 no-shrink
                                 aria-label="全屏"
                                 class="size-[2rem] rounded-[0.5rem] m-0.5 text-accent-200 bg-accent-500 cursor-pointer"
                                 @click="enterFullScreenMode">
                                 <FullScreenTwo />
                              </StSpace>
                           </StRippleEffect>
                        </StPopover>
                     </StSpace>

                     <StSpace
                        fill
                        direction="vertical"
                        gap="0"
                        class="min-h-0 rounded-b-xl max-md:rounded-b-none overflow-hidden border border-t-0 border-accent-600">
                        <!-- 不能省 fill-x：StSpace 默认 items-start，这行会按内容宽度收缩。 -->
                        <StSpace
                           fill-x
                           align="center"
                           gap="0.5rem"
                           class="px-3 pt-3 shrink-0">
                           <StSelect
                              v-model:value="method"
                              :options="methodOptions"
                              attach-to-body
                              :hide-description="true"
                              outer-class="bg-accent-600 hover:bg-accent-500 !py-0 !px-2.5 h-[2.25rem] w-[7.5rem] shrink-0 !rounded-[0.5rem] !gap-1"
                              options-container-class="!w-[7.5rem] border-accent-500">
                              <template #selected-preview>
                                 <span
                                    class="st-font-caption font-bold"
                                    :class="METHOD_COLOR[method]">
                                    {{ method }}
                                 </span>
                              </template>
                              <template #option="{ item }">
                                 <span
                                    class="st-font-caption font-bold w-full"
                                    :class="METHOD_COLOR[item.value as HttpMethod]">
                                    {{ item.label }}
                                 </span>
                              </template>
                           </StSelect>

                           <StInput
                              :value="pathname"
                              placeholder="/health"
                              spellcheck="false"
                              outer-class="bg-accent-600 !py-0 !px-2.5 h-[2.25rem] !gap-1 !rounded-[0.5rem] flex-1 min-w-0 transition-colors focus-within:ring-1 focus-within:ring-primary/50"
                              class="min-w-0 text-xs font-family-fira-code placeholder:text-accent-400"
                              @update:value="handlePathUpdate"
                              @keydown.enter.stop.prevent="sendRequest" />

                           <StButton
                              size="sm"
                              :loading="sending"
                              class="h-[2.25rem] shrink-0 !rounded-[0.5rem] !font-normal st-font-caption"
                              @click="sendRequest">
                              发送
                           </StButton>
                        </StSpace>

                        <StTabs
                           v-model="requestTab"
                           :options="requestTabs"
                           class="shrink-0 st-font-caption" />

                        <StScrollable fill scrollY class="flex-1 min-h-0">
                           <StSpace
                              direction="vertical"
                              gap="0.75rem"
                              class="p-3 h-full min-h-0">
                              <template v-if="!isBodyTab">
                                 <StSpace
                                    fill-x
                                    align="center"
                                    justify="between"
                                    class="pl-1">
                                    <span class="st-font-caption text-accent-300">
                                       {{ listLabel }}
                                    </span>
                                    <StSpace
                                       align="center"
                                       gap="0.375rem"
                                       class="shrink-0">
                                       <!-- 组件库没有图标按钮，与表格里的移除按钮同一写法 -->
                                       <StPopover
                                          :content="`以文本形式复制${listLabel}`"
                                          :z-index="10005">
                                          <button
                                             type="button"
                                             :aria-label="`以文本形式复制${listLabel}`"
                                             class="flex size-6 items-center justify-center rounded-[0.375rem] text-accent-300 transition-colors cursor-pointer hover:bg-accent-600 hover:text-primary"
                                             @click="copyList">
                                             <Copy size="1rem" />
                                          </button>
                                       </StPopover>

                                       <!-- 图标表示"点一下切到哪种方式" -->
                                       <StPopover
                                          :content="
                                             isTextMode ? '切换回表格' : '切换成文本'
                                          "
                                          :z-index="10005">
                                          <button
                                             type="button"
                                             :aria-label="
                                                isTextMode ? '切换回表格' : '切换成文本'
                                             "
                                             class="flex size-6 items-center justify-center rounded-[0.375rem] text-accent-300 transition-colors cursor-pointer hover:bg-accent-600 hover:text-primary"
                                             @click="
                                                switchListMode(
                                                   isTextMode ? 'table' : 'text',
                                                )
                                             ">
                                             <GridTwo v-if="isTextMode" size="1rem" />
                                             <Text v-else size="1rem" />
                                          </button>
                                       </StPopover>
                                    </StSpace>
                                 </StSpace>

                                 <div
                                    v-if="isTextMode"
                                    class="w-full flex-1 min-h-[12rem]">
                                    <KvTextEditor
                                       ref="list-editor"
                                       v-model="bulkText" />
                                 </div>

                                 <table
                                    v-else
                                    class="w-full table-fixed border-collapse shrink-0 text-xs font-family-fira-code">
                                    <colgroup>
                                       <col style="width: 2.75rem" />
                                       <col style="width: 38%" />
                                       <col />
                                       <col style="width: 2.25rem" />
                                    </colgroup>
                                    <tbody>
                                       <tr
                                          v-for="row in activeRows"
                                          :key="row.id"
                                          :class="row.enabled ? '' : 'opacity-50'">
                                          <td
                                             class="border border-accent-500 p-0 text-center align-middle">
                                             <StPopover
                                                v-if="!isBlankRow(row)"
                                                :content="
                                                   row.enabled
                                                      ? '已启用，点击停用这一项'
                                                      : '已停用，点击启用这一项'
                                                "
                                                :z-index="10005">
                                                <button
                                                   type="button"
                                                   :aria-pressed="row.enabled"
                                                   class="flex min-h-[1.75rem] w-full items-center justify-center cursor-pointer transition-colors hover:bg-accent-600"
                                                   @click="row.enabled = !row.enabled">
                                                   <CheckOne
                                                      v-if="row.enabled"
                                                      size="1rem"
                                                      class="text-primary" />
                                                   <Round
                                                      v-else
                                                      size="1rem"
                                                      class="text-accent-400" />
                                                </button>
                                             </StPopover>
                                          </td>
                                          <td class="border border-accent-500 p-0">
                                             <StInput
                                                v-model:value="row.key"
                                                spellcheck="false"
                                                :placeholder="keyPlaceholder"
                                                :outer-class="CELL_INPUT_CLASS"
                                                class="text-white placeholder:text-accent-400" />
                                          </td>
                                          <td class="border border-accent-500 p-0">
                                             <StInput
                                                v-model:value="row.value"
                                                spellcheck="false"
                                                :placeholder="valuePlaceholder"
                                                :outer-class="CELL_INPUT_CLASS"
                                                class="text-white placeholder:text-accent-400" />
                                          </td>
                                          <td
                                             class="border border-accent-500 p-0 text-center align-middle">
                                             <StPopover
                                                v-if="!isBlankRow(row)"
                                                content="移除这一项"
                                                :z-index="10005">
                                                <button
                                                   type="button"
                                                   aria-label="移除这一项"
                                                   class="flex min-h-[1.75rem] w-full items-center justify-center text-base text-accent-300 hover:bg-accent-600 hover:text-error transition-colors cursor-pointer"
                                                   @click="removeRow(activeRows, row.id)">
                                                   <ReduceOne size="1rem" />
                                                </button>
                                             </StPopover>
                                          </td>
                                       </tr>
                                    </tbody>
                                 </table>
                              </template>

                              <!-- 请求体 -->
                              <template v-else>
                                 <StSpace
                                    align="center"
                                    gap="0.5rem"
                                    class="w-full shrink-0">
                                    <StSelect
                                       v-model:value="bodyMode"
                                       :options="bodyOptions"
                                       attach-to-body
                                       :hide-description="true"
                                       outer-class="bg-accent-600 hover:bg-accent-500 !py-0 !px-2.5 h-[2rem] w-[6.5rem] shrink-0 !rounded-[0.375rem] !gap-1"
                                       options-container-class="!w-[6.5rem] border-accent-500">
                                       <template #selected-preview>
                                          <span
                                             class="st-font-caption text-accent-100">
                                             {{ bodyModeLabel }}
                                          </span>
                                       </template>
                                    </StSelect>
                                    <StSpace
                                       v-if="bodyMode === 'json'"
                                       align="center"
                                       gap="0.25rem"
                                       class="ml-auto shrink-0">
                                       <StPopover content="美化 JSON" :z-index="10005">
                                          <button
                                             type="button"
                                             :disabled="!bodyAllowed"
                                             aria-label="美化 JSON"
                                             class="flex size-6 items-center justify-center rounded-[0.375rem] text-accent-300 transition-colors cursor-pointer hover:bg-accent-600 hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                             @click="beautifyBody">
                                             <MagicWand size="1rem" />
                                          </button>
                                       </StPopover>
                                       <StPopover content="压缩 JSON" :z-index="10005">
                                          <button
                                             type="button"
                                             :disabled="!bodyAllowed"
                                             aria-label="压缩 JSON"
                                             class="flex size-6 items-center justify-center rounded-[0.375rem] text-accent-300 transition-colors cursor-pointer hover:bg-accent-600 hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                             @click="minifyBody">
                                             <IndentLeft size="1rem" />
                                          </button>
                                       </StPopover>
                                    </StSpace>
                                 </StSpace>

                                 <div
                                    v-if="bodyMode === 'none'"
                                    class="w-full flex-1 min-h-[10rem] rounded-[0.5rem] overflow-hidden">
                                    <StEmptyStatus
                                       :icon="null"
                                       content="未设置任何请求体"
                                       class="opacity-50" />
                                 </div>

                                 <div
                                    v-else
                                    class="w-full flex-1 min-h-[10rem] rounded-[0.5rem] overflow-hidden"
                                    :class="
                                       bodyEditorDisabled ? 'opacity-50' : ''
                                    ">
                                    <KvTextEditor
                                       ref="body-editor"
                                       v-model="bodyText"
                                       language="json"
                                       :readonly="bodyEditorDisabled" />
                                 </div>
                              </template>
                           </StSpace>
                        </StScrollable>
                     </StSpace>
                  </StSpace>
               </template>

               <!-- 响应面板（独立，落在最下边） -->
               <template #end>
                  <ResponsePanel
                     :response="response"
                     :request-error="requestError"
                     :sending="sending"
                     :truncated="responseTruncated"
                     :port="props.port" />
               </template>
            </StSplitPanel>
         </div>
      </Teleport>

      <!-- 请求历史（抽屉）：点一条即恢复当时的请求参数 -->
      <StDrawer global v-model:opened="historyOpened" width="26rem">
         <RequestHistoryPanel
            :entries="historyEntries"
            @restore="restoreHistory"
            @clear="clearHistory" />
      </StDrawer>
   </StSpace>
</template>

<style lang="css" src="@/assets/css/utils.css" />
