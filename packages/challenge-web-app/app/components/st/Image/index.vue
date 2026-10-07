<script setup lang="ts">
import { ErrorPicture } from '@icon-park/vue-next';
import { thumbhashToDataUrl } from '@challenge/shared/thumbhash/data-url';

const props = defineProps<{
   src: string;
   /** base64 编码的 thumbhash，用于在原图下载期间渲染占位图 */
   thumbhash?: string | null;
   alt?: string;
   object?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
   width?: string | number;
   height?: string | number;
   lazy?: boolean;
}>();

const errorLoading = ref(props.src === '' ? true : false);

const thumbhashUrl = computed(() =>
   props.thumbhash ? thumbhashToDataUrl(props.thumbhash) : ''
);
// 原图是否已完整加载；加载完成前不挂载 src，避免浏览器边下边显示
const imageReady = ref(false);

const style = computed(() => {
   return {
      width: typeof props.width === 'number' ? `${props.width}px` : props.width,
      height:
         typeof props.height === 'number' ? `${props.height}px` : props.height,
   };
});

const objectClass = computed(() => ({
   'object-cover': !props.object || props.object === 'cover',
   'object-contain': props.object === 'contain',
   'object-fill': props.object === 'fill',
   'object-none': props.object === 'none',
   'object-scale-down': props.object === 'scale-down',
}));

let loadToken = 0;

const nextPaint = () =>
   new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
   });

const loadImage = async () => {
   if (!import.meta.client) return;

   const token = ++loadToken;
   const src = props.src;

   if (!src) {
      imageReady.value = false;
      errorLoading.value = true;
      return;
   }
   errorLoading.value = false;

   // lazy 场景交给浏览器原生 loading="lazy"，不做预载门控
   if (props.lazy) {
      imageReady.value = true;
      return;
   }

   imageReady.value = false;

   const image = new Image();
   const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
   });
   image.src = src;

   try {
      await loaded;
   } catch {
      if (token === loadToken) errorLoading.value = true;
      return;
   }

   if (token !== loadToken) return;

   // 关键：先让占位图（或空白态）绘制一帧，再切换为原图
   await nextPaint();

   if (token === loadToken) imageReady.value = true;
};

onMounted(() => {
   void loadImage();
});

watch(
   () => props.src,
   () => {
      void loadImage();
   }
);

onBeforeUnmount(() => {
   // 让挂起的预载回调失效，避免卸载后写入状态
   loadToken++;
});
</script>

<template>
   <!-- 有 thumbhash：占位图在下、原图在上，原图加载完成后渐显 -->
   <div
      v-if="thumbhash && !errorLoading"
      class="relative"
      :style="style"
      v-bind="$attrs">
      <img
         v-if="thumbhashUrl"
         :src="thumbhashUrl"
         aria-hidden="true"
         draggable="false"
         class="absolute inset-0 h-full w-full rounded-lg"
         :class="objectClass" />
      <img
         :src="imageReady ? src : undefined"
         :alt="imageReady ? alt : ''"
         class="relative h-full w-full rounded-lg transition-opacity duration-200 ease-out"
         :class="[objectClass, imageReady ? 'opacity-100' : 'opacity-0']"
         @error="errorLoading = true" />
   </div>

   <!-- 无 thumbhash：保持原有的单图结构 -->
   <img
      v-else-if="!errorLoading"
      :src="imageReady ? src : undefined"
      :alt="imageReady ? alt : ''"
      :loading="lazy ? 'lazy' : 'eager'"
      class="h-full w-full rounded-lg transition-opacity duration-200 ease-out"
      :class="[objectClass, imageReady ? 'opacity-100' : 'opacity-0']"
      :style="style"
      @error="errorLoading = true"
      v-bind="$attrs" />

   <slot v-else name="fallback" :style>
      <StSpace
         fill
         center
         class="rounded-lg bg-accent-500 text-accent-400"
         :style="style"
         v-bind="$attrs">
         <ErrorPicture size="2rem" />
      </StSpace>
   </slot>
</template>
