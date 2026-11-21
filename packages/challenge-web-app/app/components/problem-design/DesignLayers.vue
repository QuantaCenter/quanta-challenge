<script setup lang="ts">
import type { DesignDocument, DesignNode } from '@quantacenter/page2design';
import { ChevronDown, ChevronRight, Frame, Image, Layers3, SquareMousePointer, Type, Video } from 'lucide-vue-next';
import { isNumericValue } from './design-inspection';

const props = defineProps<{ design: DesignDocument; selectedId?: string; hoveredId?: string }>();
const emit = defineEmits<{ pick: [node: DesignNode]; hover: [node?: DesignNode] }>();

const icons = { frame: Frame, text: Type, image: Image, video: Video, canvas: Image, control: SquareMousePointer, svg: Image, raster: Image };
const list = ref<HTMLElement>();
const expanded = defineModel<Record<string, boolean>>('expanded', { default: () => ({}) });
const layers = computed(() => {
   const nodes = [...props.design.nodes].sort((a, b) => b.paintOrder - a.paintOrder || b.order - a.order);
   const byId = new Map(nodes.map((node) => [node.id, node]));
   const children = new Map<string, DesignNode[]>();
   const roots: DesignNode[] = [];

   for (const node of nodes) {
      const parentId = node.parentId;
      if (props.design.structure === 'flat' || !parentId || !byId.has(parentId)) {
         roots.push(node);
         continue;
      }
      const siblings = children.get(parentId) ?? [];
      siblings.push(node);
      children.set(parentId, siblings);
   }

   return { byId, children, roots };
});

const rows = computed(() => {
   const result: { node: DesignNode; depth: number; disclosure: boolean; open: boolean }[] = [];
   const stack = layers.value.roots.map((node) => ({ node, depth: 0 })).reverse();
   while (stack.length) {
      const row = stack.pop()!;
      const children = layers.value.children.get(row.node.id) ?? [];
      const disclosure = children.length > 0;
      const open = disclosure && (expanded.value[row.node.id] ?? row.depth < 2);
      result.push({ ...row, disclosure, open });

      if (open) {
         for (let index = children.length - 1; index >= 0; index--) {
            stack.push({ node: children[index], depth: row.depth + 1 });
         }
      }
   }
   return result;
});

const visibleIds = computed(() => new Set(rows.value.map((row) => row.node.id)));
const hoveredRowId = computed(() => {
   let id = props.hoveredId;
   const seen = new Set<string>();
   while (id && !visibleIds.value.has(id) && !seen.has(id)) {
      seen.add(id);
      id = layers.value.byId.get(id)?.parentId ?? undefined;
   }
   return id;
});

const rowClasses = {
   selected: 'bg-primary/15 text-[#ffb47a] hover:bg-primary/25 focus-within:bg-primary/20 active:bg-primary/30',
   hovered: 'bg-white/12 text-white active:bg-white/20',
   idle: 'hover:bg-white/12 hover:text-white focus-within:bg-white/8 active:bg-white/20',
};
const rowButtonClass = 'transition-colors hover:cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary';

function previewLayer(event: PointerEvent, node?: DesignNode) {
   if (event.pointerType !== 'touch') emit('hover', node);
}

watch(() => props.selectedId, async (id) => {
   if (!id) return;
   let parentId = layers.value.byId.get(id)?.parentId;
   const seen = new Set<string>();
   while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      expanded.value[parentId] = true;
      parentId = layers.value.byId.get(parentId)?.parentId;
   }
   await nextTick();
   list.value?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
}, { immediate: true });
</script>

<template>
   <aside class="flex min-h-0 min-w-0 flex-col bg-[#191919]" aria-label="图层">
      <div class="flex h-11 shrink-0 items-center justify-between border-b border-white/10 px-3.5">
         <h2 class="flex items-center gap-2 text-xs font-semibold">
            <Layers3 :size="15" class="text-accent-300" />
            图层
         </h2>
         <div class="flex shrink-0 items-center gap-1">
            <span class="font-family-manrope text-[11px] tabular-nums text-accent-300">{{ design.nodes.length }}</span>
            <slot name="header-actions" />
         </div>
      </div>
      <p v-if="!rows.length" class="p-4 text-xs text-accent-300">没有可检查的图层</p>
      <ul v-else ref="list" class="min-h-0 flex-1 overflow-auto overscroll-contain py-2">
         <li
            v-for="row in rows"
            :key="row.node.id"
            class="mx-1 flex items-center rounded pr-1 transition-colors"
            :class="selectedId === row.node.id ? rowClasses.selected : hoveredRowId === row.node.id ? rowClasses.hovered : rowClasses.idle"
            :style="{ paddingLeft: `${4 + Math.min(row.depth, 9) * 12}px` }"
            @pointerenter="previewLayer($event, row.node)"
            @pointerleave="previewLayer($event)"
         >
            <StPopover
               v-if="row.disclosure"
               :content="row.open ? '收起图层' : '展开图层'"
               placement="right"
               :z-index="$slots['header-actions'] ? 10001 : undefined"
               class="flex shrink-0"
               tooltip>
               <button
                  type="button"
                  class="grid size-5 shrink-0 place-items-center rounded text-accent-300 hover:bg-white/18 hover:text-white active:bg-white/25"
                  :class="rowButtonClass"
                  :aria-expanded="row.open"
                  :aria-label="`${row.open ? '收起' : '展开'} ${row.node.name || row.node.tag}`"
                  @click="expanded[row.node.id] = !row.open">
                  <ChevronDown v-if="row.open" :size="13" />
                  <ChevronRight v-else :size="13" />
               </button>
            </StPopover>
            <span v-else class="w-5 shrink-0" aria-hidden="true"></span>
            <button
               type="button"
               class="flex h-7 min-w-0 flex-1 items-center gap-2 rounded px-1 text-left text-xs"
               :class="rowButtonClass"
               :aria-current="selectedId === row.node.id ? 'true' : undefined"
               :title="row.node.name || row.node.tag"
               @click="emit('pick', row.node)"
            >
               <component
                  :is="icons[row.node.kind]"
                  :size="13"
                  class="shrink-0"
                  :class="selectedId === row.node.id || hoveredRowId === row.node.id ? 'text-current' : 'text-accent-300'" />
               <span class="truncate" :class="{ 'font-family-manrope tabular-nums': isNumericValue(row.node.name || row.node.tag) }">{{ row.node.name || row.node.tag }}</span>
            </button>
         </li>
      </ul>
   </aside>
</template>
