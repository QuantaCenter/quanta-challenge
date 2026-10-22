<script setup lang="ts">
import JudgeScript from './_modules/JudgeScript.vue';
import UploadProject from './_components/UploadProject.vue';
import LazyMarkdownEditingDrawer from './_drawers/MarkdownEditingDrawer.vue';
import TagsPicker from './_modules/TagsPicker.vue';
import { ignores } from '~/components/st/DropUploader/default-ignore';
import {
   isCustomImageId,
   normalizeBackendServiceImageId,
} from '@challenge/shared/backend-service-image';
import type { StForm } from '#components';
import {
   useProblemPublicationForm,
   cloudFunctionOptions,
   problemTypeOptions,
} from './_composables/use-problem-publication-form';
import { UploadTwo } from '@icon-park/vue-next';
import { normalizePath, joinPath } from '~/utils/path-utils';
import { useMessage } from '~/components/st/Message/use-message';

useSeoMeta({ title: '发布题目 - Quanta Challenge' });

const message = useMessage();

const outerClass =
   'border !py-4 !px-4 !rounded-[0.5rem] w-full focus-within:!border-primary';
let storageName = 'publishFormdata';
let fromId: number | undefined = undefined;
let baseId: number | undefined = undefined;

const route = useRoute();
if (route.query.fromId) {
   fromId = Number(route.query.fromId);
   storageName = `republishFormdata`;
}

const { $trpc } = useNuxtApp();
const {
   draft,
   coverModeOptions,
   difficultyOptions,
   formKey,
   rules,
   serviceImageOptions,
   applyProblemTypeConstraints,
} = useProblemPublicationForm(storageName);

const enableCloudFunction = computed<boolean>({
   get: () => draft.value.enableCloudFunction === true,
   set: (value) => {
      draft.value.enableCloudFunction = value;
   },
});

interface ImageBuildItem {
   id: string;
   name: string;
   status: string;
}
const customImageBuilds = ref<ImageBuildItem[]>([]);
const imageListLoading = ref(false);
const refreshCustomImages = async () => {
   imageListLoading.value = true;
   try {
      customImageBuilds.value = await $trpc.admin.imageBuild.list.query();
   } catch (error) {
      console.error('[publish] 获取自定义镜像列表失败:', error);
   } finally {
      imageListLoading.value = false;
   }
};
onMounted(() => refreshCustomImages());

const allServiceImageOptions = computed(() => [
   ...serviceImageOptions,
   ...customImageBuilds.value
      .filter((item) => item.status === 'ready')
      .map((item) => ({
         label: `${item.name}（自定义镜像）`,
         value: `custom:${item.id}`,
      })),
]);

const problemType = computed<'frontend' | 'backend_service'>({
   get: () => draft.value.problemType ?? 'frontend',
   set: (value) => {
      draft.value.problemType = value;
   },
});

const detailLoading = ref(false);

// 编辑时的原始数据，用于判断本次修改能否不经审核直接生效（以服务端判定为准）
interface IEditBaseline {
   isCurrent: boolean;
   status: string;
   hasDefaultCover: boolean;
   judgeScript: string;
   score?: number;
   answerTemplate: Record<string, string>;
   bootCommand: string;
   initCommand: string;
   buildCommand: string;
   judgeUploadPath: string;
   enableCloudFunction: boolean;
   problemType: 'frontend' | 'backend_service';
   serviceImage: string;
   servicePort: number;
}
const baseline = ref<IEditBaseline>();

const auditReasonLabels = {
   version: '基于历史版本编辑',
   status: '当前版本尚未通过审核',
   judgeScript: '判题脚本',
   answerTemplate: '作答模板',
   totalScore: '题目总分',
   runtime: '题型 / 命令 / 镜像 / 端口 / 云函数',
   cover: '首屏截图封面（需由审核生成）',
} as const;
type AuditReason = keyof typeof auditReasonLabels;

const isSameSnapshot = (a: Record<string, string>, b: Record<string, string>) => {
   const left = removeRootDir(a);
   const right = removeRootDir(b);
   const keys = Object.keys(left);
   return (
      keys.length === Object.keys(right).length &&
      keys.every((key) => left[key] === right[key])
   );
};

