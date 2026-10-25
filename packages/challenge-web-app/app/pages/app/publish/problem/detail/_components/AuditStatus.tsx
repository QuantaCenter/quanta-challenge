import StSpace from '~/components/st/Space/index.vue';
import { CheckOne, CloseOne, LoadingFour } from '@icon-park/vue-next';

export const AuditFail = () => {
   return (
      <StSpace align='center' gap='0.375rem' class='text-error'>
         <CloseOne />
         审核失败
      </StSpace>
   );
};

export const AuditSuccess = ({
   iconOnlyOnMobile,
}: {
   iconOnlyOnMobile?: boolean;
}) => {
   return (
      <StSpace align='center' gap='0.375rem' class='text-success'>
         <CheckOne />
         <span class={iconOnlyOnMobile ? 'max-md:hidden' : undefined}>
            审核成功
         </span>
      </StSpace>
   );
};

export const AuditPending = () => {
   return (
      <StSpace align='center' gap='0.375rem' class='text-warning'>
         <LoadingFour class='animate-spin' />
         审核中
      </StSpace>
   );
};
