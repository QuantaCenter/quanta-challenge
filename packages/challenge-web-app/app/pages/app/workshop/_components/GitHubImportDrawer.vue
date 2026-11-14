<script setup lang="ts">
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '~~/server/trpc/routes';
import { Close, LoadingFour, Refresh } from '@icon-park/vue-next';
import type { StepsStep } from '~/components/st/Steps/type';
import { formatFileSize } from '~/utils/format-file-size';
import { parseRepository } from '~~/lib/github-repository';
import GitHubRepositoryPreview from './GitHubRepositoryPreview.vue';
type Output = inferRouterOutputs<AppRouter>['protected']['github'];
const opened = defineModel<boolean>('opened', {
   default: false,
});

const emit = defineEmits<{
   created: [];
}>();
const { $trpc } = useNuxtApp();
const { data: connection } = useNuxtData<Output['status']>('github-connection');
const repository = ref('');
const publicRepository = ref('');
const selectedRepository = ref('');
const name = ref('');
const branch = ref('');
const detail = ref<Output['inspect'] | null>(null);
const preview = ref<Output['preview'] | null>(null);
const previewPending = ref(false);
const previewFailure = ref('');
const stage = ref(0);
const stageTitles = [
   '选择仓库',
   '检查文件',
   '确认导入',
];
const steps = computed<StepsStep[]>(() => {
   return stageTitles.map((title, index) => {
      let status: StepsStep['status'] = 'waiting';

      if (index < stage.value) {
         status = 'completed';
      } else if (index === stage.value) {
         status = failure.value ? 'error' : 'inProgress';
      }

      return {
         title,
         status,
      };
   });
});

const stageDescription = computed(() => {
   if (importing.value) {
      return '正在下载仓库并创建项目，请稍候…';
   }

   return [
      '选择已授权仓库，或填写公共仓库链接。',
      '选择分支，检查文件目录与容量。',
      '确认导入内容，为项目设置名称。',
   ][stage.value];
});

const canContinue = computed(() => {
   return !pending.value && !previewPending.value && !!preview.value?.canImport;
});

const canReadRepository = computed(() => {
   if (pending.value || importing.value) {
      return false;
   }

   if (selectedRepository.value) {
      return !!detail.value;
   }

   try {
      parseRepository(publicRepository.value);
      return true;
   } catch {
      return false;
   }
});

const installations = ref<Output['installations']['items']>([]);
const installationId = ref('');
const repositories = ref<Output['repositories']['items']>([]);
const repoPage = ref(1);
const branchPage = ref(1);
const installationPage = ref(1);
const moreRepos = ref(false);
const moreInstallations = ref(false);
const pending = ref(false);
const importing = ref(false);

const drawerOpened = computed({
   get: () => opened.value,
   set: (value: boolean) => {
      if (!value && importing.value) {
         return;
      }

      opened.value = value;
   },
});

const failure = ref('');
const refreshTurns = ref(0);
const previousStage = () => {
   stage.value--;
   failure.value = '';
};

const nextStage = () => {
   stage.value++;
   failure.value = '';
};

const resetConnectionSelection = () => {
   installations.value = [];
   repositories.value = [];
   installationId.value = '';
};

const changeInstallation = () => {
   void run(async () => {
      await nextTick();
      await loadRepositories();
   });
};

const selectRepository = (value: unknown) => {
   void run(() => choose(String(value || '')));
};

const selectedInstallationLabel = computed(() => {
   return installationOptions.value.find((item) => {
      return item.value === installationId.value;
   })?.label;
});

const visibilityLabel = (value: string) =>
   value === 'public' ? '公开' : value === 'private' ? '私有' : '内部';
const inputClass =
   'w-full min-w-0 bg-accent-500 border border-accent-400 !rounded-lg !py-3 !px-3 focus-within:!border-primary [&_input]:min-w-0 [&_input]:w-full';