const auditReasons = computed<AuditReason[]>(() => {
   const base = baseline.value;
   if (!base) return [];
   const value = draft.value;
   const reasons: AuditReason[] = [];
   if (!base.isCurrent) reasons.push('version');
   if (!['ready', 'published'].includes(base.status)) reasons.push('status');
   if (value.judgeScript !== base.judgeScript) reasons.push('judgeScript');
   if (!isSameSnapshot(value.answerTemplate, base.answerTemplate)) {
      reasons.push('answerTemplate');
   }
   if (value.score !== base.score) reasons.push('totalScore');
   if (
      value.bootCommand !== base.bootCommand ||
      value.initCommand !== base.initCommand ||
      value.buildCommand !== base.buildCommand ||
      value.judgeUploadPath !== base.judgeUploadPath ||
      value.enableCloudFunction !== base.enableCloudFunction ||
      value.problemType !== base.problemType ||
      (value.problemType === 'backend_service' &&
         (value.serviceImage !== base.serviceImage ||
            value.servicePort !== base.servicePort))
   ) {
      reasons.push('runtime');
   }
   if (value.coverMode === 'default' && !base.hasDefaultCover) {
      reasons.push('cover');
   }
   return reasons;
});
// 新建题目总是需要审核；编辑时只改基本信息可直接发布
const needsAudit = computed(
   () => !fromId || !baseline.value || auditReasons.value.length > 0,
);

const imageName = ref('');
const imageUrl = computed(() => {
   return imageName.value ? `/api/static/${imageName.value}` : undefined;
});
const fetchProblemDetail = async () => {
   if (!fromId) return;

   detailLoading.value = true;
   try {
      const problem = await $trpc.admin.problem.getDetail.query({
         problemId: fromId,
      });
      baseId = problem.BaseProblem.id;

      imageName.value = problem.CoverImage?.name ?? '';
      draft.value.title = problem.title;
      draft.value.detail = problem.detail;
      draft.value.score = problem.totalScore;
      draft.value.tags = problem.tags.map((t) => t.tid);
      draft.value.difficulty = problem.difficulty;
      draft.value.judgeScript = problem.JudgeFile[0]?.judgeScript ?? '';
      draft.value.coverMode = problem.CoverImage ? 'custom' : 'default';
      draft.value.coverImageId = problem.CoverImage?.id;
      draft.value.answerTemplate = {};
      draft.value.referenceAnswer = {};

      draft.value.bootCommand = problem.bootCommand ?? '';
      draft.value.initCommand = problem.initCommand ?? '';
      draft.value.buildCommand = problem.buildCommand ?? '';
      draft.value.judgeUploadPath = problem.judgeUploadPath ?? '';
      draft.value.enableCloudFunction = problem.enableCloudFunction ?? false;
      draft.value.problemType = problem.problemType ?? 'frontend';
      draft.value.serviceImage = problem.serviceImage ?? '';
      draft.value.servicePort = problem.servicePort ?? 3000;
      applyProblemTypeConstraints(draft.value.problemType);

      const files = problem.Project[0]?.FileSystem[0]?.files ?? [];
      for (const file of files) {
         // 统一规范化路径为前置 / 格式
         const normalizedPath = normalizePath(file.path);
         draft.value.answerTemplate[
            joinPath('/answer-template', normalizedPath)
         ] = file.content;
      }

      baseline.value = {
         isCurrent: problem.BaseProblem.currentPid === fromId,
         status: problem.status,
         hasDefaultCover: problem.ProblemDefaultCover.length > 0,
         judgeScript: draft.value.judgeScript,
         score: draft.value.score,
         answerTemplate: { ...draft.value.answerTemplate },
         bootCommand: draft.value.bootCommand,
         initCommand: draft.value.initCommand,
         buildCommand: draft.value.buildCommand,
         judgeUploadPath: draft.value.judgeUploadPath,
         enableCloudFunction: draft.value.enableCloudFunction,
         problemType: draft.value.problemType,
         serviceImage: draft.value.serviceImage,
         servicePort: draft.value.servicePort,
      };
   } finally {
      // 失败也要解锁，否则报错后字段永久置灰
      detailLoading.value = false;
   }
};
onMounted(() => {
   fetchProblemDetail().catch((error) => {
      alert('获取题目详情失败: ' + error);
      console.error(error);
   });
});

// 确保分数不小于0
watch(
   () => draft.value.score,
   (newScore) => {
      newScore !== undefined && newScore < 0 && (draft.value.score = 0);
   },
);
// 编辑器
const markdownEditing = ref(false);

