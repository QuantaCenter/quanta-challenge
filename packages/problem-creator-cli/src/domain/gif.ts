import sharp from 'sharp';

/** GIF 的时间单位是 10ms；小于 20ms 的帧会被浏览器当成 100ms 播放 */
const DELAY_UNIT_MS = 10;
const MIN_DELAY_MS = 20;

export interface TimedFrame {
   image: Buffer;
   /** 相对录制开始的毫秒数 */
   at: number;
}

export interface SourceFrame {
   image: Buffer;
   durationMs: number;
}

export interface EncodeGifOptions {
   /** 输出宽度上限（只缩小不放大） */
   width?: number;
   colors: number;
   background: string;
}

export interface EncodedGif {
   gif: Buffer;
   /** 最后一帧的 PNG，用作静态兜底 */
   poster: Buffer;
   width: number;
   height: number;
   frames: number;
   durationMs: number;
}

/** 按固定帧率重采样：每个采样点取不晚于它的最近一帧，相邻同源帧合并停留时间。 */
export const resampleTimeline = (
   captured: TimedFrame[],
   fps: number,
   durationMs: number,
): SourceFrame[] => {
   const sorted = [...captured].sort((a, b) => a.at - b.at);
   const step = 1000 / fps;
   const count = Math.max(1, Math.round(durationMs / step));
   const result: SourceFrame[] = [];
   let index = 0;
   for (let i = 0; i < count; i++) {
      const t = i * step;
      while (index + 1 < sorted.length && (sorted[index + 1]?.at ?? 0) <= t) {
         index++;
      }
      const image = sorted[index]?.image;
      if (!image) break;
      const last = result.at(-1);
      if (last?.image === image) last.durationMs += step;
      else result.push({ image, durationMs: step });
   }
   return result;
};

/** 停留时间取整到 10ms，误差累到后面的帧，避免整体越播越慢。 */
export const quantizeDelays = (durations: number[]): number[] => {
   let elapsed = 0;
   let emitted = 0;
   return durations.map((duration) => {
      elapsed += duration;
      const delay = Math.max(
         MIN_DELAY_MS,
         Math.round((elapsed - emitted) / DELAY_UNIT_MS) * DELAY_UNIT_MS,
      );
      emitted += delay;
      return delay;
   });
};

export const encodeGif = async (
   frames: SourceFrame[],
   options: EncodeGifOptions,
): Promise<EncodedGif> => {
   const first = frames[0];
   if (!first) throw new Error('encodeGif: 没有可编码的帧');
   const sourceSize = await imageSize(first.image);
   const width =
      options.width && options.width < sourceSize.width
         ? options.width
         : sourceSize.width;
   const height = Math.max(
      1,
      Math.round((sourceSize.height * width) / sourceSize.width),
   );

   const merged: Array<{ raw: Buffer; durationMs: number }> = [];
   for (const frame of frames) {
      const raw = await sharp(frame.image)
         .resize(width, height, {
            fit: 'contain',
            background: options.background,
         })
         .flatten({ background: options.background })
         .removeAlpha()
         .raw()
         .toBuffer();
      const last = merged.at(-1);
      if (last?.raw.equals(raw)) last.durationMs += frame.durationMs;
      else merged.push({ raw, durationMs: frame.durationMs });
   }

   const delay = quantizeDelays(merged.map((frame) => frame.durationMs));
   const raw = { width, height, channels: 3 as const };
   const gif = await sharp(Buffer.concat(merged.map((frame) => frame.raw)), {
      raw: { ...raw, height: height * merged.length, pageHeight: height },
   })
      .gif({
         delay,
         loop: 0,
         colours: options.colors,
         dither: 0,
         effort: 7,
         interFrameMaxError: 8,
      })
      .toBuffer();
   const lastRaw = merged.at(-1)?.raw as Buffer;
   const poster = await sharp(lastRaw, { raw }).png().toBuffer();

   return {
      gif,
      poster,
      width,
      height,
      frames: merged.length,
      durationMs: delay.reduce((sum, value) => sum + value, 0),
   };
};

export interface GifVariant {
   colors: number;
   /** 只有实时录制可以降帧率 */
   fps?: number;
   width?: number;
}

export interface BudgetResult {
   result: EncodedGif;
   variant: GifVariant;
   /** 为了压进体积上限做过的降级，按顺序 */
   degraded: string[];
}

const MIN_DEGRADED_WIDTH = 240;
const MIN_DEGRADED_FPS = 8;

/** 超过体积上限时依次降级：调色板 128 → 64 色、帧率减半、宽度 ×0.75（两次）。 */
export const encodeWithinBudget = async (
   base: GifVariant,
   build: (variant: GifVariant) => Promise<EncodedGif>,
   maxBytes: number,
): Promise<BudgetResult> => {
   type Step = (
      variant: GifVariant,
      result: EncodedGif,
   ) => [GifVariant, string] | undefined;
   const shrinkWidth: Step = (variant, result) => {
      const width = Math.round(result.width * 0.75);
      return width >= MIN_DEGRADED_WIDTH
         ? [{ ...variant, width }, `宽度 ${width}px`]
         : undefined;
   };
   const steps: Step[] = [
      (variant) =>
         variant.colors > 128
            ? [{ ...variant, colors: 128 }, '调色板 128 色']
            : undefined,
      (variant) =>
         variant.colors > 64
            ? [{ ...variant, colors: 64 }, '调色板 64 色']
            : undefined,
      (variant) => {
         if (!variant.fps || variant.fps <= MIN_DEGRADED_FPS) return undefined;
         const fps = Math.max(MIN_DEGRADED_FPS, Math.floor(variant.fps / 2));
         return [{ ...variant, fps }, `帧率 ${fps} fps`];
      },
      shrinkWidth,
      shrinkWidth,
   ];

   let variant = base;
   let result = await build(variant);
   const degraded: string[] = [];
   for (const step of steps) {
      if (result.gif.byteLength <= maxBytes) break;
      const next = step(variant, result);
      if (!next) continue;
      const [nextVariant, label] = next;
      variant = nextVariant;
      degraded.push(label);
      result = await build(variant);
   }
   return { result, variant, degraded };
};

const imageSize = async (
   image: Buffer,
): Promise<{ width: number; height: number }> => {
   const meta = await sharp(image).metadata();
   return { width: meta.width ?? 1, height: meta.height ?? 1 };
};
