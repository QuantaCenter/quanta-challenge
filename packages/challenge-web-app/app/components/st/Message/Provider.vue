<script setup lang="ts">
import StMessageItem from './Item.vue';
import type {
   AddMessageOptions,
   CustomMessage,
   Message,
   MessageOperation,
} from './type';
import { ADD_MESSAGE_OUTSIDE_VUE_KEY, ADD_MESSAGE_KEY } from './use-message';

const messages = ref<(Message | CustomMessage)[]>([]);

// crypto.randomUUID 只在安全上下文（HTTPS/localhost）暴露；移动端经局域网
// http://IP 调试时不存在，降级为时间戳+随机串（仅用于消息 id，无需密码学强度）
const genId = (): string => {
   if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
   }
   return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const addMessage = (options: AddMessageOptions): MessageOperation => {
   const id = genId();
   messages.value.push({ ...options, id });
   const trackedMessage = messages.value[messages.value.length - 1]!;

   if (!options.loading && options.duration !== 0) {
      setTimeout(() => {
         if (operation.closed) return;
         messages.value = messages.value.filter((i) => i.id !== id);
         operation.closed = true;
      }, options.duration ?? 3000);
   }

   const operation: MessageOperation = {
      id,
      message: trackedMessage,
      close() {
         messages.value = messages.value.filter((i) => i.id !== id);
         operation.closed = true;
      },
      unloading() {
         trackedMessage.loading = true;
         if (trackedMessage.duration !== 0) {
            setTimeout(() => {
               if (operation.closed) return;
               messages.value = messages.value.filter((i) => i.id !== id);
               operation.closed = true;
            }, trackedMessage.duration ?? 3000);
         }
      },
      closed: false,
   };

   return operation;
};

const isCustomMessage = (
   msg: Message | CustomMessage
): msg is CustomMessage => {
   return 'render' in msg;
};

provide(ADD_MESSAGE_KEY, addMessage);

onMounted(() => {
   if (!Object.hasOwn(globalThis, ADD_MESSAGE_OUTSIDE_VUE_KEY)) {
      Object.defineProperty(globalThis, ADD_MESSAGE_OUTSIDE_VUE_KEY, {
         value: addMessage,
         writable: false,
         configurable: false,
         enumerable: false,
      });
   }
});

onUnmounted(() => {
   const globalThis = window as any;
   if (
      Object.hasOwn(globalThis, ADD_MESSAGE_OUTSIDE_VUE_KEY) &&
      globalThis[ADD_MESSAGE_OUTSIDE_VUE_KEY] === addMessage
   ) {
      delete globalThis[ADD_MESSAGE_OUTSIDE_VUE_KEY];
   }
});
</script>

<template>
   <Teleport to="body">
      <div
         id="st-message-portal"
         class="fixed inset-0 pointer-events-none z-[10000]">
         <!-- 容器本身不接鼠标事件（继承外层的 pointer-events-none），只有每条消息自己接，
              否则这条通屏高的盒子会把右侧一整列的点击全吃掉 -->
         <div
             class="absolute bottom-0 right-4 flex max-h-[calc(100vh-2rem)] flex-col justify-end items-end gap-2 overflow-x-hidden overflow-y-auto overscroll-contain pb-4 max-md:top-0 max-md:bottom-auto max-md:right-0 max-md:left-0 max-md:items-center max-md:justify-start max-md:pt-4 max-md:pb-0">
            <TransitionGroup name="message" appear>
               <div v-for="msg in messages" :key="msg.id" class="pointer-events-auto">
                  <Component
                     v-if="isCustomMessage(msg)"
                     :is="msg.render"
                     :message="msg"
                     @close="
                        () => {
                           messages = messages.filter((m) => m.id !== msg.id);
                        }
                     ">
                  </Component>
                  <StMessageItem
                     v-else
                     :type="msg.type ?? 'info'"
                     :title="msg.title"
                     :closable="msg.closable ?? true"
                     :loading="msg.loading ?? false"
                     :close-text="msg.closeText"
                     :content="msg.content"
                     @close="
                        () => {
                           messages = messages.filter((m) => m.id !== msg.id);
                        }
                     ">
                  </StMessageItem>
               </div>
            </TransitionGroup>
         </div>
      </div>
   </Teleport>
   <slot></slot>
</template>

<style scoped>
.message-enter-from {
   opacity: 0;
   transform: translateX(100%);
}

.message-leave-to {
   opacity: 0;
   transform: translateY(1rem);
}

/* 移动端消息在顶部居中：改为从上方滑入/向上滑出 */
@media (max-width: 767.98px) {
   .message-enter-from,
   .message-leave-to {
      opacity: 0;
      transform: translateY(-1rem);
   }
}

.message-enter-active,
.message-leave-active {
   transition: all 0.3s ease;
}

.message-move {
   transition: all 0.3s ease;
}
</style>
