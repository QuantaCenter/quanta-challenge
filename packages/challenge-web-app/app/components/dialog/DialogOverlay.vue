<script setup lang="ts">
import { useDialogManager } from '~/composables/use-dialog';
import ConfirmDialog from '~/components/dialog/ConfirmDialog.vue';
import PromptDialog from '~/components/dialog/PromptDialog.vue';

const { dialogs, close, cancel } = useDialogManager();

const handleBackdropClick = (id: string, cancelable?: boolean) => {
   if (cancelable !== false) {
      cancel(id);
   }
};

const handleConfirm = (id: string, value?: any) => {
   close(id, value);
};
const handleCancel = (id: string) => {
   cancel(id);
};

// 对话框仅客户端产生，SSR 内容恒为空；挂载后再传送到 body（规避 teleport 水合错位）
const teleported = useClientTeleport();
</script>

<template>
   <Teleport to="body" :disabled="!teleported">
      <TransitionGroup name="dialog">
         <div
            v-for="dialog in dialogs"
            :key="dialog.id"
            class="fixed inset-0 z-[10003] flex items-center justify-center p-4">
            <!-- Backdrop -->
            <div
               class="absolute inset-0 bg-background/70 backdrop-blur-sm"
               @click="
                  handleBackdropClick(dialog.id, dialog.options.cancelable)
               " />

            <!-- Dialog Content -->
            <div
               class="relative z-10 w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
               <ConfirmDialog
                  v-if="dialog.type === 'confirm'"
                  :id="dialog.id"
                  :options="dialog.options"
                  @confirm="handleConfirm(dialog.id, true)"
                  @cancel="handleCancel(dialog.id)" />

               <PromptDialog
                  v-else-if="dialog.type === 'prompt'"
                  :id="dialog.id"
                  :options="dialog.options"
                  @confirm="(value) => handleConfirm(dialog.id, value)"
                  @cancel="handleCancel(dialog.id)" />
            </div>
         </div>
      </TransitionGroup>
   </Teleport>
</template>

<style scoped>
.dialog-enter-active,
.dialog-leave-active {
   transition: all 0.2s ease;
}

.dialog-enter-from,
.dialog-leave-to {
   opacity: 0;
}

.dialog-enter-from .relative,
.dialog-leave-to .relative {
   transform: scale(0.95);
}
</style>
