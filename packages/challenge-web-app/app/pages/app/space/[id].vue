<script setup lang="ts">
import DEFAULT_SPACE_URL from '~/assets/images/default-space-banner.png';
import DEFAULT_AVATAR_URL from '@/assets/images/default-avatar.png';
import {
   BirthdayCake,
   BookmarkOne,
   Mail,
   PeopleBottomCard,
   Right,
   School,
   Config,
   Edit,
   CheckOne,
   Scoreboard,
   RockGesture,
   History,
   Box,
} from '@icon-park/vue-next';
import SubmissionStatusCard from '../dashboard/_modules/SubmissionStatusCard.vue';
import AchievementsCard from '../dashboard/_modules/AchievementsCard.vue';
import UserInfoEditDrawer from './_drawers/UserInfoEditDrawer.vue';
import SpaceConfigDrawer from './_drawers/SpaceConfigDrawer.vue';
import dayjs from 'dayjs';
import useAuthStore from '~/stores/auth-store';
import { useFavorites } from '~/composables/use-favorites';
import { PassRate, Score, Difficulty } from '../problems/_components/CardInfo';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const { $trpc } = useNuxtApp();

// 获取路由参数中的 id（实际是 name）
const userName = computed(() => route.params.id as string);

// 判断是否是查看自己的空间
const isOwnSpace = computed(() => userName.value === authStore.user?.name);

useSeoMeta({ title: `${userName.value}的个人空间 - Quanta Challenge` });

const editDrawerOpened = ref(false);
const configDialogOpened = ref(false);

// 名片下方的收藏入口：收藏是自己的，只有本人空间才显示
const { problemFavorites, articleFavorites } = useFavorites();

const openEditDrawer = () => {
   editDrawerOpened.value = true;
};

const openConfigDialog = () => {
   configDialogOpened.value = true;
};

const infoLabelMapping = {
   birthday: '生日',
   email: '邮箱',
   identifier: '身份',
   major: '学院',
};

const iconMapping = {
   birthday: BirthdayCake,
   email: Mail,
   identifier: PeopleBottomCard,
   major: School,
} as const;

type IconKey = keyof typeof iconMapping;

// 获取目标用户的信息
const { data: targetUser, refresh: refreshTargetUser } = await useAsyncData(
   `get-user-by-name-${userName.value}`,
   () => $trpc.protected.user.getUserByName.query({ name: userName.value }),
   {
      watch: [userName],
   },
);

// 获取用户的空间配置
const { data: spaceConfig, refresh: refreshSpaceConfig } = await useAsyncData(
   `get-user-space-config-${userName.value}`,
   () =>
      $trpc.protected.user.getUserSpaceConfig.query({ name: userName.value }),
   {
      watch: [userName],
   },
);

// 获取用户提交状态
const { data: commitStatistics } = await useAsyncData(
   `get-user-commit-status-${userName.value}`,
   () =>
      $trpc.protected.user.getCommitStatistic.query({ name: userName.value }),
   {
      watch: [userName],
   },
);

// 获取最近提交的题目
const { data: recentProblems } = await useAsyncData(
   `get-user-recent-problems-${userName.value}`,
   () => $trpc.protected.user.getRecentProblems.query({ name: userName.value }),
   {
      watch: [userName],
   },
);

// 安全获取可见性配置
const getVisibility = (field: string): boolean => {
   try {
      if (!spaceConfig.value) return true;
      const config: any = spaceConfig.value;
      const vis = config.personalInfoVisibility;
      if (vis && typeof vis === 'object' && field in vis) {
         return vis[field] === true;
      }
      return true;
   } catch {
      return true;
   }
};

