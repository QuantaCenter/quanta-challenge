<script setup lang="ts">
import {
   User,
   CategoryManagement,
   DashboardTwo,
   Ranking,
   BookOpen,
   SettingTwo,
   TableReport,
   Trophy,
   UploadTwo,
} from '@icon-park/vue-next';
import Logo from '~/components/icon/Logo.vue';
import useAuthStore from '~/stores/auth-store';

const authStore = useAuthStore();
const role = computed(() => authStore.user?.role ?? 'USER');
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
            <!-- [learning-preview] 学习课程暂未全量开放：仅对管理员及以上展示入口。只是视觉隐藏，路由与接口不做限制；全量开放时去掉 v-if -->
            <StSidebarSidePopper v-if="role !== 'USER'" content="学习课程">
               <StSidebarNavigationButton to="/app/learning" aria-label="学习课程">
                  <BookOpen />
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
         </StSpace>
         <StSidebarNavigationButton to="/app/space">
            <User />
         </StSidebarNavigationButton>
      </StSpace>
   </aside>
</template>
