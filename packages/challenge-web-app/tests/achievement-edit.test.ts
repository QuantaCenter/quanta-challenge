import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canEditAchievement, hasAchievementCycle, UpdateAchievementSchema } from '../server/trpc/services/utils/achievement-edit.ts';

test('only super administrators or the publishing administrator may edit an achievement', () => {
   for (const authorId of ['owner', 'other', null]) {
      assert.equal(canEditAchievement({ userId: 'owner', role: 'SUPER_ADMIN' }, authorId), true);
      assert.equal(canEditAchievement({ userId: 'owner', role: 'ADMIN' }, authorId), authorId === 'owner');
      assert.equal(canEditAchievement({ userId: 'owner', role: 'USER' }, authorId), false);
   }
});

const valid = {
   id: 1,
   name: '成就',
   description: '成就描述',
   imageId: '550e8400-e29b-41d4-a716-446655440000',
   preAchievements: [2],
};

test('editing accepts only basic information and rejects script or scoring changes', () => {
   assert.equal(UpdateAchievementSchema.safeParse(valid).success, true);
   for (const field of ['script', 'checkScript', 'dependencyData', 'isCheckinAchievement', 'score', 'authorId']) {
      assert.equal(UpdateAchievementSchema.safeParse({ ...valid, [field]: 'changed' }).success, false);
   }
   for (const change of [
      { name: '  ' }, { name: 'a'.repeat(51) }, { description: '' },
      { description: 'a'.repeat(256) }, { imageId: '' },
      { preAchievements: [2, 2] }, { preAchievements: [-1] },
   ]) {
      assert.equal(UpdateAchievementSchema.safeParse({ ...valid, ...change }).success, false);
   }
   assert.equal(UpdateAchievementSchema.safeParse({ ...valid, preAchievements: [] }).success, true);
});

test('prerequisites reject self references and transitive cycles while allowing removal and shared ancestors', () => {
   const edges = [
      { achievementId: 1, preAchievementId: 2 },
      { achievementId: 2, preAchievementId: 3 },
      { achievementId: 3, preAchievementId: 4 },
      { achievementId: 5, preAchievementId: 4 },
   ];
   assert.equal(hasAchievementCycle(1, [1], edges), true);
   assert.equal(hasAchievementCycle(4, [1], edges), true);
   assert.equal(hasAchievementCycle(1, [2, 5], edges), false);
   assert.equal(hasAchievementCycle(1, [], edges), false);
   // Replacing an old cyclic edge with a valid prerequisite must be allowed.
   assert.equal(hasAchievementCycle(4, [], [...edges, { achievementId: 4, preAchievementId: 1 }]), false);
});
