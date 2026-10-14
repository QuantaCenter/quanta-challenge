<script setup lang="ts">
import { Like, Return, Star } from '@icon-park/vue-next';
import { useMessage } from '~/components/st/Message/use-message';
import { useArticleLikes } from '~/composables/use-article-likes';
import {
   toFavoriteArticle,
   useFavorites,
} from '~/composables/use-favorites';
import type { LearningArticle } from '~/composables/use-learning';

/**
 * 文章页右下角的悬浮操作：点赞 / 收藏 / 返回。
 *
 * 形态对齐发布详情页的悬浮按钮（`StFixed` + 左侧气泡提示的圆形按钮）。
 */
const props = defineProps<{
   article: LearningArticle;
   /** 返回目标：有专题回专题，否则回全部文章 */
   backTo: string;
}>();

const favorites = useFavorites();
const likes = useArticleLikes();
const message = useMessage();

const liked = computed(() => likes.isLiked(props.article.id));
const favorited = computed(() =>
   favorites.isArticleFavorite(props.article.id),
);

const handleLike = () => {
   const next = likes.toggle(props.article.id);
   message.success(next ? '点赞成功' : '已取消点赞');
};

const handleFavorite = () => {
   const next = !favorited.value;
   favorites.toggleArticle(toFavoriteArticle(props.article));
   message.success(next ? '收藏成功' : '取消收藏成功');
};

const handleBack = () => navigateTo(props.backTo);
</script>

<template>
   <StFixed right="1.82rem" bottom="1.82rem">
      <StSpace direction="vertical" gap="1.2rem" align="center">
         <!-- 点赞 -->
         <StPopover placement="left">
            <template #popper="{ triggered }">
               <div
                  class="px-3 py-2 rounded-lg bg-accent-600 text-white transition-all text-nowrap"
                  :class="[triggered ? 'translate-x-0' : 'translate-x-2']">
                  {{ liked ? '取消点赞' : '点赞' }}
               </div>
            </template>
            <StSpace
               center
               class="article-action size-[4.5rem] rounded-full bg-accent-600 text-accent-200 outline-1 outline-transparent hover:outline-secondary hover:text-white transition-all cursor-pointer"
               :style="{ animationDelay: '0ms' }"
               @click="handleLike">
               <Like
                  size="2rem"
                  :strokeWidth="3"
                  :theme="liked ? 'filled' : 'outline'"
                  :fill="liked ? '#fa2f32' : undefined" />
            </StSpace>
         </StPopover>

         <!-- 收藏 -->
         <StPopover placement="left">
            <template #popper="{ triggered }">
               <div
                  class="px-3 py-2 rounded-lg bg-accent-600 text-white transition-all text-nowrap"
                  :class="[triggered ? 'translate-x-0' : 'translate-x-2']">
                  {{ favorited ? '取消收藏' : '收藏' }}
               </div>
            </template>
            <StSpace
               center
               class="article-action size-[4.5rem] rounded-full bg-accent-600 outline-1 outline-transparent hover:outline-secondary transition-all cursor-pointer"
               :style="{ animationDelay: '80ms' }"
               @click="handleFavorite">
               <Star
                  size="2rem"
                  theme="two-tone"
                  :strokeWidth="3"
                  :fill="
                     favorited
                        ? ['#a6fb1d', '#a6fb1d']
                        : ['#bdbdbd', 'transparent']
                  " />
            </StSpace>
         </StPopover>

         <!-- 返回 -->
         <StPopover placement="left">
            <template #popper="{ triggered }">
               <div
                  class="px-3 py-2 rounded-lg bg-accent-600 text-white transition-all text-nowrap"
                  :class="[triggered ? 'translate-x-0' : 'translate-x-2']">
                  返回
               </div>
            </template>
            <StSpace
               center
               class="article-action size-[4.5rem] rounded-full bg-accent-600 text-accent-200 outline-1 outline-transparent hover:outline-secondary hover:text-white transition-all cursor-pointer"
               :style="{ animationDelay: '160ms' }"
               @click="handleBack">
               <Return size="2rem" :strokeWidth="3" />
            </StSpace>
         </StPopover>
      </StSpace>
   </StFixed>
</template>

<style scoped>
/* 逐个淡入上浮：SSR 首帧即处于起始态（animation-fill-mode: both），不会闪一下 */
@keyframes article-action-in {
   from {
      opacity: 0;
      transform: translateY(0.75rem);
   }
   to {
      opacity: 1;
      transform: translateY(0);
   }
}

.article-action {
   animation: article-action-in 0.6s ease-out both;
}
</style>
