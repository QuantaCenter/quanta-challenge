<script setup lang="ts">
import { ref } from 'vue';
import TodoList from './components/TodoList.vue';

const count = ref(0);
</script>

<template>
   <main class="card">
      <span class="badge">Vue 3 + TypeScript</span>
      <h1>你好，Vue</h1>
      <p>编辑 <code>src/App.vue</code>，保存后页面会自动热更新。</p>
      <button type="button" @click="count++">点击次数：{{ count }}</button>
      <TodoList />
   </main>
</template>

<style scoped>
.badge {
   display: inline-block;
   padding: 0.25rem 0.75rem;
   border-radius: 999px;
   background: rgba(66, 184, 131, 0.15);
   color: #42b883;
   font-size: 0.75rem;
}
</style>
