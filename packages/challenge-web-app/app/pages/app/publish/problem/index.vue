<script setup lang="ts">
import JudgeScript from './_modules/JudgeScript.vue';
import UploadProject from './_components/UploadProject.vue';
import LazyMarkdownEditingDrawer from './_drawers/MarkdownEditingDrawer.vue';
import TagsPicker from './_modules/TagsPicker.vue';
import { ignores } from '~/components/st/DropUploader/default-ignore';
import type { StForm } from '#components';
import { useProblemPublicationForm } from './_composables/use-problem-publication-form';
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
const { draft, coverModeOptions, difficultyOptions, formKey, rules } =
   useProblemPublicationForm(storageName);

const imageName = ref('');
const imageUrl = computed(() => {
   return imageName.value ? `/api/static/${imageName.value}` : undefined;
});
const fetchProblemDetail = async () => {
   if (!fromId) return;

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

   // 这四个"运行期配置"必须一起回填：提交时会把它们原样发回去，
   // 不回填就等于把库里已有的值清空（换句话说是"编辑一次丢一次配置"）。
   draft.value.bootCommand = problem.bootCommand ?? '';
   draft.value.initCommand = problem.initCommand ?? '';
   draft.value.buildCommand = problem.buildCommand ?? '';
   draft.value.judgeUploadPath = problem.judgeUploadPath ?? '';

   const files = problem.Project[0]?.FileSystem[0]?.files ?? [];
   for (const file of files) {
      // 统一规范化路径为前置 / 格式
      const normalizedPath = normalizePath(file.path);
      draft.value.answerTemplate[joinPath('/answer-template', normalizedPath)] =
         file.content;
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
         bootCommand: draft.value.bootCommand,
         buildCommand: draft.value.buildCommand,
         initCommand: draft.value.initCommand,
         judgeUploadPath: draft.value.judgeUploadPath,
      });
   };
   submitLoading.value = true;
   try {
      // 等待上传结果
      const result = await atLeastTime(300, upload());
      // 只有成功了，才进行跳转
      if (result?.problemId) {
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
         <h1 class="st-font-hero-bold">发布题目</h1>
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
               <StFormItem name="judgeScript" label="判题脚本" required>
                  <JudgeScript v-model:script="draft.judgeScript" />
               </StFormItem>
               <StFormItem name="tags" label="题目标签" required>
                  <TagsPicker v-model:tags="draft.tags" :outer-class />
               </StFormItem>
               <StFormItem name="difficulty" label="题目难度" required>
                  <StSlideRadioGroup
                     v-model:value="draft.difficulty"
                     :options="difficultyOptions" />
               </StFormItem>
               <StFormItem name="cover" label="封面图片" required>
                  <StSlideRadioGroup
                     v-model:value="draft.coverMode"
                     :options="coverModeOptions" />
                  <StUploadImage
                     v-show="draft.coverMode === 'custom'"
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
                  :required="draft.coverMode === 'default'">
                  <UploadProject
                     :ignore-directories="
                        ignores.directories.filter((i) => i !== 'dist')
                     "
                     placeholder="上传打包后的参考答案文件夹"
                     v-model:project-fs="draft.referenceAnswer" />
               </StFormItem>
               <StFormItem name="bootCommand" label="启动命令">
                  <StTextarea
                     rows="3"
                     placeholder="请输入启动命令（一行一条命令，顺序执行，不可取消）"
                     v-model:value="draft.bootCommand"
                     :outer-class />
               </StFormItem>
               <StFormItem name="initCommand" label="初始化命令">
                  <StInput
                     placeholder="请输入初始化 Shell 脚本（可取消）"
                     v-model:value="draft.initCommand"
                     :outer-class />
               </StFormItem>
               <StFormItem name="buildCommand" label="构建命令">
                  <StInput
                     v-model:value="draft.buildCommand"
                     placeholder="请输入构建命令"
                     :outer-class />
               </StFormItem>
               <StFormItem name="judgeUploadPath" label="打包上传路径" required>
                  <StInput
                     v-model:value="draft.judgeUploadPath"
                     placeholder="请输入打包上传路径"
                     :outer-class />
               </StFormItem>
            </StSpace>
            <StSpace justify="between" align="center" class="px-2 mt-[2.13rem]">
               <div class="text-accent-300">已经自动保存</div>
               <StButton
                  :loading="submitLoading"
                  @click="handleSubmit"
                  class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.375rem]">
                  <div class="flex gap-2 items-center">
                     <UploadTwo class="text-[1.5rem]" />
                     <span>提交审核</span>
                  </div>
               </StButton>
            </StSpace>
         </StForm>
      </StSpace>
   </StSpace>
</template>
