import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
   getVisibleBoardLayout,
   mergeVisibleBoardSizes,
   resizeBoardPair,
} from '../app/utils/board-layout.ts';

test('隐藏文件栏后调整分隔条，恢复时保留文件栏宽度与板块顺序', () => {
   const layout = {
      order: ['preview', 'files', 'code'],
      sizes: [35, 23, 42],
   };
   const visible = getVisibleBoardLayout(layout, ['files']);
   assert.deepEqual(visible, { order: ['preview', 'code'], sizes: [35, 42] });

   const resized = resizeBoardPair(visible.sizes, 0, 60);
   const restored = mergeVisibleBoardSizes(layout, visible.order, resized);
   assert.equal(restored[1], 23);
   assert.ok(Math.abs(restored[0]! / (restored[0]! + restored[2]!) - 0.6) < 1e-10);
   assert.equal(restored.reduce((sum, value) => sum + value, 0), 100);
});

test('没有隐藏板块时保持完整布局', () => {
   const layout = { order: ['files', 'code', 'preview'], sizes: [23, 42, 35] };
   assert.deepEqual(getVisibleBoardLayout(layout, []), layout);
});
