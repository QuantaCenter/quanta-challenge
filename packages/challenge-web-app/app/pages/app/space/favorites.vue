<script setup lang="ts">
import { DocDetail, TableReport } from '@icon-park/vue-next';
import { useFavorites } from '~/composables/use-favorites';
import { PassRate, Score, Difficulty } from '../problems/_components/CardInfo';

useSeoMeta({
   title: '收藏 - Quanta Challenge',
   description: '我收藏的题目与文章。',
});

const { problemFavorites, articleFavorites, favoriteCount } = useFavorites();

// 文章是一等实体：收藏页直接进独立文章页，不要求它被某个专题收录
const articleLink = (articleId: number) => `/app/articles/${articleId}`;
</script>

<template>
   <StSpace
      fill
      direction="vertical"
      align="center"
      gap="0"
      class="hide-scrollbar overflow-auto">
      <StSpace fill-y direction="vertical" class="mt-6 w-[65rem]">
         <StSpace align="end" gap="1rem" fill-x>
            <h1 class="text-[2.5rem] font-bold text-white">收藏</h1>
            <span
               class="st-font-caption text-accent-300 bg-accent-600 px-3 py-1 my-2 rounded-full">
               共 {{ favoriteCount }} 项
            </span>
            <NuxtLink
               to="/app/space"
               class="ml-auto mb-3 st-font-caption text-accent-300 hover:text-secondary transition-colors">
               返回个人空间
            </NuxtLink>
         </StSpace>

         <StSpace align="center" gap="0.625rem" class="mt-8">
            <TableReport class="text-[1.375rem] text-accent-200" />
            <h2 class="st-font-third-bold text-white">题目</h2>
            <span
               class="st-font-tooltip text-accent-300 bg-accent-600 px-2 py-0.5 rounded-full">
               {{ problemFavorites.length }} 道
            </span>
         </StSpace>

         <StGrid
            v-if="problemFavorites.length"
            fill-x
            :cols="4"
            gap="1.25rem"
            class="mt-4">
            <div
               v-for="problem in problemFavorites"
               :key="problem.key"
               class="relative">
               <!-- 收藏里可能只有版本号（题目被收藏时接口还没给题号），那就只展示不跳转 -->
               <component
                  :is="problem.pid ? 'a' : 'div'"
                  class="block h-fit"
                  :href="problem.pid ? `/challenge/editor/${problem.pid}` : undefined"
                  :target="problem.pid ? '_blank' : undefined">
                  <StProblemCard
                     class="w-full h-fit"
                     :cover-image-name="problem.imageName"
                     :cover-image-thumbhash="problem.imageHash"
                     :cover-image-thumbhash-url="problem.imageThumbhashUrl">
                     <StProblemCardTitle :title="problem.title" />
                     <StProblemCardDivider />
                     <StProblemCardInfo class="pb-3 px-2">
                        <StProblemCardInfoItem title="分数">
                           <Score :score="problem.totalScore ?? 0" />
                        </StProblemCardInfoItem>
                        <StProblemCardInfoItem title="难度" center>
                           <Difficulty
                              :difficulty="problem.difficulty ?? 'medium'" />
                        </StProblemCardInfoItem>
                        <StProblemCardInfoItem title="通过率">
                           <PassRate :rate="problem.passRate ?? 0" />
                        </StProblemCardInfoItem>
                     </StProblemCardInfo>
                  </StProblemCard>
               </component>

               <LearningFavoriteButton
                  kind="problem"
                  :target="problem"
                  raised
                  class="absolute right-3 top-3 z-10" />
            </div>
         </StGrid>

         <StEmptyStatus
            v-else
            content="还没有收藏题目，去题库点星标试试"
            class="py-10" />

         <StSpace align="center" gap="0.625rem" class="mt-10">
            <DocDetail class="text-[1.375rem] text-accent-200" />
            <h2 class="st-font-third-bold text-white">文章</h2>
            <span
               class="st-font-tooltip text-accent-300 bg-accent-600 px-2 py-0.5 rounded-full">
               {{ articleFavorites.length }} 篇
            </span>
         </StSpace>

         <StGrid
            v-if="articleFavorites.length"
            fill-x
            :cols="4"
            gap="1rem"
            class="mt-4">
            <LearningArticleCard
               v-for="article in articleFavorites"
               :key="article.articleId"
               :favorite="article"
               :to="articleLink(article.articleId)" />
         </StGrid>

         <StEmptyStatus
            v-else
            content="还没有收藏文章，去专题页点星标试试"
            class="py-10" />

         <StSpacer fill flex no-shrink height="4rem" />
      </StSpace>
   </StSpace>
</template>

<style scoped src="@/assets/css/utils.css" />