// 转换用户信息为展示格式
const userInfo = computed(() => {
   if (!targetUser.value?.UserInfo) return [];

   const info = targetUser.value.UserInfo;

   const allInfo = [
      {
         label: infoLabelMapping.birthday,
         value: info.birthday
            ? dayjs(info.birthday).format('YYYY-MM-DD')
            : '--',
         iconKey: 'birthday' as IconKey,
         visible: getVisibility('birthday'),
      },
      {
         label: infoLabelMapping.email,
         value: info.email || '--',
         iconKey: 'email' as IconKey,
         visible: getVisibility('email'),
      },
      {
         label: infoLabelMapping.identifier,
         value: info.identifier || '--',
         iconKey: 'identifier' as IconKey,
         visible: getVisibility('identifier'),
      },
      {
         label: infoLabelMapping.major,
         value: info.major || '--',
         iconKey: 'major' as IconKey,
         visible: getVisibility('major'),
      },
   ];

   // 如果是自己的空间，显示所有信息；否则只显示配置为可见的信息
   return isOwnSpace.value ? allInfo : allInfo.filter((item) => item.visible);
});

// 为了兼容编辑功能，保留获取自己信息的接口（仅在查看自己空间时调用）
const { data: rawUserInfo, refresh: refreshRawUserInfo } = await useAsyncData(
   'get-raw-user-info',
   () =>
      isOwnSpace.value
         ? $trpc.protected.user.getUserInfo.query()
         : Promise.resolve(null),
   {
      watch: [isOwnSpace],
   },
);

const handleUserInfoUpdated = async () => {
   await refreshTargetUser();
   await refreshRawUserInfo();
};

const handleSpaceConfigUpdated = async () => {
   await refreshSpaceConfig();
};

const width = ref(24);

const scrollContainer = useTemplateRef('scrollContainer');
const showEndMask = ref(true);
onMounted(() => {
   if (!scrollContainer.value) return;
   const el = scrollContainer.value.$el as HTMLElement;
   el.addEventListener('scroll', () => {
      showEndMask.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 8;
   });
});
</script>