// 提交
const submitLoading = ref(false);
const handleSubmit = async () => {
   const upload = async () => {
      const uploadMethod = fromId ? 'reupload' : 'upload';
      return await $trpc.admin.problem[uploadMethod].mutate({
         baseId: baseId!,
         title: draft.value.title,
         detail: draft.value.detail,
         totalScore: draft.value.score ?? 0,
         tagIds: draft.value.tags,
         difficulty: draft.value.difficulty!,
         judgeScript: draft.value.judgeScript,
         answerTemplateSnapshot: removeRootDir(draft.value.answerTemplate),
         referenceAnswerSnapshot: removeRootDir(draft.value.referenceAnswer),
         coverMode: draft.value.coverMode,
         coverImageId: draft.value.coverImageId,
         bootCommand: draft.value.bootCommand,
         buildCommand: draft.value.buildCommand,
         initCommand: draft.value.initCommand,
         judgeUploadPath: draft.value.judgeUploadPath,
         enableCloudFunction: draft.value.enableCloudFunction ?? false,
         problemType: draft.value.problemType,
         serviceImage:
            draft.value.problemType === 'backend_service'
               ? isCustomImageId(draft.value.serviceImage)
                  ? draft.value.serviceImage
                  : normalizeBackendServiceImageId(draft.value.serviceImage)
               : undefined,
         servicePort: draft.value.servicePort,
      });
   };
   submitLoading.value = true;
   try {
      // 等待上传结果
      const result = await atLeastTime(300, upload());
      // 只有成功了，才进行跳转
      if (result?.problemId) {
         if ('mode' in result && result.mode === 'quick') {
            message.success('已直接发布', '题目信息已更新，无需重新审核');
         }
         navigateTo(`/app/publish/problem/detail/${result.problemId}`);
      }
   } catch (error) {
      // 如果失败了，进入这里
      const errorMsg = error instanceof Error ? error.message : String(error);
      message.error("发布题目失败", errorMsg);
   } finally {
      // 无论成功还是失败，都要关掉 loading 状态
      submitLoading.value = false;
   }
};
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="w-[44rem] pb-[10rem] my-6">
         <h1 class="st-font-hero-bold">{{ fromId ? '编辑题目' : '发布题目' }}</h1>
         <StForm
            v-model:model-value="draft"
            :ref="formKey"
            :rules="rules"
            class="w-full">
            <StSpace
               direction="vertical"
               gap="1.75rem"
               class="w-full px-[0.625rem]">
               <StFormItem name="title" label="题目标题" required>
                  <StInput
                     v-model:value="draft.title"
                     placeholder="请输入3～15字的标题"
                     :outer-class />
               </StFormItem>
               <StFormItem name="description" label="题目描述" required>
                  <template #header-right>
                     <LazyMarkdownEditingDrawer
                        hydrate-on-visible
                        v-model:opened="markdownEditing"
                        v-model:markdown="draft.detail" />
                     <StTextButton
                        @click="markdownEditing = !markdownEditing"
                        text="使用 md 编辑器" />
                  </template>
                  <StTextarea
                     rows="3"
                     placeholder="请输入题目描述"
                     v-model:value="draft.detail"
                     :outer-class />
               </StFormItem>
               <StFormItem name="score" label="题目总分" required>
                  <StInput
                     type="number"
                     v-model:value="draft.score"
                     placeholder="请输入题目总分"
                     :outer-class />
               </StFormItem>
               <StFormItem
                  name="problemType"
                  label="题目类型"
                  error-message="请选择题目类型"
                  required>
                  <StSlideRadioGroup
                     v-model:value="problemType"
                     :options="problemTypeOptions" />
               </StFormItem>
               <StFormItem name="judgeScript" label="判题脚本" required>
                  <JudgeScript
                     v-model:script="draft.judgeScript"
                     :problem-type="problemType" />
               </StFormItem>
               <StFormItem name="tags" label="题目标签" required>
                  <TagsPicker v-model:tags="draft.tags" :outer-class />
               </StFormItem>
               <StFormItem name="difficulty" label="题目难度" required>
                  <StSlideRadioGroup
                     v-model:value="draft.difficulty"
                     :options="difficultyOptions" />
               </StFormItem>
               <template v-if="problemType === 'backend_service'">
                  <StFormItem name="serviceImage" label="初始镜像" required>
                     <StSpace direction="vertical" gap="0.5rem" fill-x>
                        <StSelect
                           v-model:value="draft.serviceImage"
                           placeholder="请选择初始镜像"
                           attach-to-body
                           :outer-class
                           :options="allServiceImageOptions" />
                        <StSpace gap="1rem" align="center">
                           <StTextButton
                              :text="imageListLoading ? '刷新中…' : '刷新镜像列表'"
                              @click="refreshCustomImages" />
                           <NuxtLink
                              to="/app/publish/image"
                              target="_blank"
                              class="st-font-caption text-primary hover:underline">
                              创建镜像 ↗
                           </NuxtLink>
                        </StSpace>
                     </StSpace>
                  </StFormItem>
                  <StFormItem name="servicePort" label="服务端口" required>
                     <StInput
                        type="number"
                        v-model:value="draft.servicePort"
                        placeholder="服务监听的端口，默认 3000"
                        :outer-class />
                  </StFormItem>
               </template>
               <StFormItem
                  v-if="problemType !== 'backend_service'"
                  name="enableCloudFunction"
                  label="是否使用云函数"
                  error-message="请选择是否使用云函数"
                  required>
                  <StSlideRadioGroup
                     v-model:value="enableCloudFunction"
                     :options="cloudFunctionOptions" />
               </StFormItem>
               <StFormItem name="cover" label="封面图片" required>
                  <!-- 后端题型只支持自定义封面，不需要让出题人选 -->
                  <StSlideRadioGroup
                     v-if="problemType !== 'backend_service'"
                     v-model:value="draft.coverMode"
                     :options="coverModeOptions" />
                  <StUploadImage
                     v-show="
                        problemType === 'backend_service' ||
                        draft.coverMode === 'custom'
                     "
                     v-model:image-id="draft.coverImageId"
                     :image-url="imageUrl"
                     placeholder="请选择封面图片" />
               </StFormItem>
               <StFormItem name="answerTemplate" label="作答模板" required>
                  <UploadProject
                     placeholder="上传答题初始化模板文件夹"
                     v-model:project-fs="draft.answerTemplate" />
               </StFormItem>
               <StFormItem
                  name="referenceAnswer"
                  label="参考答案"
                  :required="draft.coverMode === 'default' && needsAudit">
                  <UploadProject
                     :ignore-directories="
                        ignores.directories.filter((i) => i !== 'dist')
                     "
                     placeholder="上传打包后的参考答案文件夹"
                     v-model:project-fs="draft.referenceAnswer" />
               </StFormItem>
               <StFormItem
                  name="bootCommand"
                  :label="
                     problemType === 'backend_service'
                        ? '启动命令（由初始镜像决定）'
                        : '启动命令（提交前的一次性准备步骤，必须自行退出）'
                  ">
                  <StTextarea
                     rows="3"
                     :disabled="
                        detailLoading || problemType === 'backend_service'
                     "
                     :placeholder="
                        problemType === 'backend_service'
                           ? '由初始镜像决定'
                           : '一行一条，例如：[install] npm --prefix ./project install'
                     "
                     v-model:value="draft.bootCommand"
                     :outer-class />
               </StFormItem>
               <StFormItem
                  name="initCommand"
                  :label="
                     problemType === 'backend_service'
                        ? '初始化命令（服务启动命令，判题与预览共用）'
                        : '初始化命令（在线预览的 dev server）'
                  "
                  required>
                  <StInput
                     placeholder="例如：[dev-server] cd ./project && npm start"
                     v-model:value="draft.initCommand"
                     :outer-class />
               </StFormItem>
               <StFormItem
                  name="buildCommand"
                  label="构建命令（提交时执行一次，必须自行退出；留空则直接打包上传路径）">
                  <StInput
                     v-model:value="draft.buildCommand"
                     placeholder="例如：npm --prefix ./project run build"
                     :outer-class />
               </StFormItem>
               <StFormItem name="judgeUploadPath" label="打包上传路径" required>
                  <StInput
                     v-model:value="draft.judgeUploadPath"
                     placeholder="请输入打包上传路径"
                     :outer-class />
               </StFormItem>
            </StSpace>
            <div
               v-if="fromId && baseline"
               class="mx-2 mt-[2.13rem] px-4 py-3 rounded-[0.5rem] border text-sm leading-6"
               :class="
                  needsAudit
                     ? 'border-warning/40 bg-warning/5'
                     : 'border-success/40 bg-success/5'
               ">
               <template v-if="needsAudit">
                  <div>
                     以下内容有变更，需要重新审核：{{
                        auditReasons.map((r) => auditReasonLabels[r]).join('、')
                     }}
                  </div>
                  <div class="text-accent-300">
                     提交后会创建新版本，审核通过并发布后生效。{{
                        auditReasons.includes('answerTemplate')
                           ? '作答模板已变更，用户进入新版本时会从新模板开始作答。'
                           : '作答模板未变，用户已有的作答文件会保留。'
                     }}
                  </div>
               </template>
               <template v-else>
                  <div>只修改了标题、描述、标签、难度或封面，保存后直接生效，无需重新审核。</div>
                  <div class="text-accent-300">
                     用户的完成状态、作答文件和提交记录都不受影响。
                  </div>
               </template>
            </div>
            <StSpace
               justify="between"
               align="center"
               class="px-2"
               :class="fromId && baseline ? 'mt-4' : 'mt-[2.13rem]'">
               <div class="text-accent-300">已经自动保存</div>
               <StButton
                  :loading="submitLoading"
                  @click="handleSubmit"
                  class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.375rem]">
                  <div class="flex gap-2 items-center">
                     <UploadTwo class="text-[1.5rem]" />
                     <span>{{ needsAudit ? '提交审核' : '直接发布' }}</span>
                  </div>
               </StButton>
            </StSpace>
         </StForm>
      </StSpace>
   </StSpace>
</template>
