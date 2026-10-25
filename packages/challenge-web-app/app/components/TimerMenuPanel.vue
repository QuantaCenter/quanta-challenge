<script setup lang="ts">
import { Timer, PlayOne, Pause, Refresh } from '@icon-park/vue-next';
import { ref, computed, onUnmounted, watch } from 'vue';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { useMessage } from '~/components/st/Message/use-message';

dayjs.extend(duration);

const message = useMessage();

type TimerMode = 'stopwatch' | 'countdown';
type TimerStatus = 'idle' | 'running' | 'paused';

/**
 * 模式 / 状态变化时通知外层：外层需要用状态给触发按钮着色，
 * 弹出式容器还需要重算高度。
 */
const emit = defineEmits<{ change: [status: TimerStatus] }>();

const currentMode = ref<TimerMode | null>(null);
const timerStatus = ref<TimerStatus>('idle');

watch(timerStatus, (status) => emit('change', status), { immediate: true });
watch(currentMode, () => emit('change', timerStatus.value));

// 倒计时设置（分钟）
const countdownMinutes = ref(25);
const customMinutes = ref(25);

// 时间状态（秒）
const elapsedSeconds = ref(0);
const remainingSeconds = ref(countdownMinutes.value * 60);

// 计时器
let intervalId: ReturnType<typeof setInterval> | null = null;

// 格式化时间显示
const formatTime = (totalSeconds: number) => {
   const dur = dayjs.duration(totalSeconds, 'seconds');
   const hours = Math.floor(dur.asHours());

   if (hours > 0) {
      return dur.format('HH:mm:ss');
   }
   return dur.format('mm:ss');
};

const displayTime = computed(() => {
   if (currentMode.value === 'stopwatch') {
      return formatTime(elapsedSeconds.value);
   } else if (currentMode.value === 'countdown') {
      return formatTime(remainingSeconds.value);
   }
   return '00:00';
});

// 开始计时
const startTimer = () => {
   if (timerStatus.value === 'running') return;

   if (currentMode.value === 'countdown' && remainingSeconds.value <= 0) {
      return;
   }

   timerStatus.value = 'running';

   intervalId = setInterval(() => {
      if (currentMode.value === 'stopwatch') {
         elapsedSeconds.value++;
      } else if (currentMode.value === 'countdown') {
         remainingSeconds.value--;

         if (remainingSeconds.value <= 0) {
            stopTimer();
            // 发送倒计时结束通知
            message.success(
               '倒计时结束！',
               `${countdownMinutes.value} 分钟倒计时已完成`,
               { duration: 5000 },
            );

            // 重置倒计时时间
            remainingSeconds.value = countdownMinutes.value * 60;
         }
      }
   }, 1000);
};

// 暂停计时
const pauseTimer = () => {
   if (timerStatus.value !== 'running') return;

   timerStatus.value = 'paused';
   if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
   }
};

// 停止并重置计时
const stopTimer = () => {
   timerStatus.value = 'idle';
   if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
   }
};

// 重置计时器
const resetTimer = () => {
   stopTimer();
   if (currentMode.value === 'stopwatch') {
      elapsedSeconds.value = 0;
   } else if (currentMode.value === 'countdown') {
      remainingSeconds.value = countdownMinutes.value * 60;
   }
};

// 选择模式
const selectMode = (mode: TimerMode) => {
   if (timerStatus.value !== 'idle') {
      stopTimer();
   }

   currentMode.value = mode;

   if (mode === 'stopwatch') {
      elapsedSeconds.value = 0;
   } else {
      remainingSeconds.value = countdownMinutes.value * 60;
   }
};

// 返回模式选择
const backToModeSelection = () => {
   stopTimer();
   currentMode.value = null;
};

// 设置倒计时时间
const setCountdownTime = (minutes: number) => {
   countdownMinutes.value = minutes;
   if (timerStatus.value === 'idle') {
      remainingSeconds.value = minutes * 60;
   }
};

// 应用自定义时间
const applyCustomTime = () => {
   if (customMinutes.value > 0 && customMinutes.value <= 999) {
      setCountdownTime(customMinutes.value);
   }
};

// 清理
onUnmounted(() => {
   if (intervalId) {
      clearInterval(intervalId);
   }
});

// 快捷时间选项
const quickTimes = [5, 10, 15, 25, 30, 45, 60];

// 进度百分比（用于倒计时）
const progressPercent = computed(() => {
   if (currentMode.value !== 'countdown') return 0;
   const total = countdownMinutes.value * 60;
   return ((total - remainingSeconds.value + 1) / total) * 100;
});
</script>