const installationOpened = ref(false);
const repositoryOpened = ref(false);
const branchOpened = ref(false);
const installationOptions = computed(() =>
   installations.value.map((item) => ({
      label: item.account,
      value: item.id,
   })),
);
const repositoryOptions = computed(() =>
   repositories.value.map((item) => ({
      label: item.fullName,
      value: item.fullName,
      description: visibilityLabel(item.visibility),
   })),
);
const branchOptions = computed(() =>
   detail.value
      ? [
           ...new Set([
              detail.value.repository.defaultBranch,
              ...detail.value.branches,
           ]),
        ].map((value) => ({
           label: value,
           value,
        }))
      : [],
);
watch(
   [
      pending,
      importing,
   ],
   ([busy, creating]) => {
      if (busy || creating) {
         installationOpened.value = false;
         repositoryOpened.value = false;
         branchOpened.value = false;
      }
   },
);
watch(installationId, () => {
   selectedRepository.value = '';
   repository.value = '';
   detail.value = null;
   branch.value = '';
   repositories.value = [];
   moreRepos.value = false;
});
let inspection = 0;
const run = async (work: () => Promise<void>) => {
   if (pending.value || importing.value) {
      return;
   }
   pending.value = true;
   failure.value = '';
   try {
      await work();
   } catch (error) {
      failure.value =
         error instanceof Error ? error.message : '操作失败，请重试';
   } finally {
      pending.value = false;
   }
};

const loadInstallations = async (append = false) => {
   const page = append ? installationPage.value + 1 : 1;
   const result = await $trpc.protected.github.installations.query({
      page,
   });
   installations.value = append
      ? [
           ...installations.value,
           ...result.items,
        ]
      : result.items;
   installationPage.value = page;
   moreInstallations.value = result.hasMore;
};

const loadRepositories = async (append = false) => {
   if (!installationId.value) {
      repositories.value = [];
      moreRepos.value = false;
      return;
   }
   const page = append ? repoPage.value + 1 : 1;
   const result = await $trpc.protected.github.repositories.query({
      installationId: installationId.value,
      page,
   });
   repositories.value = append
      ? [
           ...repositories.value,
           ...result.items,
        ]
      : result.items;
   repoPage.value = page;
   moreRepos.value = result.hasMore;
};

const refreshRepositories = () => {
   if (pending.value || importing.value) {
      return;
   }
   refreshTurns.value++;
   void run(async () => {
      await loadInstallations();
      if (installationId.value) {
         await loadRepositories();
      }
   });
};

const installGitHub = () => {
   installationOpened.value = false;
   repositoryOpened.value = false;
   void run(async () => {
      const { url } = await $trpc.protected.github.install.mutate({
         target: 'workshop',
      });
      await navigateTo(url, {
         external: true,
      });
   });
};
watch(
   opened,
   (visible) => {
      if (!visible) {
         return;
      }
      stage.value = 0;
      void run(async () => {
         connection.value = await $trpc.protected.github.status.query();
         if (!connection.value.connected) {
            installations.value = [];
            repositories.value = [];
            installationId.value = '';
            moreInstallations.value = false;
            moreRepos.value = false;
            return;
         }
         await loadInstallations();
         if (
            installationId.value &&
            !moreInstallations.value &&
            !installations.value.some(
               (item) => item.id === installationId.value,
            )
         ) {
            installationId.value = '';
         }
         if (installationId.value) {
            await loadRepositories();
         }
      });
   },
   {
      immediate: true,
   },
);
watch(repository, () => {
   inspection++;
   detail.value = null;
   branch.value = '';
   stage.value = 0;
});
let previewRequest = 0;
const loadPreview = async () => {
   const request = ++previewRequest;
   const target = detail.value?.repository.fullName;
   const selectedBranch = branch.value;
   preview.value = null;
   previewFailure.value = '';
   previewPending.value = !!target && !!selectedBranch;
   if (!target || !selectedBranch) {
      return;
   }
   try {
      const result = await $trpc.protected.github.preview.query({
         repository: target,
         branch: selectedBranch,
      });
      if (request === previewRequest) {
         preview.value = result;
      }
   } catch (error) {
      if (request === previewRequest) {
         previewFailure.value =
            error instanceof Error ? error.message : '目录预览加载失败，请重试';
      }
   } finally {
      if (request === previewRequest) {
         previewPending.value = false;
      }
   }
};
watch(
   [
      repository,
      branch,
   ],
   () => {
      void loadPreview();
   },
   {
      flush: 'sync',
   },
);
watch(publicRepository, () => {
   if (!selectedRepository.value) {
      repository.value = '';
      detail.value = null;
      branch.value = '';
   }
});

