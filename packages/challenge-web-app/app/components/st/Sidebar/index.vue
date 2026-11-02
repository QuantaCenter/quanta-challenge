<script setup lang="ts">
import {
   User,
   CategoryManagement,
   DashboardTwo,
   Ranking,
   SettingTwo,
   TableReport,
   Trophy,
   UploadTwo,
   Comment,
} from '@icon-park/vue-next';
import Logo from '~/components/icon/Logo.vue';
import useAuthStore from '~/stores/auth-store';
import { useFeedbackStore } from '~/stores/feedback-store';

const authStore = useAuthStore();
const role = computed(() => authStore.user?.role ?? 'USER');

// 反馈抽屉开关（跨组件共享，抽屉本体挂在 app-layout 内）
const feedbackStore = useFeedbackStore();
</script>

<template>
   <aside
      class="relative px-8 py-12 flex justify-center w-fit bg-background z-[9999]">
      <Logo class="absolute top-8" />
      <StSpace
         direction="vertical"
         justify="center"
         gap="2rem"
         class="h-full w-full text-[1.5rem]">
         <StSpace
            direction="vertical"
            align="center"
            justify="center"
            class="h-full">
            <StSidebarSidePopper content="仪表盘">
               <StSidebarNavigationButton to="/app/dashboard">
                  <DashboardTwo />
               </StSidebarNavigationButton>
            </StSidebarSidePopper>
            <StSidebarSidePopper content="排行榜">
               <StSidebarNavigationButton to="/app/rankings">
                  <Ranking />
               </StSidebarNavigationButton>
            </StSidebarSidePopper>
            <StSidebarSidePopper content="题目">
               <StSidebarNavigationButton to="/app/problems">
                  <TableReport />
               </StSidebarNavigationButton>
            </StSidebarSidePopper>
            <StSidebarSidePopper v-if="role !== 'USER'" content="发布">
               <StSidebarNavigationButton to="/app/publish">
                  <UploadTwo />
               </StSidebarNavigationButton>
            </StSidebarSidePopper>
            <StSidebarSidePopper v-if="role !== 'USER'" content="管理">
               <StSidebarNavigationButton to="/app/manage">
                  <CategoryManagement />
               </StSidebarNavigationButton>
            </StSidebarSidePopper>
            <StSidebarSidePopper content="成就">
               <StSidebarNavigationButton to="/app/achievements">
                  <Trophy />
               </StSidebarNavigationButton>
            </StSidebarSidePopper>
            <StSidebarSidePopper content="设置">
               <StSidebarNavigationButton to="/app/settings">
                  <SettingTwo />
               </StSidebarNavigationButton>
            </StSidebarSidePopper>
            <StSidebarSidePopper content="反馈">
               <StRippleEffect>
                  <button
                     aria-label="反馈"
                     class="size-[3.5rem] flex shrink-0 items-center justify-center rounded-full bg-accent-600 text-white hover:bg-accent-500 transition-colors cursor-pointer"
                     @click="feedbackStore.open()">
                     <Comment />
                  </button>
               </StRippleEffect>
            </StSidebarSidePopper>
         </StSpace>
         <StSidebarNavigationButton to="/app/space">
            <User />
         </StSidebarNavigationButton>
      </StSpace>
   </aside>
</template>
