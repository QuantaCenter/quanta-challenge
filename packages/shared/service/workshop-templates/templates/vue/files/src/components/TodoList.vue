<script setup lang="ts">
import { computed, ref } from 'vue';

interface Todo {
   id: number;
   text: string;
   done: boolean;
}

const draft = ref('');
const todos = ref<Todo[]>([
   { id: 1, text: '阅读 Vue 文档', done: true },
   { id: 2, text: '在工坊里写一个组件', done: false },
]);

const remaining = computed(() => todos.value.filter((todo) => !todo.done).length);

const addTodo = () => {
   const text = draft.value.trim();
   if (!text) return;
   todos.value.push({ id: Date.now(), text, done: false });
   draft.value = '';
};
</script>

<template>
   <section class="todo">
      <form @submit.prevent="addTodo">
         <input v-model="draft" placeholder="添加一个待办事项" />
         <button type="submit">添加</button>
      </form>
      <ul>
         <li v-for="todo in todos" :key="todo.id" :class="{ done: todo.done }">
            <label>
               <input v-model="todo.done" type="checkbox" />
               {{ todo.text }}
            </label>
         </li>
      </ul>
      <small>剩余 {{ remaining }} 项未完成</small>
   </section>
</template>

<style scoped>
.todo {
   margin-top: 1.5rem;
   padding-top: 1.5rem;
   border-top: 1px solid #272727;
}

form {
   display: flex;
   gap: 0.5rem;
}

form input {
   flex: 1;
   padding: 0.625rem 0.875rem;
   border-radius: 0.625rem;
   border: 1px solid #434343;
   background: #111111;
   color: inherit;
   outline: none;
}

form input:focus {
   border-color: #fa7c0e;
}

form button {
   margin: 0;
}

ul {
   padding: 0;
   list-style: none;
}

li {
   padding: 0.5rem 0;
}

li.done label {
   color: #6d6d6d;
   text-decoration: line-through;
}

small {
   color: #6d6d6d;
}
</style>
