import { createHash, randomUUID } from 'node:crypto';
import type { BrowserContext, Page } from 'playwright';
import sharp from 'sharp';
import {
   completeConversion,
   prepareConversion,
   type Asset,
   type CssImage,
   type DesignNode,
   type FontAsset,
   type LayerStructure,
} from '@quantacenter/page2design';
import {
   collectDomBackgrounds,
   collectDomLayout,
   collectDomPseudos,
   collectDomTables,
   type PseudoLayout,
} from '@quantacenter/page2design/dom';
import type { ProblemDesignDocument } from '../schemas/judge-result.js';

const DESIGN_TIMEOUT = 20_000;
const MAX_HEIGHT = 8_000;
const MAX_NODES = 2_500;
const MAX_RESOURCE_BYTES = 2 * 1024 * 1024;
const MAX_ASSET_BYTES = 6 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 14 * 1024 * 1024;
const MARKER = 'data-page-to-design-id';
const dataUrl = (bytes: Buffer, mime: string) => `data:${mime};base64,${bytes.toString('base64')}`;

type Resource = { bytes: Buffer; mime: string };

function evaluateInPage<Result, Input>(
   page: Page,
   fn: (input: Input) => Result,
   input: Input,
) {
   // tsx can add __name calls inside serialized functions. Keep the shim in the evaluation.
   return page.evaluate<Awaited<Result>>(
      `(() => { const __name = value => value; return (${fn.toString()})(${JSON.stringify(input)}); })()`,
   );
}

function collectWithDocument<Result, Input extends object>(
   page: Page,
   fn: (input: Input & { document: Document }) => Result,
   input: Input,
) {
   return page.evaluate<Awaited<Result>>(
      `(() => { const __name = value => value; return (${fn.toString()})({ ...${JSON.stringify(input)}, document }); })()`,
   );
}

async function collectPaintOrder(page: Page, nodes: DesignNode[]) {
   const session = await page.context().newCDPSession(page);
   let pseudos: PseudoLayout[];
   try {
      const { domNodes, layoutTreeNodes } = await session.send('DOMSnapshot.getSnapshot', {
         computedStyleWhitelist: [],
         includePaintOrder: true,
      });
      const layers = new Map(nodes.map((node) => [node.id, node]));
      pseudos = [];
      for (const dom of domNodes) {
         const id = dom.attributes?.find(({ name }) => name === MARKER)?.value;
         const parent = id && layers.get(id);
         if (!parent || dom.layoutNodeIndex === undefined) continue;
         parent.paintOrder = layoutTreeNodes[dom.layoutNodeIndex]?.paintOrder ?? 0;
         if (parent.kind === 'raster') continue;
         for (const index of dom.pseudoElementIndexes ?? []) {
            const pseudo = domNodes[index];
            if (pseudo.pseudoType !== 'before' && pseudo.pseudoType !== 'after') continue;
            if (pseudo.layoutNodeIndex === undefined) continue;
            const layout = layoutTreeNodes[pseudo.layoutNodeIndex];
            if (!layout) continue;
            pseudos.push({
               parentId: parent.id,
               type: `::${pseudo.pseudoType}`,
               box: layout.boundingBox,
               paintOrder: layout.paintOrder ?? 0,
               text: (layout.inlineTextNodes ?? []).map((line) => ({
                  text: (layout.layoutText ?? '').slice(
                     line.startCharacterIndex,
                     line.startCharacterIndex + line.numCharacters,
                  ),
                  box: line.boundingBox,
               })),
            });
         }
      }
      for (const node of nodes) {
         if (node.tag === '#text' && node.parentId) {
            node.paintOrder = layers.get(node.parentId)?.paintOrder ?? 0;
         }
      }
   } finally {
      await session.detach();
   }
   if (!pseudos.length || nodes.length >= MAX_NODES) return;
   const generated = (await collectWithDocument(page, collectDomPseudos, {
      parents: nodes, pseudos,
   })).slice(0, MAX_NODES - nodes.length);
   const ids = new Set(generated.map((node) => node.id));
   const byId = new Map(nodes.map((node) => [node.id, node]));
   for (const node of generated) {
      node.children = node.children.filter((id) => ids.has(id));
      const parent = node.parentId && byId.get(node.parentId);
      if (!parent) continue;
      if (node.pseudoElement === '::before') parent.children.unshift(node.id);
      else parent.children.push(node.id);
   }
   nodes.push(...generated);
}

