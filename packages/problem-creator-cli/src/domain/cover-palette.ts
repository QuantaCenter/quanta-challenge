import { COVER_DEFAULTS } from './cover';

export interface CoverPalette {
   bg: string;
   bgTo?: string;
   accent: string;
   text: string;
}

export interface RandomPaletteResult {
   palette: CoverPalette;
   seed: number;
   scheme: string;
}

const TEXT_CONTRAST = 7;
const ACCENT_CONTRAST = 4.5;

// 背景色相锚点：只列深色底好看的色相（蓝 / 青 / 绿 / 紫 / 红 / 棕）。
// 不列黄色系：深黄在屏幕上是脏土色。
const BG_ANCHORS: ReadonlyArray<{ name: string; hue: number }> = [
   { name: '深蓝', hue: 216 },
   { name: '靛蓝', hue: 232 },
   { name: '青蓝', hue: 198 },
   { name: '幽绿', hue: 168 },
   { name: '松绿', hue: 148 },
   { name: '紫罗兰', hue: 262 },
   { name: '暗紫', hue: 280 },
   { name: '酒红', hue: 348 },
   { name: '暗红', hue: 10 },
   { name: '暖棕', hue: 26 },
];

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

// mulberry32：32 位状态、无依赖、同种子同结果，用来让随机配色可复现。
const createRandom = (seed: number): (() => number) => {
   let state = seed >>> 0;
   return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
   };
};

const hueToRgb = (
   hue: number,
   chroma: number,
   second: number,
): [number, number, number] => {
   if (hue < 60) return [chroma, second, 0];
   if (hue < 120) return [second, chroma, 0];
   if (hue < 180) return [0, chroma, second];
   if (hue < 240) return [0, second, chroma];
   if (hue < 300) return [second, 0, chroma];
   return [chroma, 0, second];
};

