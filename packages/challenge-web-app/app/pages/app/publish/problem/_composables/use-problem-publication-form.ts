import type { StForm } from '#components';
import type { IRule } from '~/components/st/Form/type';
import type { ISlideRadioGroupOption } from '~/components/st/SlideRadioGroup/type';

// 题目难度选项
const difficultyOptions: ISlideRadioGroupOption[] = [
   { label: '简单', value: 'easy', color: '#A6FB1D' },
   { label: '中等', value: 'medium', color: '#FFBE31' },
   { label: '困难', value: 'hard', color: '#FA7C0E' },
   { label: '非常困难', value: 'very_hard', color: '#FA2F32' },
];

// 封面选项
const coverModeOptions: ISlideRadioGroupOption[] = [
   { label: '使用首屏截图', value: 'default', color: '#FA7C0E' },
   { label: '自定义封面', value: 'custom', color: '#FA7C0E' },
];

export const cloudFunctionOptions: ISlideRadioGroupOption[] = [
   { label: '不使用云函数', value: false, color: '#FA7C0E' },
   { label: '使用云函数', value: true, color: '#C267FF' },
];

// 题型选项：前端（静态站点 + Playwright）与后端服务（常驻进程 + HTTP 判题）
export const problemTypeOptions: ISlideRadioGroupOption[] = [
   { label: '前端题型', value: 'frontend', color: '#1DA1F2' },
   { label: '后端服务题型', value: 'backend_service', color: '#17BF63' },
];

export const useProblemPublicationForm = (storageName: string) => {
   const formdata = useLocalStorage(storageName, {
      title: '',
      detail: '',
      judgeScript: '',
      score: undefined as number | undefined,
      tags: [] as number[],
      difficulty: undefined as
         | 'easy'
         | 'medium'
         | 'hard'
         | 'very_hard'
         | undefined,
      answerTemplate: {} as Record<string, string>,
      referenceAnswer: {} as Record<string, string>,
      coverMode: 'default' as 'default' | 'custom',
      coverImageId: undefined as string | undefined,
      bootCommand: '',
      initCommand: '',
      buildCommand: '',
      judgeUploadPath: '',
      enableCloudFunction: false,
      problemType: 'frontend' as 'frontend' | 'backend_service',
      serviceImage: '',
      servicePort: 3000,
   });
   const draft = useDebounce(formdata, 200);

   const formKey = 'publishForm';
   const form = useTemplateRef<InstanceType<typeof StForm>>(formKey);

   // 表单验证器规则
   const rules = ref<IRule[]>([
      {
         field: 'title',
         required: true,
         validator(value) {
            return value && value.length > 15;
         },
      },
      {
         field: 'detail',
         required: true,
         validator(value) {
            return value && value.length > 0;
         },
      },
      {
         field: 'score',
         required: true,
         validator(value) {
            return value !== undefined && value >= 0;
         },
      },
      {
         field: 'tags',
         required: true,
         validator(value) {
            return value.length > 0;
         },
      },
      {
         field: 'difficulty',
         required: true,
         validator(value) {
            return value !== undefined;
         },
      },
      {
         field: 'enableCloudFunction',
         validator(value) {
            return typeof value === 'boolean';
         },
      },
      {
         field: 'answerTemplate',
         required: true,
         validator(value) {
            return Object.keys(value).length > 0;
         },
      },
      {
         field: 'referenceAnswer',
         required: draft.value.coverMode === 'default',
         validator(value) {
            return Object.keys(value).length > 0;
         },
      },
      {
         field: 'coverMode',
         required: true,
         validator(value) {
            return value !== undefined;
         },
      },
      {
         field: 'coverImageId',
         required: draft.value.coverMode === 'custom',
         validator(value) {
            return draft.value.coverMode === 'default' || value;
         },
      },
      {
         field: 'judgeUploadPath',
         required: true,
         validator(value) {
            return value && value.length > 0;
         },
      },
      {
         field: 'problemType',
         required: true,
         validator(value) {
            return value === 'frontend' || value === 'backend_service';
         },
      },
      {
         field: 'bootCommand',
         required: draft.value.problemType === 'backend_service',
         validator(value) {
            return (
               draft.value.problemType !== 'backend_service' ||
               (typeof value === 'string' && value.trim().length > 0)
            );
         },
      },
      {
         field: 'servicePort',
         required: draft.value.problemType === 'backend_service',
         validator(value) {
            return (
               draft.value.problemType !== 'backend_service' ||
               (typeof value === 'number' && value > 0 && value <= 65535)
            );
         },
      },
   ]);

   return {
      draft,
      formKey,
      form,
      rules,
      difficultyOptions,
      coverModeOptions,
      cloudFunctionOptions,
      problemTypeOptions,
   };
};
