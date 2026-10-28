import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLearningPlaygroundDocument } from '../app/utils/learning-playground.ts';
import { parseLearningArticleDirectives } from '../server/utils/learning-directives.ts';
import {
   calculateLearningProgress,
   uniqueLearningProblemIds,
} from '../server/utils/learning-progress.ts';

test('学习指令按正文顺序解析，并忽略同类重复引用', () => {
   const result = parseLearningArticleDirectives(`
正文
<Problem baseId={ 12 } />
<Playground id="demo-one" />
<Problem baseId={12} />
<Problem baseId={3} />
<Playground id='demo-one' />
`);
   assert.deepEqual(result.problems, [
      { baseId: 12, sort: 0 },
      { baseId: 3, sort: 1 },
   ]);
   assert.deepEqual(result.playgrounds, [{ id: 'demo-one', sort: 0 }]);
});

test('进度只有全部原子任务完成时才完成，空专题不视为完成', () => {
   assert.deepEqual(calculateLearningProgress(0, 0), {
      percent: 0,
      completed: false,
      completedCount: 0,
      totalCount: 0,
   });
   assert.equal(calculateLearningProgress(2, 3).percent, 67);
   assert.equal(calculateLearningProgress(2, 3).completed, false);
   assert.equal(calculateLearningProgress(3, 3).completed, true);
});

test('专题直接题与文章题按 baseId 去重', () => {
   assert.deepEqual(
      [...uniqueLearningProblemIds([1, 2], [2, 3], [3, 4])],
      [1, 2, 3, 4],
   );
});

test('Playground 文档带严格沙箱 CSP 并阻止闭合标签逃逸', () => {
   const document = createLearningPlaygroundDocument({
      html: '<button>测试</button>',
      css: 'body{color:red}</style><img src="https://evil.test/a">',
      js: 'console.log("ok")</script><script>parent.alert(1)',
   });
   assert.match(document, /default-src 'none'/);
   assert.match(document, /form-action 'none'/);
   assert.match(document, /base-uri 'none'/);
   assert.ok(!document.includes('</style><img'));
   assert.ok(!document.includes('</script><script>parent'));
});
