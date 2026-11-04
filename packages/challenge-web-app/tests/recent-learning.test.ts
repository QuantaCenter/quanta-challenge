import assert from 'node:assert/strict';
import test from 'node:test';
import { selectRecentLearning } from '../server/utils/recent-learning.ts';

const item = (id: string, finished: boolean, day: number) => ({ id, finished, lastLearnedAt: new Date(2026, 0, day) });

test('unfinished courses precede completed courses, with each group ordered by recent activity', () => {
   assert.deepEqual(selectRecentLearning([
      item('done-old', true, 3), item('todo-old', false, 1),
      item('done-new', true, 4), item('todo-new', false, 2),
   ]).map(x => x.id), ['todo-new', 'todo-old', 'done-new', 'done-old']);
});

test('the five-course limit is applied after prioritizing even older unfinished courses', () => {
   const items = Array.from({ length: 6 }, (_, i) => item(`done-${i}`, true, i + 2));
   items.push(item('todo', false, 1));
   const result = selectRecentLearning(items);
   assert.equal(result.length, 5);
   assert.deepEqual(result.map(x => x.id), ['todo', 'done-5', 'done-4', 'done-3', 'done-2']);
});

test('ties use course IDs and fewer than five courses are returned as-is', () => {
   assert.deepEqual(selectRecentLearning([item('b', false, 1), item('a', false, 1)]).map(x => x.id), ['a', 'b']);
   assert.deepEqual(selectRecentLearning([]), []);
});
