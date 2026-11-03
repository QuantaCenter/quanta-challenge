import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLearningOutline, type LearningChapter } from '../server/utils/learning-progress.ts';

const enrolledAt = new Date('2026-01-01T00:00:00Z');
const doneAt = new Date('2026-01-02T00:00:00Z');
const section = (id: string, type: 'article' | 'problem' = 'article') => ({ id, title: id, type });
const chapters: LearningChapter[] = [
   { id: 'one', title: 'one', introduction: 'guide', stages: [
      { sections: [section('a')] },
      { sections: [section('b')] },
      { sections: [section('c')] },
      { sections: [section('p1', 'problem'), section('p2', 'problem'), section('p3', 'problem')] },
   ] },
   { id: 'two', title: 'two', introduction: 'secret guide', stages: [{ sections: [section('d')] }] },
];
const progress = (...ids: string[]) => ids.map(sectionId => ({ sectionId, completedAt: doneAt }));

test('initial enrollment unlocks only the first section and hides later chapter guides', () => {
   const state = buildLearningOutline(chapters, [], enrolledAt);
   assert.deepEqual(state.flatMap(c => c.sections).filter(s => s.unlocked).map(s => s.id), ['a']);
   assert.equal(state[1]?.introduction, null);
});

test('articles unlock in order, then all problems unlock together', () => {
   let state = buildLearningOutline(chapters, progress('a'), enrolledAt);
   assert.equal(state[0]?.sections.find(s => s.id === 'b')?.unlocked, true);
   assert.equal(state[0]?.sections.find(s => s.id === 'c')?.unlocked, false);
   state = buildLearningOutline(chapters, progress('a', 'b', 'c'), enrolledAt);
   for (const id of ['p1', 'p2', 'p3']) {
      assert.equal(state[0]?.sections.find(s => s.id === id)?.unlocked, true);
      assert.equal(state[0]?.sections.find(s => s.id === id)?.unlockedAt?.getTime(), doneAt.getTime());
   }
   assert.equal(state[1]?.unlocked, false);
});

test('the next chapter requires every problem, and uses the latest prerequisite completion time', () => {
   const partial = buildLearningOutline(chapters, progress('a', 'b', 'c', 'p1', 'p2'), enrolledAt);
   assert.equal(partial[0]?.completed, false);
   assert.equal(partial[1]?.unlocked, false);
   const latest = new Date('2026-01-03T00:00:00Z');
   const state = buildLearningOutline(chapters, [...progress('a', 'b', 'c', 'p1', 'p2'), { sectionId: 'p3', completedAt: latest }], enrolledAt);
   assert.equal(state[0]?.completed, true);
   assert.equal(state[1]?.introduction, 'secret guide');
   assert.equal(state[1]?.sections[0]?.unlockedAt?.getTime(), latest.getTime());
});

test('an empty chapter does not unlock subsequent content', () => {
   const state = buildLearningOutline([{ ...chapters[0]!, stages: [] }, chapters[1]!], [], enrolledAt);
   assert.equal(state[1]?.unlocked, false);
});