/** Collect bytes from Chromium's existing image/font requests. No server-side refetch of page URLs. */
function trackResources(page: Page) {
   const loaded = new Map<string, Resource>();
   const pending = new Set<Promise<void>>();
   let bytesRead = 0;
   page.on('response', (response) => {
      const request = response.request();
      if (!response.ok() || !['image', 'font'].includes(request.resourceType())) return;
      const headers = response.headers();
      if (Number(headers['content-length']) > MAX_RESOURCE_BYTES || bytesRead >= MAX_ASSET_BYTES) return;
      const read = response.body().then((bytes) => {
         if (bytes.length > MAX_RESOURCE_BYTES || bytesRead + bytes.length > MAX_ASSET_BYTES) return;
         bytesRead += bytes.length;
         const resource = {
            bytes,
            mime: headers['content-type']?.split(';')[0].trim().toLowerCase() || 'application/octet-stream',
         };
         loaded.set(response.url().split('#')[0], resource);
         for (let source = request; source; ) {
            loaded.set(source.url().split('#')[0], resource);
            const previous = source.redirectedFrom();
            if (!previous) break;
            source = previous;
         }
      }).catch(() => {});
      pending.add(read);
      void read.finally(() => pending.delete(read));
   });
   return {
      settle: async () => {
         const timeout = AbortSignal.timeout(900);
         await Promise.race([
            Promise.all(pending),
            new Promise<void>((resolve) => timeout.addEventListener('abort', () => resolve(), { once: true })),
         ]);
      },
      async find(url: string): Promise<Resource | undefined> {
         const source = url.split('#')[0]!;
         const fromNetwork = loaded.get(source);
         if (fromNetwork || !/^(data|blob):/i.test(source) || source.length > MAX_RESOURCE_BYTES * 3) {
            return fromNetwork;
         }
         const inline = await evaluateInPage(page, async ({ source, maxBytes }) => {
            try {
               const blob = await (await fetch(source, { signal: AbortSignal.timeout(750) })).blob();
               if (blob.size > maxBytes) return;
               const bytes = new Uint8Array(await blob.arrayBuffer());
               let binary = '';
               for (let offset = 0; offset < bytes.length; offset += 16_384) {
                  binary += String.fromCharCode(...bytes.subarray(offset, offset + 16_384));
               }
               return { encoded: btoa(binary), mime: blob.type.split(';')[0] };
            } catch {
               return undefined;
            }
         }, { source, maxBytes: MAX_RESOURCE_BYTES });
         if (!inline) return undefined;
         const value = { bytes: Buffer.from(inline.encoded, 'base64'), mime: inline.mime };
         loaded.set(source, value);
         return value;
      },
   };
}