const toHexByte = (value: number): string =>
   Math.round(clamp01(value) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();

// HSL（h 单位度，s/l 为 0~1）-> #RRGGBB
export const hslToHex = (hue: number, sat: number, light: number): string => {
   const h = ((hue % 360) + 360) % 360;
   const s = clamp01(sat);
   const l = clamp01(light);
   const chroma = (1 - Math.abs(2 * l - 1)) * s;
   const second = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
   const offset = l - chroma / 2;
   const [r, g, b] = hueToRgb(h, chroma, second);
   return `#${toHexByte(r + offset)}${toHexByte(g + offset)}${toHexByte(b + offset)}`;
};

const parseHex = (hex: string): [number, number, number] => {
   const value = hex.slice(1);
   const full =
      value.length === 3
         ? [...value].map((char) => char + char).join('')
         : value.slice(0, 6);
   return [
      Number.parseInt(full.slice(0, 2), 16),
      Number.parseInt(full.slice(2, 4), 16),
      Number.parseInt(full.slice(4, 6), 16),
   ];
};

const toLinear = (channel: number): number => {
   const value = channel / 255;
   return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const relativeLuminance = (hex: string): number => {
   const [r, g, b] = parseHex(hex);
   return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
};

// WCAG 对比度，范围 1~21；谁亮谁暗不影响结果。
export const contrastRatio = (a: string, b: string): number => {
   const [high, low] = [relativeLuminance(a), relativeLuminance(b)].sort(
      (x, y) => y - x,
   ) as [number, number];
   return (high + 0.05) / (low + 0.05);
};

// 检查一套配色是否（仍）满足对比度下限，不满足时返回人话原因。 --random 单独用时必定通过；这个函数主要拦「随机配色 + 显式 --bg/--text 覆盖」 把可读性破坏掉的情况，例如 --random --bg "#ffffff" 会让近白标题看不见。
export const describePaletteProblem = (
   palette: CoverPalette,
): string | undefined => {
   const backgrounds =
      palette.bgTo === undefined ? [palette.bg] : [palette.bg, palette.bgTo];
   const requirements: Array<[string, string, number]> = [
      [palette.text, '主标题色', TEXT_CONTRAST],
      [palette.accent, '强调色', ACCENT_CONTRAST],
   ];
   for (const [color, label, minimum] of requirements) {
      for (const bg of backgrounds) {
         const ratio = contrastRatio(color, bg);
         if (ratio < minimum) {
            return `${label} ${color} 对背景 ${bg} 的对比度只有 ${ratio.toFixed(2)}:1（要求 ≥ ${minimum}:1）`;
         }
      }
   }
   return undefined;
};

// 从配色关系里抽一个强调色色相偏移，而不是全色环乱抽，这是和谐的来源。
// 同色系比例最高：深色底 + 同色系亮色强调是最不容易出错的组合。
const pickRelation = (rand: () => number): { name: string; offset: number } => {
   const sign = rand() < 0.5 ? -1 : 1;
   const roll = rand();
   if (roll < 0.22) return { name: '同色系', offset: sign * (6 + rand() * 20) };
   if (roll < 0.45)
      return { name: '邻近色', offset: sign * (30 + rand() * 25) };
   if (roll < 0.7) {
      return { name: '分裂互补', offset: sign * (138 + rand() * 24) };
   }
   if (roll < 0.88) {
      return { name: '互补色', offset: sign * (172 + rand() * 16) };
   }
   return { name: '三角色', offset: sign * (108 + rand() * 24) };
};

// 在满足对比度下限的前提下选强调色明度。深色背景上明度越高对比度越大，所以 达标区间是连续的 [min, 0.94]。先扫出刚好达标的下界再加余量：颜色够鲜艳，又 有安全边际；纯蓝这类亮度天生低的色相会被推到更亮的位置。
const fitAccent = (
   hue: number,
   sat: number,
   backgrounds: readonly string[],
   rand: () => number,
): string => {
   const meetsContrast = (light: number): boolean => {
      const candidate = hslToHex(hue, sat, light);
      return backgrounds.every(
         (bg) => contrastRatio(candidate, bg) >= ACCENT_CONTRAST,
      );
   };

   let minimum: number | undefined;
   for (let light = 0.94; light >= 0.5; light -= 0.005) {
      if (meetsContrast(light)) {
         minimum = light;
      } else if (minimum !== undefined) {
         break;
      }
   }
   // 兜底：理论上不该发生，退回默认强调色而不是输出不可读的颜色。
   if (minimum === undefined) return COVER_DEFAULTS.accent;
   // 加余量让颜色更鲜艳，但不能低于 minimum——纯蓝这类色相要求的明度可能很高，
   // 一味往下夹会突破 4.5:1（实测过 4.39:1）。
   const preferred = minimum + 0.05 + rand() * 0.06;
   return hslToHex(hue, sat, Math.max(minimum, Math.min(0.9, preferred)));
};

// 生成一套配色；不传 seed 时随机取一个，并在返回值里给出，便于复现。
export const randomCoverPalette = (seed?: number): RandomPaletteResult => {
   const resolvedSeed = (seed ?? Math.floor(Math.random() * 0xffffffff)) >>> 0;
   const rand = createRandom(resolvedSeed);

   // 背景：深色 + 中等饱和的窄带；色相在锚点附近小幅抖动，避免每套都一样。
   const anchor = BG_ANCHORS[Math.floor(rand() * BG_ANCHORS.length)]!;
   const bgHue = anchor.hue + (rand() - 0.5) * 16;
   const bgSat = 0.34 + rand() * 0.2;
   const bgLight = 0.095 + rand() * 0.07;
   const bg = hslToHex(bgHue, bgSat, bgLight);

   // 标题：接近白色，只掺一点背景色相，避免死白显得脱节。
   const text = hslToHex(
      bgHue + (rand() - 0.5) * 24,
      0.06 + rand() * 0.1,
      0.94 + rand() * 0.03,
   );

   // 渐变：约 60% 的方案给渐变终止色，色相小幅漂移、明度略抬，保持同一氛围。
   let bgTo: string | undefined;
   if (rand() < 0.6) {
      const toHue = bgHue + (rand() - 0.5) * 40;
      const toSat = clamp01(bgSat + (rand() - 0.5) * 0.12);
      let toLight = bgLight + 0.03 + rand() * 0.06;
      // 渐变端点也要让标题读得清：读不清就压回明度，压回背景色则干脆不要渐变。
      while (
         toLight > bgLight &&
         contrastRatio(text, hslToHex(toHue, toSat, toLight)) < TEXT_CONTRAST
      ) {
         toLight -= 0.01;
      }
      if (toLight > bgLight + 0.005) {
         bgTo = hslToHex(toHue, toSat, toLight);
      }
   }

   const relation = pickRelation(rand);
   const accentSat =
      relation.name === '同色系' ? 0.6 + rand() * 0.3 : 0.72 + rand() * 0.28;
   const accent = fitAccent(
      bgHue + relation.offset,
      accentSat,
      bgTo === undefined ? [bg] : [bg, bgTo],
      rand,
   );

   return {
      palette: { bg, bgTo, accent, text },
      seed: resolvedSeed,
      scheme: `${anchor.name} · ${relation.name}`,
   };
};
