import StSpace from '~/components/st/Space/index.vue';
import { LoadingFour, CloseOne, CheckOne } from '@icon-park/vue-next';
import type { $Enums } from '@prisma/client';
import type { FunctionalComponent } from 'vue';

export const DataBlock: FunctionalComponent<{ title: string }> = (
   { title },
   { slots }
) => {
   return (
      <StSpace direction='vertical' gap='0.5rem' class='w-full max-md:!w-[calc(50%-0.75rem)]'>
         <span class='st-font-body-normal text-accent-200'>{title}</span>
         <div class='font-family-manrope font-bold'>{slots.default?.()}</div>
      </StSpace>
   );
};

export const JudgeStatus: FunctionalComponent<{
   status: $Enums.JudgeResult;
}> = ({ status }) => {
   const Icon =
      status === 'pending'
         ? LoadingFour
         : status === 'failed'
         ? CloseOne
         : CheckOne;

   const text =
      status === 'pending' ? '评测中' : status === 'failed' ? '未通过' : '通过';

   const colorClass =
      status === 'pending'
         ? 'text-warning'
         : status === 'failed'
         ? 'text-error'
         : 'text-success';

   return (
      <StSpace
         class={['st-font-body-bold', colorClass]}
         gap='0.25rem'
         align='center'>
         <Icon class={status === 'pending' ? 'animate-spin' : ''} />
         <span class='font-bold'>{text}</span>
      </StSpace>
   );
};

export const Divider = () => <div class='w-full h-[0.0625rem] bg-accent-500' />;