const inspect = async () => {
   const current = ++inspection;
   const value = repository.value;
   const result = await $trpc.protected.github.inspect.query({
      repository: value,
      page: 1,
   });
   if (current !== inspection || value !== repository.value) {
      return;
   }
   detail.value = result;
   branch.value = result.repository.defaultBranch;
   name.value = result.repository.name.slice(0, 40);
   branchPage.value = 1;
   stage.value = 1;
};

const choose = async (value: string) => {
   repository.value = value;
   await nextTick();
   if (value) {
      await inspect();
   }
};

const inspectPublicRepository = async () => {
   selectedRepository.value = '';
   await choose(publicRepository.value);
};

const continueFromRepository = () => {
   if (!canReadRepository.value) {
      return;
   }

   if (selectedRepository.value) {
      nextStage();
      return;
   }

   void run(inspectPublicRepository);
};

const moreBranches = async () => {
   const result = await $trpc.protected.github.inspect.query({
      repository: repository.value,
      page: branchPage.value + 1,
   });
   if (detail.value) {
      detail.value.branches.push(...result.branches);
      detail.value.hasMore = result.hasMore;
      branchPage.value++;
   }
};

const create = async () => {
   if (
      !detail.value ||
      !preview.value?.canImport ||
      previewPending.value ||
      !name.value.trim() ||
      !branch.value ||
      importing.value ||
      pending.value
   ) {
      return;
   }
   importing.value = true;
   failure.value = '';
   try {
      await $trpc.protected.github.import.mutate({
         repository: detail.value.repository.fullName,
         branch: branch.value,
         name: name.value.trim(),
         commitSha: preview.value.commitSha,
      });
      emit('created');
      opened.value = false;
      repository.value = '';
      publicRepository.value = '';
      selectedRepository.value = '';
      detail.value = null;
   } catch (error) {
      failure.value =
         error instanceof Error ? error.message : '导入失败，请重试';
   } finally {
      importing.value = false;
   }
};
</script>

