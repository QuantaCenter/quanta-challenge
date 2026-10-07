<script setup lang="ts">
/**
 * `/auth/**` 的父级路由，只负责套一层 StMessageProvider。
 *
 * ⚠️ 这里**不能**再写 `definePageMeta({ redirect: '/auth/login' })`。
 *
 * Nuxt 的 `redirect` 是**父路由**层面的声明，会影响该父路由下**所有**子页面：
 * 原先写在这里时，`/auth/login`、`/auth/register` 因为各自有 index 路由而侥幸正常，
 * 但任何新增的兄弟页面（例如 `/auth/device`）都会被静默 302 到登录页 ——
 * 表现为"页面打不开/一直跳登录"，且**服务端日志里什么都看不到**，
 * 非常难排查（本次设备授权页就踩了这个坑）。
 *
 * 需要"访问 /auth 时跳到登录页"的话，用 `pages/auth/index.vue` 承载，
 * 而不是把 redirect 挂在父路由上。
 */
</script>

<template>
   <StMessageProvider>
      <NuxtPage />
   </StMessageProvider>
</template>
