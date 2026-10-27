<script lang="ts">
/**
 * 专题草稿：新建专题在课程保存前只是本地草稿（没有 id），
 * 随课程一起提交时才落到服务端。
 */
export type TopicEditingDraft = {
   name: string;
   description: string;
   articleIds: number[];
};

/** 课程还没保存时，待创建专题的本地形态（key 只用于列表追踪） */
export type PendingTopic = TopicEditingDraft & { key: string };
</script>

<script setup lang="ts">
import { BookOne } from '@icon-park/vue-next';
import ReferencedArticlesField from './ReferencedArticlesField.vue';

const props = defineProps<{
   /** 传入即为编辑模式（已有专题或待创建草稿），不传则为新建 */
   topic?: TopicEditingDraft | null;
   /** 父组件正在落库时禁用提交 */
   saving?: boolean;
}>();

const opened = defineModel<boolean>('opened', { default: false });
const emit = defineEmits<{ confirm: [draft: TopicEditingDraft] }>();

const outerClass =
   'border !py-4 !px-4 !rounded-[0.5rem] w-full focus-within:!border-primary';

const editing = computed(() => !!props.topic);

const formdata = reactive<TopicEditingDraft>({
   name: '',
   description: '',
   articleIds: [],
});

const fillForm = (topic?: TopicEditingDraft | null) => {
   formdata.name = topic?.name ?? '';
   formdata.description = topic?.description ?? '';
   formdata.articleIds = topic ? [...topic.articleIds] : [];
};

/** 每次打开都换 key，让表单连同校验状态一起重建 */
const formKey = ref(0);
watch(opened, (isOpened) => {
   if (!isOpened) return;
   fillForm(props.topic);
   formKey.value += 1;
});

const canSubmit = computed(
   () => formdata.name.trim().length > 0 && formdata.articleIds.length > 0,
);

const submit = () => {
   if (!canSubmit.value || props.saving) return;
   emit('confirm', {
      name: formdata.name,
      description: formdata.description,
      articleIds: formdata.articleIds,
   });
};
</script>

<template>
   <StDrawer global v-model:opened="opened" width="52.5rem">
      <StSpace direction="vertical" gap="0" fill class="text-white">
         <StSpace direction="vertical" gap="1.5rem" fill class="p-6">
            <h1 class="st-font-secondary-bold">
               {{ editing ? '编辑专题' : '新建专题' }}
            </h1>
            <StSpace fill class="relative overflow-auto">
               <StForm
                  :key="formKey"
                  v-model:model-value="formdata"
                  class="w-full absolute top-0 left-0">
                  <StSpace direction="vertical" gap="1.5rem" fill-x>
                     <StFormItem name="name" label="专题名称" required>
                        <StInput
                           v-model:value="formdata.name"
                           placeholder="例如：布局"
                           name="name"
                           :outer-class />
                     </StFormItem>

                     <StFormItem name="description" label="一句话描述">
                        <StTextarea
                           v-model:value="formdata.description"
                           rows="3"
                           placeholder="这个专题讲什么，适合什么阶段的人看"
                           :outer-class />
                     </StFormItem>

                     <StFormItem name="articles" label="引用文章" required>
                        <ReferencedArticlesField v-model:value="formdata.articleIds" />
                     </StFormItem>
                  </StSpace>
               </StForm>
            </StSpace>
         </StSpace>

         <StSpace justify="end" gap="1rem" class="p-4 pt-0 w-full">
            <StButton
               :disabled="!canSubmit || saving"
               :loading="saving"
               @click="submit">
               <StSpace align="center" gap="0.375rem">
                  <BookOne size="1.25rem" />
                  <span>{{ editing ? '保存专题' : '创建专题' }}</span>
               </StSpace>
            </StButton>
         </StSpace>
      </StSpace>
   </StDrawer>
</template>