<template>
   <div class="w-full">
      <div v-if="!currentMode">
         <div class="p-4">
            <h3 class="text-lg font-semibold text-white mb-4">
               选择计时模式
            </h3>

            <button
               @click="selectMode('stopwatch')"
               class="w-full p-4 mb-3 bg-accent-500 hover:bg-accent-400 cursor-pointer rounded-lg transition-all duration-200 text-left group">
               <div class="flex items-center justify-between">
                  <div>
                     <div class="text-white font-medium mb-1">正计时</div>
                     <div class="text-accent-200 text-sm">从零开始计时</div>
                  </div>
                  <Timer
                     class="text-2xl text-success group-hover:scale-110 transition-transform" />
               </div>
            </button>

            <button
               @click="selectMode('countdown')"
               class="w-full p-4 bg-accent-500 hover:bg-accent-400 cursor-pointer rounded-lg transition-all duration-200 text-left group">
               <div class="flex items-center justify-between">
                  <div>
                     <div class="text-white font-medium mb-1">倒计时</div>
                     <div class="text-accent-200 text-sm">设置时间倒数</div>
                  </div>
                  <Timer
                     class="text-2xl text-warning group-hover:scale-110 transition-transform" />
               </div>
            </button>
         </div>
      </div>

      <div v-else-if="currentMode === 'stopwatch'">
         <div class="p-4">
            <div class="flex items-center justify-between mb-4">
               <h3 class="text-lg font-semibold text-white">正计时</h3>
               <button
                  @click="backToModeSelection"
                  class="text-accent-200 cursor-pointer hover:text-white transition-colors text-sm">
                  切换模式
               </button>
            </div>

            <div class="text-center mb-6">
               <div
                  class="text-5xl font-family-manrope font-bold text-success mb-2">
                  {{ displayTime }}
               </div>
               <div class="text-accent-200 text-sm">
                  {{
                     timerStatus === 'running'
                        ? '计时中...'
                        : timerStatus === 'paused'
                          ? '已暂停'
                          : '准备开始'
                  }}
               </div>
            </div>

            <div class="flex gap-2">
               <button
                  v-if="timerStatus !== 'running'"
                  @click="startTimer"
                  class="flex-1 py-3 bg-success hover:bg-success/80 cursor-pointer rounded-lg text-background font-medium transition-colors flex items-center justify-center gap-2">
                  <PlayOne class="text-lg" />
                  {{ timerStatus === 'paused' ? '继续' : '开始' }}
               </button>
               <button
                  v-else
                  @click="pauseTimer"
                  class="flex-1 py-3 cursor-pointer bg-primary hover:bg-primary/80 rounded-lg text-white font-medium transition-colors flex items-center justify-center gap-2">
                  <Pause class="text-lg" />
                  暂停
               </button>
               <button
                  @click="resetTimer"
                  class="py-3 px-4 cursor-pointer bg-accent-500 hover:bg-accent-400 rounded-lg text-white transition-colors">
                  <Refresh class="text-lg" />
               </button>
            </div>
         </div>
      </div>

      <div v-else-if="currentMode === 'countdown'">
         <div class="p-4">
            <div class="flex items-center justify-between mb-4">
               <h3 class="text-lg font-semibold text-white">倒计时</h3>
               <button
                  @click="backToModeSelection"
                  class="text-accent-200 cursor-pointer hover:text-white transition-colors text-sm">
                  切换模式
               </button>
            </div>

            <div class="text-center mb-4">
               <div
                  class="text-5xl font-family-manrope font-bold mb-2"
                  :class="{
                     'text-warning':
                        remainingSeconds > 60 || timerStatus === 'idle',
                     'text-error':
                        remainingSeconds <= 60 && timerStatus === 'running',
                  }">
                  {{ displayTime }}
               </div>
               <div class="text-accent-200 text-sm mb-4">
                  {{
                     timerStatus === 'running'
                        ? '倒计时中...'
                        : timerStatus === 'paused'
                          ? '已暂停'
                          : '准备开始'
                  }}
               </div>

               <div
                  v-if="timerStatus !== 'idle'"
                  class="w-full h-2 bg-accent-500 rounded-full overflow-hidden">
                  <div
                     class="h-full transition-all duration-1000 ease-linear"
                     :class="{
                        'bg-warning': remainingSeconds > 60,
                        'bg-error': remainingSeconds <= 60,
                     }"
                     :style="{
                        width: `${progressPercent}%`,
                     }"></div>
               </div>
            </div>

            <div v-if="timerStatus === 'idle'" class="mb-4">
               <div class="text-accent-200 text-sm mb-2">快速设置</div>
               <div class="flex flex-wrap gap-2 mb-3">
                  <button
                     v-for="time in quickTimes"
                     :key="time"
                     @click="setCountdownTime(time)"
                     class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                     :class="{
                        'bg-primary text-white': countdownMinutes === time,
                        'bg-accent-500 text-accent-200 hover:bg-accent-400 hover:text-white':
                           countdownMinutes !== time,
                     }">
                     {{ time }}分
                  </button>
               </div>

               <div class="flex gap-2">
                  <StInput
                     v-model:value.number="customMinutes"
                     type="number"
                     min="1"
                     max="999"
                     placeholder="自定义分钟"
                     class="!flex-1 !pl-2 !pr-0 !py-1 bg-accent-500 border border-accent-400 rounded-lg text-white placeholder-accent-300 focus:outline-none focus:border-warning transition-colors"
                     @keyup.enter="applyCustomTime" />
                  <button
                     @click="applyCustomTime"
                     class="px-4 py-2 bg-accent-500 hover:bg-accent-400 rounded-lg text-white transition-colors">
                     设置
                  </button>
               </div>
            </div>

            <div class="flex gap-2">
               <button
                  v-if="timerStatus !== 'running'"
                  @click="startTimer"
                  class="flex-1 py-3 bg-warning hover:bg-warning/80 cursor-pointer rounded-lg text-background font-medium transition-colors flex items-center justify-center gap-2">
                  <PlayOne class="text-lg" />
                  {{ timerStatus === 'paused' ? '继续' : '开始' }}
               </button>
               <button
                  v-else
                  @click="pauseTimer"
                  class="flex-1 py-3 bg-primary hover:bg-primary/80 rounded-lg cursor-pointer text-white font-medium transition-colors flex items-center justify-center gap-2">
                  <Pause class="text-lg" />
                  暂停
               </button>
               <button
                  @click="resetTimer"
                  class="py-3 px-4 bg-accent-500 hover:bg-accent-400 rounded-lg cursor-pointer text-white transition-colors">
                  <Refresh class="text-lg" />
               </button>
            </div>
         </div>
      </div>
   </div>
</template>
