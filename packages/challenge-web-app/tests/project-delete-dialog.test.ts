import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { computed, ref } from 'vue';
import { parse } from 'vue/compiler-sfc';

const filename = new URL('../app/components/dialog/ConfirmDialog.vue', import.meta.url);
const source = await readFile(filename, 'utf8');
const { descriptor } = parse(source);
const script = ts.transpileModule(
   descriptor.scriptSetup!.content.replace(/^import .*;$/gm, ''),
   { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;

function createDialog(options: Record<string, unknown>, copy: (text: string) => Promise<void>) {
   const events: string[] = [];
   const factory = new Function('ref', 'computed', 'defineProps', 'defineEmits', 'navigator', `
      ${script}
      return { inputValue, canConfirm, handleConfirm, copyConfirmation, copied, copyError };
   `);
   const state = factory(ref, computed, () => ({ id: 'delete-project', options }),
      () => (event: string) => events.push(event), { clipboard: { writeText: copy } });
   return { state, events };
}

test('project deletion requires the exact name, and copying does not confirm deletion', async () => {
   const name = '测试 Project <demo>';
   const clipboard: string[] = [];
   let confirmed = 0;
   const { state, events } = createDialog({
      confirmation: { label: '项目名', value: name, copyable: true },
      onConfirm: () => { confirmed++; },
   }, async text => { clipboard.push(text); });

   for (const input of ['', '其他项目', ` ${name}`, name.toLowerCase()]) {
      state.inputValue.value = input;
      assert.equal(state.canConfirm.value, false);
      await state.handleConfirm();
   }
   assert.equal(confirmed, 0);
   assert.deepEqual(events, []);

   await state.copyConfirmation();
   assert.deepEqual(clipboard, [name]);
   assert.equal(state.copied.value, true);
   assert.equal(state.canConfirm.value, false);
   assert.equal(confirmed, 0);

   state.inputValue.value = name;
   assert.equal(state.canConfirm.value, true);
   await state.handleConfirm();
   assert.equal(confirmed, 1);
   assert.deepEqual(events, ['confirm']);
});

test('clipboard failure preserves confirmation protection and offers manual copying', async () => {
   const { state, events } = createDialog({
      confirmation: { label: '项目名', value: 'Demo', copyable: true },
   }, async () => { throw new Error('clipboard unavailable'); });
   await state.copyConfirmation();
   assert.match(state.copyError.value, /手动选择复制/);
   assert.equal(state.canConfirm.value, false);
   assert.deepEqual(events, []);
});

test('confirm dialogs without name verification retain their existing behavior', async () => {
   const { state, events } = createDialog({}, async () => {});
   assert.equal(state.canConfirm.value, true);
   await state.handleConfirm();
   assert.deepEqual(events, ['confirm']);
});
