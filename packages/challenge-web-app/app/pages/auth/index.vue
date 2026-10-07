<script setup lang="ts">
/**
 * `/auth` 自身的落地页：跳到登录页。
 *
 * 这个 redirect 刻意放在 index 路由上，而**不是**父级 `auth.vue`。
 * Nuxt 里父路由的 `definePageMeta({ redirect })` 会作用于该父路由下**所有**
 * 子页面，原先写在那里时，`/auth/login`、`/auth/register` 因为有各自的 index
 * 路由而侥幸正常，但任何新增的兄弟页面（如 `/auth/device`）都会被静默 302 到
 * 登录页 —— 服务端不留任何日志，排查成本极高。设备授权页就踩过这个坑。
 */
definePageMeta({
   redirect: '/auth/login',
});
</script>

<template>
   <div />
</template>