<template>
   <StDrawer
      v-model:opened="drawerOpened"
      global
      width="42rem">
      <div
         role="dialog"
         aria-modal="true"
         aria-label="从 GitHub 导入"
         :aria-busy="pending || importing"
         class="relative flex h-full w-full min-h-0 flex-col overflow-hidden bg-black text-white">
         <div
            :inert="pending || importing"
            class="flex h-full min-h-0 flex-col">
            <StSpace
               justify="between"
               align="center"
               gap="0.75rem"
               class="shrink-0 px-6 pb-4 pt-6 max-md:pt-8"
               fill-x>
               <h2 class="text-xl font-bold">从 GitHub 导入</h2>
               <StButton
                  size="sm"
                  aria-label="关闭"
                  :disabled="importing"
                  class="!size-10 !p-0 !bg-transparent !text-accent-300"
                  @click="opened = false">
                  <Close size="1.25rem" />
               </StButton>
            </StSpace>
            <div class="shrink-0 px-6 pb-5">
               <StSteps
                  :steps="steps"
                  :status="stageDescription"
                  :tone="importing ? 'active' : 'idle'" />
            </div>
            <div
               class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
               <div
                  v-if="stage === 0"
                  class="flex flex-col gap-4">
                  <GitHubConnectionCard
                     target="workshop"
                     @changed="resetConnectionSelection" />
                  <p class="text-sm text-accent-300">
                     复制选定分支的当前文件到工坊。导入后独立保存。
                  </p>
                  <fieldset
                     :disabled="importing || pending"
                     :inert="importing || pending"
                     class="flex flex-col gap-4 disabled:opacity-60">
                     <template v-if="connection?.connected">
                        <StFormItem
                           name="github-installation"
                           label="已授权账号 / 组织">
                           <template #header-right>
                              <StButton
                                 size="sm"
                                 aria-label="刷新账号和仓库"
                                 title="刷新账号和仓库"
                                 class="!p-2 !bg-transparent !text-accent-300"
                                 :disabled="pending || importing"
                                 @click="refreshRepositories">
                                 <Refresh
                                    class="block text-lg transition-transform duration-500 ease-in-out motion-reduce:transition-none"
                                    :style="{ transform: `rotate(${refreshTurns * 360}deg)` }"
                                    aria-hidden="true" />
                              </StButton>
                           </template>
                           <StSelect
                              v-model:value="installationId"
                              v-model:opened="installationOpened"
                              aria-label="已授权账号 / 组织"
                              role="combobox"
                              :aria-expanded="installationOpened"
                              tabindex="0"
                              attach-to-body
                              placeholder="请选择账号 / 组织"
                              :options="installationOptions"
                              :outer-class="inputClass"
                              :max-container-height="240"
                              options-container-class="overflow-y-auto!"
                              @keydown.enter.prevent="installationOpened = !installationOpened"
                              @update:value="changeInstallation">
                              <template #selected-preview>
                                 <span class="text-white">{{
                                    selectedInstallationLabel
                                 }}</span>
                              </template>
                              <template #options-empty>
                                 <StSpace
                                    direction="vertical"
                                    align="center"
                                    gap="0.75rem"
                                    class="px-4 py-5"
                                    fill-x>
                                    <span class="text-sm text-accent-300"
                                       >未找到已授权的账号或组织</span
                                    >
                                    <StTextButton
                                       text="去安装"
                                       role="button"
                                       tabindex="0"
                                       @click="installGitHub"
                                       @keydown.enter.prevent="installGitHub"
                                       @keydown.space.prevent="installGitHub" />
                                 </StSpace>
                              </template>
                           </StSelect>
                        </StFormItem>
                        <StButton
                           v-if="moreInstallations"
                           size="sm"
                           bordered
                           @click="run(() => loadInstallations(true))"
                           >更多账号 / 组织</StButton
                        >
                        <StFormItem
                           v-if="installationId"
                           name="github-authorized-repository"
                           label="仓库">
                           <StSelect
                              v-model:value="selectedRepository"
                              v-model:opened="repositoryOpened"
                              aria-label="仓库"
                              role="combobox"
                              :aria-expanded="repositoryOpened"
                              tabindex="0"
                              attach-to-body
                              placeholder="请选择仓库"
                              option-empty-text="暂无可导入的仓库"
                              :options="repositoryOptions"
                              :outer-class="[inputClass, '[&>div]:min-w-0']"
                              :max-container-height="280"
                              options-container-class="overflow-y-auto!"
                              @keydown.enter.prevent="repositoryOpened = !repositoryOpened"
                              @update:value="selectRepository">
                              <template #selected-preview>
                                 <span class="block truncate text-white">{{
                                    selectedRepository
                                 }}</span>
                              </template>
                              <template #options-after>
                                 <StSpace
                                    v-if="moreRepos"
                                    justify="center"
                                    class="border-t border-accent-500 pt-2"
                                    fill-x>
                                    <StTextButton
                                       text="加载更多仓库"
                                       role="button"
                                       tabindex="0"
                                       @click="run(() => loadRepositories(true))"
                                       @keydown.enter.prevent="run(() => loadRepositories(true))" />
                                 </StSpace>
                              </template>
                           </StSelect>
                        </StFormItem>
                     </template>
                     <StFormItem
                        v-if="!selectedRepository"
                        name="github-repository"
                        label="或从公共仓库导入"
                        :class="connection?.connected ? 'border-t border-accent-500 pt-4' : ''">
                        <StSpace
                           gap="0.5rem"
                           fill-x
                           align="center">
                           <StInput
                              v-model:value="publicRepository"
                              aria-label="公共仓库链接"
                              :outer-class="[inputClass, 'flex-1']"
                              :disabled="importing || pending"
                              placeholder="https://github.com/owner/repository"
                              maxlength="300"
                              @keyup.enter="continueFromRepository" />
                        </StSpace>
                     </StFormItem>
                  </fieldset>
               </div>
               <template v-else-if="stage === 1 && detail">
                  <div class="flex flex-col gap-4">
                     <p class="text-sm text-accent-300">
                        {{ detail.repository.fullName }} ·
                        {{ visibilityLabel(detail.repository.visibility) }}
                     </p>
                     <StFormItem
                        name="github-branch"
                        label="导入分支"
                        required>
                        <StSelect
                           v-model:value="branch"
                           v-model:opened="branchOpened"
                           aria-label="导入分支"
                           role="combobox"
                           :aria-expanded="branchOpened"
                           tabindex="0"
                           attach-to-body
                           :options="branchOptions"
                           :outer-class="inputClass"
                           :max-container-height="240"
                           options-container-class="overflow-y-auto!"
                           @keydown.enter.prevent="branchOpened = !branchOpened" />
                     </StFormItem>
                     <StButton
                        v-if="detail.hasMore"
                        size="sm"
                        bordered
                        @click="run(moreBranches)"
                        >更多分支</StButton
                     >
                     <GitHubRepositoryPreview
                        :preview="preview"
                        :pending="previewPending"
                        :failure="previewFailure"
                        @refresh="loadPreview" />
                  </div>
               </template>
               <template v-else-if="stage === 2 && detail && preview">
                  <div class="flex flex-col gap-5">
                     <dl
                        class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 rounded-xl border border-accent-400 p-4 text-sm">
                        <dt class="text-accent-300">仓库</dt>
                        <dd class="break-all">
                           {{ detail.repository.fullName }}
                        </dd>
                        <dt class="text-accent-300">分支</dt>
                        <dd class="break-all">{{ branch }}</dd>
                        <dt class="text-accent-300">导入内容</dt>
                        <dd>
                           {{ preview.fileCount }} 个文件 ·
                           {{
                              preview.sizeBytes === null
                                 ? '大小未知'
                                 : formatFileSize(preview.sizeBytes)
                           }}
                        </dd>
                     </dl>
                     <StFormItem
                        name="github-project-name"
                        label="项目名称"
                        required>
                        <StInput
                           v-model:value="name"
                           aria-label="项目名称"
                           :outer-class="inputClass"
                           :disabled="importing || pending"
                           maxlength="40" />
                     </StFormItem>
                     <div
                        v-if="importing"
                        role="status"
                        class="flex items-center gap-2 text-sm text-primary">
                        <LoadingFour
                           class="animate-spin"
                           aria-hidden="true" />
                        正在导入，请稍候…
                     </div>
                  </div>
               </template>
            </div>
            <footer
               class="shrink-0 border-t border-accent-500 bg-black px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
               <p
                  v-if="failure"
                  role="alert"
                  class="mb-3 text-sm text-red-400">
                  {{ failure }}
               </p>
               <div class="flex items-center justify-between gap-3">
                  <StButton
                     v-if="stage > 0"
                     bordered
                     :disabled="pending || importing"
                     @click="previousStage">
                     上一步
                  </StButton>
                  <span v-else />
                  <StButton
                     v-if="stage === 0"
                     theme="primary"
                     :disabled="!canReadRepository"
                     @click="continueFromRepository">
                     下一步
                  </StButton>
                  <StButton
                     v-else-if="stage === 1"
                     theme="primary"
                     :disabled="!canContinue"
                     @click="nextStage">
                     下一步：确认导入
                  </StButton>
                  <StButton
                     v-else
                     theme="primary"
                     :loading="importing"
                     :disabled="!canContinue || !name.trim() || importing"
                     @click="create">
                     {{ importing ? '正在导入…' : '导入并创建项目' }}
                  </StButton>
               </div>
            </footer>
         </div>
         <div
            v-if="pending"
            role="status"
            aria-live="polite"
            class="absolute inset-0 z-20 flex cursor-wait flex-col items-center justify-center gap-3 bg-accent-600/80 backdrop-blur-[1px]">
            <LoadingFour
               class="animate-spin text-3xl text-primary"
               aria-hidden="true" />
            <span class="text-sm text-accent-100">正在加载，请稍候…</span>
         </div>
      </div>
   </StDrawer>
</template>
