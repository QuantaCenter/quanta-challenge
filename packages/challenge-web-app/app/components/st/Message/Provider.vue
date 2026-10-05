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

const addMessage = (options: AddMessageOptions): MessageOperation => {
   const id = crypto.randomUUID();
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
         class="w-screen h-screen fixed top-0 left-0 pointer-events-none z-[10000]">
         <div
            class="absolute bottom-4 right-4 pointer-events-auto flex flex-col justify-end items-end gap-2 h-screen overflow-auto">
            <TransitionGroup name="message" appear>
               <div v-for="msg in messages" :key="msg.id">
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

.message-enter-active,
.message-leave-active {
   transition: all 0.3s ease;
}

.message-move {
   transition: all 0.3s ease;
}
</style>