async function captureLayout(
   page: Page,
   structure: LayerStructure,
   resources: ReturnType<typeof trackResources>,
): Promise<ProblemDesignDocument> {
   const startedAt = performance.now();
   const viewport = page.viewportSize();
   if (!viewport) throw new Error('无法读取采集视口');

   // Capture the initial state before starting screenshot fallbacks or extracting paths.
   await page.waitForLoadState('load', { timeout: 2_000 }).catch(() => {});
   await evaluateInPage(page, async () => {
      for (const image of document.querySelectorAll('img[loading="lazy"]')) {
         (image as HTMLImageElement).loading = 'eager';
      }
      await Promise.race([
         document.fonts.ready,
         new Promise((resolve) => setTimeout(resolve, 1_000)),
      ]);
      await new Promise<void>((resolve) => {
         const finish = () => {
            observer.disconnect();
            clearTimeout(idle);
            clearTimeout(deadline);
            resolve();
         };
         const observer = new MutationObserver(() => {
            clearTimeout(idle);
            idle = setTimeout(finish, 250);
         });
         observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
         let idle = setTimeout(finish, 250);
         const deadline = setTimeout(finish, 1_500);
      });
      for (const animation of document.getAnimations()) animation.pause();
      for (const video of document.querySelectorAll('video')) video.pause();
   }, null);

   const snapshot = await collectWithDocument(page, collectDomLayout, {
      fullPage: true, maxHeight: MAX_HEIGHT, maxNodes: MAX_NODES,
   });
   if (!snapshot.nodes.length) throw new Error('参考页面没有可采集的图层');
   try {
      await collectPaintOrder(page, snapshot.nodes);
   } catch {
      snapshot.warnings.push({ code: 'PAINT_ORDER', message: '使用 DOM 顺序确定图层绘制次序。' });
   }
   const backgrounds = await collectWithDocument(page, collectDomBackgrounds, { nodes: snapshot.nodes });
   const backgroundById = new Map(backgrounds.map((background) => [background.id, background]));
   for (const node of snapshot.nodes) {
      const background = backgroundById.get(node.id);
      if (!background) continue;
      if (background.layers.length) node.backgroundLayers = background.layers;
      if (background.masks?.length) node.maskLayers = background.masks;
      if (background.clipPath) node.clipPath = background.clipPath;
   }
   const tables = await collectWithDocument(page, collectDomTables, {});
   const plan = prepareConversion({ ...snapshot, viewport, tables });
   const assets = new Map<string, Asset>();
   let assetBytes = 0;
   const budget = (bytes: Buffer) => {
      if (bytes.length > MAX_RESOURCE_BYTES || assetBytes + bytes.length > MAX_ASSET_BYTES) return false;
      assetBytes += bytes.length;
      return true;
   };
   const addAsset = (bytes: Buffer, mime: string, fragment = '') => {
      const id = createHash('sha256').update(bytes).update('\0').update(mime + fragment).digest('hex');
      if (assets.has(id)) return id;
      if (!budget(bytes)) return undefined;
      assets.set(id, { id, mime, dataUrl: dataUrl(bytes, mime) + fragment });
      return id;
   };

   await resources.settle();
   const resolveImage = async (url: string) => {
      const resource = await resources.find(url);
      if (!resource) return undefined;
      const hash = url.indexOf('#');
      const fragment = hash === -1 ? '' : url.slice(hash);
      let mime = resource.mime;
      if (!mime.startsWith('image/')) {
         // The static server can return binary MIME for an asset Chrome recognized as an image.
         const metadata = await sharp(resource.bytes).metadata().catch(() => undefined);
         if (!metadata?.format) return undefined;
         mime = `image/${metadata.format === 'svg' ? 'svg+xml' : metadata.format}`;
      }
      return addAsset(resource.bytes, mime, fragment);
   };
   const inlined = new Map<string, Promise<string | undefined>>();
   const getImage = (url: string) => {
      const existing = inlined.get(url) ?? resolveImage(url);
      inlined.set(url, existing);
      return existing;
   };

   const resolveCssImage = async (image: CssImage): Promise<boolean> => {
      let available = true;
      if (image.url) {
         image.assetId = await getImage(image.url);
         if (!image.assetId) {
            image.url = undefined;
            image.image = 'none';
            available = false;
         }
      }
      for (const item of image.crossFade ?? []) {
         available = (await resolveCssImage(item.source)) && available;
      }
      return available;
   };

   const reference = await page.screenshot({
      type: 'jpeg',
      quality: 80,
      fullPage: true,
      clip: { x: 0, y: 0, width: plan.width, height: plan.height },
      timeout: 3_000,
   }).catch(() => undefined);
   const rasterize = async (node: DesignNode) => {
      const { x, y, width, height } = node.visualBox ?? node.box;
      const left = Math.max(0, Math.floor(x));
      const top = Math.max(0, Math.floor(y));
      const clip = {
         x: left,
         y: top,
         width: Math.min(plan.width, Math.ceil(x + width)) - left,
         height: Math.min(plan.height, Math.ceil(y + height)) - top,
      };
      if (clip.width <= 0 || clip.height <= 0) return false;
      const selector = node.pseudoElement
         ? `[${MARKER}="${node.parentId}"]${node.pseudoElement}`
         : `[${MARKER}="${node.id}"]`;
      let style = '*,*::before,*::after{visibility:hidden!important}';
      if (!node.canvasBackground) {
         const visible = node.pseudoElement ? selector : `${selector},${selector} *,${selector}::before,${selector}::after`;
         style += `${visible}{visibility:visible!important}`;
         if (!['html', 'body'].includes(node.tag)) style += 'html,body{background:transparent!important}';
      }
      const bytes = await page.screenshot({
         type: 'png', fullPage: true, omitBackground: true, clip, style, timeout: 1_200,
      }).catch(() => undefined);
      node.assetId = bytes ? addAsset(bytes, 'image/png') : undefined;
      if (!node.assetId) return false;
      node.kind = 'raster';
      node.rasterBox = clip;
      node.rasterMode = 'isolated';
      return true;
   };

   for (const node of plan.nodes) {
      if (node.kind === 'svg' && node.svgSource) {
         node.assetId = addAsset(Buffer.from(node.svgSource), 'image/svg+xml');
      } else if (node.kind !== 'raster' && node.assetUrl) {
         node.assetId = await getImage(node.assetUrl);
      } else if (node.kind === 'video' && node.video?.poster) {
         node.assetId = await getImage(node.video.poster);
      }
      const emptyCanvas = node.kind === 'canvas' && node.canvas && (!node.canvas.width || !node.canvas.height);
      if (['image', 'svg', 'raster', 'canvas', 'video'].includes(node.kind) && !node.assetId && !emptyCanvas) {
         if (!(await rasterize(node))) {
            node.kind = 'frame';
            node.svgSource = undefined;
            plan.warnings.push({ code: 'ASSET_MISSING', message: '部分图层素材未能采集。', nodeId: node.id });
         }
      }
      let missing = false;
      for (const layer of [...(node.backgroundLayers ?? []), ...(node.maskLayers ?? [])]) {
         missing = !(await resolveCssImage(layer)) || missing;
      }
      if (node.backgroundLayers?.length === 1) node.backgroundAssetId = node.backgroundLayers[0]?.assetId;
      else if (!node.backgroundLayers?.length && node.backgroundUrl) {
         node.backgroundAssetId = await getImage(node.backgroundUrl);
         missing = !node.backgroundAssetId || missing;
      }
      if (missing) {
         plan.warnings.push({ code: 'BACKGROUND_ASSET_MISSING', message: '部分背景或遮罩素材未能采集。', nodeId: node.id });
      }
   }

   const fonts: FontAsset[] = [];
   const fontKeys = new Set<string>();
   for (const { urls, family, style, weight, unicodeRange } of snapshot.fontFaces) {
      const key = JSON.stringify([family, style, weight, unicodeRange]);
      if (fontKeys.has(key)) continue;
      for (const url of urls) {
         const resource = await resources.find(url);
         if (!resource || !budget(resource.bytes)) continue;
         fontKeys.add(key);
         fonts.push({ family, style, weight, unicodeRange: unicodeRange || undefined, dataUrl: dataUrl(resource.bytes, resource.mime) });
         break;
      }
   }

   const design: ProblemDesignDocument = completeConversion(plan, {
      id: randomUUID(),
      capturedAt: new Date().toISOString(),
      assets: [...assets.values()],
      fonts,
      referenceImage: reference && reference.length <= MAX_RESOURCE_BYTES ? dataUrl(reference, 'image/jpeg') : undefined,
      durationMs: Math.round(performance.now() - startedAt),
   }, { structure });
   if (structure === 'flat') {
      const styleById = new Map(plan.nodes.map((node) => [node.id, node.style]));
      for (const node of design.nodes) {
         const style = styleById.get(node.id);
         const textAlign = style?.['text-align'];
         const fill = style?.['-webkit-text-fill-color'];
         const textFillColor = fill !== style?.color ? fill : undefined;
         if (textAlign || textFillColor) node.inspection = { textAlign, textFillColor };
      }
   }
   if (Buffer.byteLength(JSON.stringify(design)) > MAX_DOCUMENT_BYTES) throw new Error('设计稿超过存储大小限制');
   return design;
}

/** The caller creates a disposable context on the existing frontend judge browser. */
export async function captureProblemDesign(context: BrowserContext, url: string, structure: LayerStructure) {
   const timeout = setTimeout(() => void context.close().catch(() => {}), DESIGN_TIMEOUT);
   try {
      const page = await context.newPage();
      const resources = trackResources(page);
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 7_000 });
      if (!response?.ok()) throw new Error(`参考页面无法加载${response ? `（HTTP ${response.status()}）` : ''}`);
      return await captureLayout(page, structure, resources);
   } finally {
      clearTimeout(timeout);
      await context.close().catch(() => {});
   }
}