<template>
   <StSpace fill justify="center" class="overflow-y-auto overflow-x-hidden">
      <StSpace fill justify="center" direction="horizontal">
         <StSpace
            direction="vertical"
            gap="0.5rem"
            :style="{ width: `${width}rem` }"
            class="p-[0.5rem] pb-4 mt-[2rem] bg-accent-600 rounded-[1.5rem]">
            <StSpace fill-x direction="vertical">
               <StImage
                  :src="targetUser?.bannerImageUrl || DEFAULT_SPACE_URL"
                  height="10rem"
                  :width="`${width - 1.1}rem`"
                  class="rounded-t-[1rem] rounded-b-none object-top absolute"
                  object="cover" />
               <StSpace
                  class="px-[1.5rem] pr-[1rem] mt-[4rem] z-5 relative"
                  gap="1rem"
                  align="end"
                  fill-x>
                  <StSpace class="relative shrink-0">
                     <div
                        class="size-[7.5rem] rounded-[1rem] bg-gradient-to-br from-accent-600 to-accent-500 shadow-lg shadow-accent-700/30 absolute -left-1 -top-1"></div>
                     <StImage
                        :src="targetUser?.avatarUrl || DEFAULT_AVATAR_URL"
                        width="7rem"
                        height="7rem"
                        class="!rounded-[0.75rem] z-50"
                        object="cover" />
                  </StSpace>
               </StSpace>
            </StSpace>

            <StSpace class="px-3 py-2" fill-x justify="between" align="center">
               <StSpace
                  direction="horizontal"
                  align="center"
                  gap="0.5rem"
                  class="flex-wrap">
                  <div
                     class="st-font-third-bold font-family-manrope text-3xl text-shadow-sm tracking-wide">
                     {{ targetUser?.displayName ?? targetUser?.name }}
                  </div>
                  <div
                     class="st-font-body-caption text-sm border border-primary py-0.5 px-2 rounded-md text-primary bg-primary/5">
                     20th 前端工程师
                  </div>
               </StSpace>

               <StSpace v-if="isOwnSpace" gap="1rem">
                  <Edit
                     @click="openEditDrawer"
                     :size="24"
                     :strokeWidth="3"
                     class="text-secondary hover:text-secondary/50 cursor-pointer transition-colors" />
                  <Config
                     @click="openConfigDialog"
                     :size="24"
                     :strokeWidth="3"
                     class="text-secondary hover:text-secondary/50 cursor-pointer transition-colors" />
               </StSpace>
            </StSpace>

            <StSpace class="p-4 pt-0">
               <div class="st-font-body-normal">
                  {{ targetUser?.UserInfo?.bio || '这个人没有任何个性签名。' }}
               </div>
            </StSpace>

            <div
               v-if="userInfo.length > 0"
               class="h-[1px] w-full bg-accent-500" />

            <StGrid
               v-if="userInfo.length > 0"
               :cols="1"
               fill-x
               class="p-4 !gap-x-0">
               <StSpace
                  v-for="(item, idx) in userInfo"
                  :key="idx"
                  align="center"
                  gap="6px"
                  class="st-font-body-normal">
                  <component
                     :is="iconMapping[item.iconKey]"
                     class="text-accent-200"
                     :strokeWidth="3"
                     :size="20" />
                  <span class="text-accent-200">{{ item.label }}：</span>
                  <span>{{ item.value }}</span>
               </StSpace>
            </StGrid>

            <NuxtLink
               v-if="isOwnSpace"
               to="/app/space/favorites"
               class="w-full">
               <div
                  class="mx-3 mb-4 p-4 rounded-[1rem] bg-accent-500/60 hover:bg-accent-500 transition-colors flex items-center gap-3">
                  <BookmarkOne
                     class="shrink-0 text-secondary"
                     size="1.25rem"
                     :strokeWidth="3" />
                  <StSpace direction="vertical" gap="0.25rem" class="min-w-0 flex-1">
                     <span class="st-font-body-bold text-accent-100">
                        我的收藏
                     </span>
                     <span class="st-font-tooltip text-accent-300">
                        {{ problemFavorites.length }} 道题 ·
                        {{ articleFavorites.length }} 篇文章
                     </span>
                  </StSpace>
                  <Right class="shrink-0 text-accent-400" size="0.875rem" />
               </div>
            </NuxtLink>
         </StSpace>

         <StSpace direction="vertical" class="my-8" :style="{ width: `44rem` }">
            <StSpace fill>
               <StSpace
                  fill
                  direction="vertical"
                  gap="0rem"
                  class="relative overflow-hidden bg-gradient-to-br from-accent-600 via-accent-600 to-accent-500 rounded-[1rem] px-6 py-4">
                  <div class="font-family-manrope st-font-third-bold">
                     {{ commitStatistics?.correctRate ?? 0
                     }}<span class="font-family-fira-code text-xl ml-0.5"
                        >%</span
                     >
                  </div>
                  <div class="text-accent-100">正确率</div>
                  <div
                     class="absolute -right-2 -bottom-4 rotate-12 text-secondary opacity-75">
                     <CheckOne size="64" />
                  </div>
               </StSpace>
               <StSpace
                  fill
                  direction="vertical"
                  gap="0rem"
                  class="relative overflow-hidden bg-gradient-to-br from-accent-600 via-accent-600 to-accent-500 rounded-[1rem] px-6 py-4">
                  <div class="font-family-manrope st-font-third-bold">
                     {{ commitStatistics?.score ?? 0 }}
                  </div>
                  <div class="text-accent-100">总得分</div>
                  <div
                     class="absolute -right-2 -bottom-4 rotate-12 text-warning opacity-75">
                     <Scoreboard size="64" />
                  </div>
               </StSpace>
               <StSpace
                  fill
                  direction="vertical"
                  gap="0rem"
                  class="relative overflow-hidden bg-gradient-to-br from-accent-600 via-accent-600 to-accent-500 rounded-[1rem] px-6 py-4">
                  <div class="font-family-manrope st-font-third-bold">
                     {{ commitStatistics?.passCount ?? 0 }}
                  </div>
                  <div class="text-accent-100">通过数</div>
                  <div
                     class="absolute -right-2 -bottom-4 rotate-12 text-blue-500 opacity-75">
                     <RockGesture size="64" />
                  </div>
               </StSpace>
            </StSpace>

            <StSpace
               v-if="recentProblems && recentProblems.length > 0"
               fill-x
               direction="vertical"
               gap="0.25rem"
               class="relative">
               <StSpace direction="horizontal" align="center" gap="0.5rem">
                  <History size="20" />
                  <div class="st-font-secondary-bold text-lg">
                     最近提交的题目
                  </div>
               </StSpace>
               <StSpace
                  ref="scrollContainer"
                  fill-x
                  direction="horizontal"
                  class="overflow-x-auto">
                  <StSpace class="shrink-0" gap="0.5rem" fill-x>
                     <a
                        v-for="(problem, idx) in recentProblems"
                        class="h-fit"
                        target="_blank"
                        :style="{ viewTransitionName: `card-${problem.pid}` }"
                        :key="idx"
                        :href="`/challenge/editor/${problem.pid}`">
                        <StProblemCard
                           imgHeight="7.5rem"
                           class="!w-[15rem] h-fit"
                           :cover-image-name="problem.imageName"
                           :cover-image-thumbhash="problem.imageHash"
                           :cover-image-thumbhash-url="problem.imageThumbhashUrl">
                           <StProblemCardTitle
                              :title="problem.title ?? '匿名题目'" />
                           <StProblemCardTags :tags="problem.tags ?? []" />
                           <StProblemCardDivider />
                           <StProblemCardInfo
                              class="pb-3"
                              :class="{
                                 'px-2': problem.difficulty !== 'very_hard',
                              }">
                              <StProblemCardInfoItem title="通过率">
                                 <PassRate :rate="problem.passRate!" />
                              </StProblemCardInfoItem>
                              <StProblemCardInfoItem title="分数">
                                 <Score :score="problem.totalScore!" />
                              </StProblemCardInfoItem>
                              <StProblemCardInfoItem title="难度" center>
                                 <Difficulty
                                    :difficulty="problem.difficulty!" />
                              </StProblemCardInfoItem>
                           </StProblemCardInfo>
                        </StProblemCard>
                     </a>
                  </StSpace>
               </StSpace>
               <div
                  :class="[showEndMask ? 'opacity-100' : 'opacity-0']"
                  class="absolute bottom-0 h-full w-4 bg-gradient-to-l right-0 from-accent-700 via-accent-070/70 to-transparent transition-opacity"></div>
            </StSpace>

            <StSpace
               fill-x
               direction="vertical"
               gap="0.75rem"
               class="p-[0.5rem] bg-accent-600 rounded-[1rem] relative">
               <SubmissionStatusCard
                  v-if="isOwnSpace || spaceConfig?.showSubmissionStatus"
                  status="personal-space"
                  :is-visitor="!isOwnSpace"
                  :username="targetUser?.name"
                  class="!mt-0 min-h-[18.625rem]" />

               <div
                  v-if="isOwnSpace || spaceConfig?.showAchievements"
                  class="h-[1px] w-full bg-accent-500" />

               <AchievementsCard
                  v-if="isOwnSpace || spaceConfig?.showAchievements"
                  status="personal-space"
                  :is-visitor="!isOwnSpace"
                  :username="targetUser?.name"
                  class="!min-h-[16rem]" />
            </StSpace>
         </StSpace>
      </StSpace>

      <!-- 编辑用户信息 Drawer -->
      <UserInfoEditDrawer
         v-model:opened="editDrawerOpened"
         @updated="handleUserInfoUpdated" />

      <!-- 空间配置 Drawer -->
      <SpaceConfigDrawer
         v-model:opened="configDialogOpened"
         @updated="handleSpaceConfigUpdated" />
   </StSpace>
</template>
