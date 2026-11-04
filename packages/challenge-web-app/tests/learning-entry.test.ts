import assert from 'node:assert/strict';
import test from 'node:test';
import { getLearningEntry } from '../app/utils/learning-entry.ts';

const section = (id: string, completed = false, unlocked = true) => ({ id, completed, unlocked });

test('a chapter with no completed sections opens its guide', () => {
   assert.deepEqual(getLearningEntry([{ id: 'one', unlocked: true, sections: [section('a')] }]), { chapter: 'one' });
});

test('a started chapter resumes the first unlocked unfinished section in course order', () => {
   assert.deepEqual(getLearningEntry([{ id: 'one', unlocked: true, sections: [
      section('a', true), section('b'), section('c'), section('d', false, false),
   ] }]), { section: 'b' });
});

test('a completed chapter leads to the next untouched chapter guide', () => {
   assert.deepEqual(getLearningEntry([
      { id: 'one', unlocked: true, sections: [section('a', true)] },
      { id: 'two', unlocked: true, sections: [section('b')] },
   ]), { chapter: 'two' });
});

test('locked, empty, and fully completed courses have no resume destination', () => {
   assert.equal(getLearningEntry([{ id: 'locked', unlocked: false, sections: [section('a')] }]), undefined);
   assert.equal(getLearningEntry([]), undefined);
   assert.equal(getLearningEntry([{ id: 'done', unlocked: true, sections: [section('a', true)] }]), undefined);
});
