import { test, expect, describe, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

// Mock prisma
//
// 注意：这里必须把观察者会用到的模型方法一次性补齐并给出**默认可解析**的实现。
// AchievementObserver 的构造器内部会 fire-and-forget 地调用 rebuildDepTree()，
// 而该方法第一件事就是 prisma.achievement.findMany(...)。早先的 mock 只提供了
// $queryRawUnsafe，于是每个用例都会甩出一条
//   TypeError: default.achievement.findMany is not a function
// 的 unhandled rejection（整份测试最终以 "Errors 59" 收场），
// 并且该异步重建还会和用例里显式的 rebuildDepTree() 竞争。
vi.mock('@challenge/database', () => ({
   default: {
      $queryRawUnsafe: vi.fn(),
      achievement: {
         findMany: vi.fn().mockResolvedValue([]),
         findUnique: vi.fn().mockResolvedValue(null),
      },
      achievementPreAchievement: {
         findMany: vi.fn().mockResolvedValue([]),
      },
      userAchievement: {
         findUnique: vi.fn().mockResolvedValue(null),
      },
   },
}));

import { AchievementObserver } from '../utils/achievement-observer';
import prisma from '@challenge/database';

// Cast to get access to the mocked function
const mockPrisma = prisma as any;

describe('AchievementObserver', () => {
   let observer: AchievementObserver;

   // AchievementObserver 的构造器会 fire-and-forget 调用 rebuildDepTree()，
   // 而该方法第一步就是 prisma.achievement.findMany(...)。所以每个用例都重建一份完整
   // mock，并等这次重建落地，否则：
   //   1) 未补齐模型的用例会抛出 unhandled rejection
   //      （TypeError: default.achievement.findMany is not a function）；
   //   2) 构造器内的异步重建会与该用例内显式的 rebuildDepTree() 竞争，造成偶发失败。
   beforeEach(async () => {
      mockPrisma.achievement = {
         findMany: vi.fn().mockResolvedValue([]),
         findUnique: vi.fn().mockResolvedValue(null),
      };
      observer = new AchievementObserver(() => null);
      await new Promise((resolve) => setTimeout(resolve, 0));
      vi.clearAllMocks();
   });

   describe('runQuery', () => {
      test('should execute query and cache result for new query', async () => {
         const mockResult = [{ id: 1, name: 'test' }];
         mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

         const sql = 'SELECT users.id, users.name FROM users';
         const result = await observer.runQuery('query1', sql);

         expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(sql);
         expect(result).toEqual(mockResult);
      });

      test('should return cached result for existing query', async () => {
         const mockResult = [{ id: 1, name: 'test' }];
         mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

         const sql = 'SELECT users.id, users.name FROM users';

         // First call
         await observer.runQuery('query1', sql);
         // Second call
         const result = await observer.runQuery('query1', sql);

         expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
         expect(result).toEqual(mockResult);
      });

      test('should throw error for non-SELECT operations', async () => {
         const sql = 'UPDATE users SET name = "test"';

         await expect(observer.runQuery('query1', sql)).rejects.toThrow(
            TRPCError
         );
      });

      test('should throw error for unqualified column references', async () => {
         const sql = 'SELECT id FROM users';

         await expect(observer.runQuery('query1', sql)).rejects.toThrow(
            TRPCError
         );
      });

      test('should re-execute dirty queries', async () => {
         const mockResult1 = [{ id: 1, name: 'test1' }];
         const mockResult2 = [{ id: 1, name: 'test2' }];
         mockPrisma.$queryRawUnsafe
            .mockResolvedValueOnce(mockResult1)
            .mockResolvedValueOnce(mockResult2);

         const sql = 'SELECT users.id, users.name FROM users';

         // First execution
         await observer.runQuery('query1', sql);

         // Mark as dirty
         await observer.manualMarkDirty('users');

         // Second execution should re-run query
         const result = await observer.runQuery('query1', sql);

         expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
         expect(result).toEqual(mockResult2);
      });

      test('should handle complex SQL with multiple tables', async () => {
         const mockResult = [{ user_id: 1, post_id: 2 }];
         mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

         const sql =
            'SELECT users.id, posts.title FROM users JOIN posts ON users.id = posts.user_id';
         const result = await observer.runQuery('query1', sql);

         expect(result).toEqual(mockResult);
      });
   });

   describe('manualMarkDirty', () => {
      test('should mark queries as dirty when path matches', async () => {
         const mockResult1 = [{ id: 1 }];
         const mockResult2 = [{ id: 2 }];
         mockPrisma.$queryRawUnsafe
            .mockResolvedValueOnce(mockResult1)
            .mockResolvedValueOnce(mockResult2);

         const sql = 'SELECT users.id FROM users';

         // Execute query first time
         await observer.runQuery('query1', sql);

         // Mark table as dirty
         await observer.manualMarkDirty('users');

         // Execute again - should re-run due to dirty flag
         const result = await observer.runQuery('query1', sql);

         expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
      });

      test('should mark queries as dirty when field path matches', async () => {
         const mockResult1 = [{ id: 1 }];
         const mockResult2 = [{ id: 2 }];
         mockPrisma.$queryRawUnsafe
            .mockResolvedValueOnce(mockResult1)
            .mockResolvedValueOnce(mockResult2);

         const sql = 'SELECT users.id FROM users';

         // Execute query first time
         await observer.runQuery('query1', sql);

         // Mark specific field as dirty
         await observer.manualMarkDirty('users.id');

         // Execute again - should re-run due to dirty flag
         const result = await observer.runQuery('query1', sql);

         expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
      });

      test('should not affect unrelated queries', async () => {
         const mockResult = [{ id: 1 }];
         mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

         const sql1 = 'SELECT users.id FROM users';
         const sql2 = 'SELECT posts.title FROM posts';

         // Execute both queries
         await observer.runQuery('query1', sql1);
         await observer.runQuery('query2', sql2);

         // Mark users as dirty
         await observer.manualMarkDirty('users');

         // Execute posts query again - should use cache
         await observer.runQuery('query2', sql2);

         expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
      });
   });

   describe('edge cases', () => {
      test('should handle empty path marking', async () => {
         expect(() => {
            observer.manualMarkDirty('nonexistent' as any);
         }).not.toThrow();
      });

      test('should handle SQL parsing errors gracefully', async () => {
         const invalidSql = 'INVALID SQL SYNTAX';

         await expect(
            observer.runQuery('query1', invalidSql)
         ).rejects.toThrow();
      });

      test('should handle database execution errors', async () => {
         mockPrisma.$queryRawUnsafe.mockRejectedValue(
            new Error('Database error')
         );

         const sql = 'SELECT users.id FROM users';

         await expect(observer.runQuery('query1', sql)).rejects.toThrow(
            'Database error'
         );
      });
   });

   describe('context variable injection functionality', () => {
      describe('_matchedContextVars method', () => {
         test('should match context variables in SQL', async () => {
            const mockResult = [{ id: 1 }];
            mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

            const sql =
               'SELECT users.id FROM users WHERE users.name = __ctx.userName';
            const injectVars = { userName: 'testUser' };

            await observer.runQuery('query1', sql, injectVars);

            // Should generate context CTE and inject it into SQL
            const expectedSql = `WITH __ctx AS (SELECT 'testUser' AS userName)\nSELECT users.id FROM users WHERE users.name = __ctx.userName`;
            expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
               expectedSql
            );
         });

         test('should match multiple context variables', async () => {
            const mockResult = [{ id: 1 }];
            mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

            const sql =
               'SELECT users.id FROM users WHERE users.name = __ctx.userName AND users.age > __ctx.userAge';
            const injectVars = { userName: 'testUser', userAge: 25 };

            await observer.runQuery('query1', sql, injectVars);

            const expectedSql = `WITH __ctx AS (SELECT 'testUser' AS userName, 25 AS userAge)\nSELECT users.id FROM users WHERE users.name = __ctx.userName AND users.age > __ctx.userAge`;
            expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
               expectedSql
            );
         });

         test('should handle numeric context variables', async () => {
            const mockResult = [{ id: 1 }];
            mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

            const sql =
               'SELECT users.id FROM users WHERE users.id = __ctx.userId';
            const injectVars = { userId: 123 };

            await observer.runQuery('query1', sql, injectVars);

            const expectedSql = `WITH __ctx AS (SELECT 123 AS userId)\nSELECT users.id FROM users WHERE users.id = __ctx.userId`;
            expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
               expectedSql
            );
         });

         test('should handle boolean context variables', async () => {
            const mockResult = [{ id: 1 }];
            mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

            const sql =
               'SELECT users.id FROM users WHERE users.active = __ctx.isActive';
            const injectVars = { isActive: true };

            await observer.runQuery('query1', sql, injectVars);

            const expectedSql = `WITH __ctx AS (SELECT true AS isActive)\nSELECT users.id FROM users WHERE users.active = __ctx.isActive`;
            expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
               expectedSql
            );
         });

         test('should only inject matched variables', async () => {
            const mockResult = [{ id: 1 }];
            mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

            const sql =
               'SELECT users.id FROM users WHERE users.name = __ctx.userName';
            const injectVars = { userName: 'testUser', unusedVar: 'unused' };

            await observer.runQuery('query1', sql, injectVars);

            // All provided variables are included in context, but only matched ones affect queryId
            const expectedSql = `WITH __ctx AS (SELECT 'testUser' AS userName, 'unused' AS unusedVar)\nSELECT users.id FROM users WHERE users.name = __ctx.userName`;
            expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
               expectedSql
            );
         });

         test('should handle SQL without context variables', async () => {
            const mockResult = [{ id: 1 }];
            mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

            const sql =
               'SELECT users.id FROM users WHERE users.name = "static"';

            await observer.runQuery('query1', sql);

            // Even though no context variables are used in SQL, context is still generated if injectVars provided
            expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(sql);
         });

         test('should filter out non-primitive types from context', async () => {
            const mockResult = [{ id: 1 }];
            mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

            const sql =
               'SELECT users.id FROM users WHERE users.name = __ctx.userName';
            const injectVars = {
               userName: 'testUser',
               objectVar: { nested: 'value' },
               arrayVar: [1, 2, 3],
               functionVar: () => 'test',
            };

            await observer.runQuery('query1', sql, injectVars);

            // Only primitive types should be included
            const expectedSql = `WITH __ctx AS (SELECT 'testUser' AS userName)\nSELECT users.id FROM users WHERE users.name = __ctx.userName`;
            expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
               expectedSql
            );
         });
      });

      describe('_injectCtxIntoSql method', () => {
         test('should inject context into simple SELECT statement', async () => {
            const mockResult = [{ id: 1 }];
            mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

            const sql =
               'SELECT users.id FROM users WHERE users.name = __ctx.userName';
            const injectVars = { userName: 'testUser' };

            await observer.runQuery('query1', sql, injectVars);

            const expectedSql = `WITH __ctx AS (SELECT 'testUser' AS userName)\nSELECT users.id FROM users WHERE users.name = __ctx.userName`;
            expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
               expectedSql
            );
         });

         test('should inject context into existing WITH clause', async () => {
            const mockResult = [{ id: 1 }];
            mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

            const sql =
               'WITH existing_cte AS (SELECT 1 as value) SELECT users.id FROM users, existing_cte WHERE users.name = __ctx.userName';
            const injectVars = { userName: 'testUser' };

            await observer.runQuery('query1', sql, injectVars);

            const expectedSql = `WITH __ctx AS (SELECT 'testUser' AS userName), existing_cte AS (SELECT 1 as value) SELECT users.id FROM users, existing_cte WHERE users.name = __ctx.userName`;
            expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
               expectedSql
            );
         });

         test('should inject context into WITH RECURSIVE clause', async () => {
            const mockResult = [{ id: 1 }];
            mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

            // Use a simpler recursive query that the parser can handle
            const sql =
               'WITH RECURSIVE tree AS (SELECT users.id FROM users WHERE users.parent_id = __ctx.rootId) SELECT tree.id FROM tree';
            const injectVars = { rootId: 1 };

            await observer.runQuery('query1', sql, injectVars);

            const expectedSql = `WITH RECURSIVE __ctx AS (SELECT 1 AS rootId), tree AS (SELECT users.id FROM users WHERE users.parent_id = __ctx.rootId) SELECT tree.id FROM tree`;
            expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
               expectedSql
            );
         });

         test('should handle empty context gracefully', async () => {
            const mockResult = [{ id: 1 }];
            mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

            const sql = 'SELECT users.id FROM users';
            const injectVars = {};

            await observer.runQuery('query1', sql, injectVars);

            // No context to inject, should execute original SQL
            expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(sql);
         });
      });

      describe('dynamic queryId construction with context variables', () => {
         test('should create unique queryId with single context variable', async () => {
            const mockResult1 = [{ id: 1, name: 'user1' }];
            const mockResult2 = [{ id: 2, name: 'user2' }];
            mockPrisma.$queryRawUnsafe
               .mockResolvedValueOnce(mockResult1)
               .mockResolvedValueOnce(mockResult2);

            const sql =
               'SELECT users.id, users.name FROM users WHERE users.id = __ctx.userId';

            // First call with userId = 1
            const result1 = await observer.runQuery('query1', sql, {
               userId: 1,
            });

            // Second call with userId = 2 (should execute new query)
            const result2 = await observer.runQuery('query1', sql, {
               userId: 2,
            });

            expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
            expect(result1).toEqual(mockResult1);
            expect(result2).toEqual(mockResult2);
         });

         test('should create unique queryId with multiple context variables', async () => {
            const mockResult1 = [{ id: 1 }];
            const mockResult2 = [{ id: 2 }];
            mockPrisma.$queryRawUnsafe
               .mockResolvedValueOnce(mockResult1)
               .mockResolvedValueOnce(mockResult2);

            const sql =
               'SELECT users.id FROM users WHERE users.name = __ctx.userName AND users.age = __ctx.userAge';

            // First call
            await observer.runQuery('query1', sql, {
               userName: 'alice',
               userAge: 25,
            });

            // Second call with different values
            await observer.runQuery('query1', sql, {
               userName: 'bob',
               userAge: 30,
            });

            expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
         });

         test('should use original queryId when no context variables are matched', async () => {
            const mockResult = [{ id: 1 }];
            mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

            const sql =
               'SELECT users.id FROM users WHERE users.name = "static"';

            // First call without injectVars
            await observer.runQuery('query1', sql);

            // Second call with empty injectVars
            await observer.runQuery('query1', sql, {});

            // Third call with unmatched injectVars
            await observer.runQuery('query1', sql, { unusedVar: 'value' });

            // Should only execute once as queryId remains the same
            expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
         });

         test('should handle dirty query with context variables correctly', async () => {
            const mockResult1 = [{ id: 1, name: 'old' }];
            const mockResult2 = [{ id: 1, name: 'new' }];
            mockPrisma.$queryRawUnsafe
               .mockResolvedValueOnce(mockResult1)
               .mockResolvedValueOnce(mockResult2);

            const sql =
               'SELECT users.id, users.name FROM users WHERE users.id = __ctx.userId';
            const injectVars = { userId: 1 };

            // First execution
            await observer.runQuery('query1', sql, injectVars);

            // Mark path as dirty
            await observer.manualMarkDirty('users');

            // Second execution should re-run due to dirty flag
            const result = await observer.runQuery('query1', sql, injectVars);

            expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
            expect(result).toEqual(mockResult2);
         });
      });

      describe('integration with path tracking', () => {
         test('should track paths correctly with context variables', async () => {
            const mockResult = [{ id: 1 }];
            mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

            const sql =
               'SELECT users.id, users.name FROM users WHERE users.age = __ctx.userAge';
            const injectVars = { userAge: 25 };

            // Execute query with context variables
            await observer.runQuery('query1', sql, injectVars);

            // Mark user table as dirty
            await observer.manualMarkDirty('users');

            // Re-execute - should trigger new query execution
            await observer.runQuery('query1', sql, injectVars);

            expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
         });

         test('should track different queryIds independently', async () => {
            const mockResult = [{ id: 1 }];
            mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

            const sql =
               'SELECT users.id FROM users WHERE users.age = __ctx.userAge';

            // Execute with different context variables
            await observer.runQuery('query1', sql, { userAge: 25 });
            await observer.runQuery('query1', sql, { userAge: 30 });

            // Mark users.id as dirty
            await observer.manualMarkDirty('users.id');

            // Both should re-execute
            await observer.runQuery('query1', sql, { userAge: 25 });
            await observer.runQuery('query1', sql, { userAge: 30 });

            expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(4);
         });
      });

      describe('edge cases with context variables', () => {
         test('should handle context variables with underscores and numbers', async () => {
            const mockResult = [{ id: 1 }];
            mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

            const sql =
               'SELECT users.id FROM users WHERE users.type = __ctx.user_type_1';
            const injectVars = { user_type_1: 'admin' };

            await observer.runQuery('query1', sql, injectVars);

            const expectedSql = `WITH __ctx AS (SELECT 'admin' AS user_type_1)\nSELECT users.id FROM users WHERE users.type = __ctx.user_type_1`;
            expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
               expectedSql
            );
         });

         test('should handle multiple references to same context variable', async () => {
            const mockResult = [{ id: 1 }];
            mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

            const sql =
               'SELECT users.id FROM users WHERE users.name = __ctx.userName OR users.nickname = __ctx.userName';
            const injectVars = { userName: 'testUser' };

            await observer.runQuery('query1', sql, injectVars);

            const expectedSql = `WITH __ctx AS (SELECT 'testUser' AS userName)\nSELECT users.id FROM users WHERE users.name = __ctx.userName OR users.nickname = __ctx.userName`;
            expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
               expectedSql
            );
         });

         test('should handle context variables in complex queries', async () => {
            const mockResult = [{ id: 1 }];
            mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

            const sql =
               'SELECT u.id, p.title FROM users u JOIN posts p ON u.id = p.author_id WHERE u.department = __ctx.userDept AND p.created_at >= __ctx.startDate';
            const injectVars = {
               userDept: 'engineering',
               startDate: '2023-01-01',
            };

            await observer.runQuery('query1', sql, injectVars);

            const expectedSql = `WITH __ctx AS (SELECT 'engineering' AS userDept, '2023-01-01' AS startDate)\nSELECT u.id, p.title FROM users u JOIN posts p ON u.id = p.author_id WHERE u.department = __ctx.userDept AND p.created_at >= __ctx.startDate`;
            expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
               expectedSql
            );
         });
      });
   });

   describe('useVarsInjector', () => {
      test('should register and use vars injector function', async () => {
         const mockResult = [{ id: 1 }];
         mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

         const sql =
            'SELECT users.id FROM users WHERE users.name = __ctx.userName';

         const injector = vi.fn(() => ({ userName: 'injectedUser' }));
         observer.useVarsInjector(injector);

         await observer.runQuery('query1', sql);

         const expectedSql = `WITH __ctx AS (SELECT 'injectedUser' AS userName)\nSELECT users.id FROM users WHERE users.name = __ctx.userName`;
         expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(expectedSql);
         expect(injector).toHaveBeenCalled();
      });

      test('should combine multiple vars injectors', async () => {
         const mockResult = [{ id: 1 }];
         mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

         const sql =
            'SELECT users.id FROM users WHERE users.name = __ctx.userName AND users.age = __ctx.userAge';

         const injector1 = vi.fn(() => ({ userName: 'user1' }));
         const injector2 = vi.fn(() => ({ userAge: 30 }));
         observer.useVarsInjector(injector1);
         observer.useVarsInjector(injector2);

         await observer.runQuery('query1', sql);

         const expectedSql = `WITH __ctx AS (SELECT 'user1' AS userName, 30 AS userAge)\nSELECT users.id FROM users WHERE users.name = __ctx.userName AND users.age = __ctx.userAge`;
         expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(expectedSql);
         expect(injector1).toHaveBeenCalled();
         expect(injector2).toHaveBeenCalled();
      });

      test('should handle injectors returning overlapping keys', async () => {
         const mockResult = [{ id: 1 }];
         mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

         const sql =
            'SELECT users.id FROM users WHERE users.name = __ctx.userName AND users.age = __ctx.userAge';

         const injector1 = vi.fn(() => ({ userName: 'user1', userAge: 25 }));
         const injector2 = vi.fn(() => ({ userAge: 30 })); // Overlapping key
         observer.useVarsInjector(injector1);
         observer.useVarsInjector(injector2);

         await observer.runQuery('query1', sql);

         // Last injector's value should take precedence
         const expectedSql = `WITH __ctx AS (SELECT 'user1' AS userName, 30 AS userAge)\nSELECT users.id FROM users WHERE users.name = __ctx.userName AND users.age = __ctx.userAge`;
         expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(expectedSql);
         expect(injector1).toHaveBeenCalled();
         expect(injector2).toHaveBeenCalled();
      });

      test('should ignore non-object returns from injectors', async () => {
         const mockResult = [{ id: 1 }];
         mockPrisma.$queryRawUnsafe.mockResolvedValue(mockResult);

         const sql =
            'SELECT users.id FROM users WHERE users.name = __ctx.userName';

         const injector1 = vi.fn(() => ({ userName: 'user1' }));
         const injector2 = vi.fn(() => null); // Invalid return
         const injector3 = vi.fn(() => 'string'); // Invalid return
         observer.useVarsInjector(injector1);
         observer.useVarsInjector(injector2 as any);
         observer.useVarsInjector(injector3 as any);

         await observer.runQuery('query1', sql);

         const expectedSql = `WITH __ctx AS (SELECT 'user1' AS userName)\nSELECT users.id FROM users WHERE users.name = __ctx.userName`;
         expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(expectedSql);
         expect(injector1).toHaveBeenCalled();
         expect(injector2).toHaveBeenCalled();
         expect(injector3).toHaveBeenCalled();
      });
   });

   describe('triggerCheckAchievement', () => {
      beforeEach(() => {
         // 只重置用到的部分，**不要**整体替换 achievement 对象：
         // 丢掉 findMany 会让后续用例的构造器在 rebuildDepTree() 里再次抛异常。
         (mockPrisma as any).achievement.findUnique.mockResolvedValue(null);
         (mockPrisma as any).achievement.findMany.mockResolvedValue([]);
      });

      test('should execute achievement check and return true when condition is met', async () => {
         const mockAchievement = {
            AchievementValidateScript: {
               script:
                  '(depData) => ({ achieved: depData.problemCount > 10, progress: depData.problemCount / 20 })',
            },
            AchievementDependencyData: [
               {
                  achievementDepDataLoader: {
                     id: 1,
                     name: 'problemCount',
                     type: 'NUMERIC',
                     sql: 'SELECT problems.pid AS value FROM problems WHERE problems.pid > 0',
                  },
               },
            ],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );
         mockPrisma.$queryRawUnsafe.mockResolvedValue([{ value: 15 }]);

         const result = await observer.triggerCheckAchievement(1);

         expect(result).toStrictEqual({ achieved: true, progress: 0.75, score: 0 });
         expect(
            (mockPrisma as any).achievement.findUnique
         ).toHaveBeenCalledWith({
            where: { id: 1 },
            select: {
               AchievementValidateScript: {
                  select: {
                     script: true,
                  },
               },
               AchievementDependencyData: {
                  select: {
                     achievementDepDataLoader: {
                        select: {
                           id: true,
                           name: true,
                           type: true,
                           sql: true,
                           isList: true,
                        },
                     },
                  },
               },
               score: true,
            },
         });
      });

      test('should execute achievement check and return false when condition is not met', async () => {
         const mockAchievement = {
            AchievementValidateScript: {
               script:
                  '(depData) => ({ achieved: depData.problemCount >= 10, progress: depData.problemCount / 10 })',
            },
            AchievementDependencyData: [
               {
                  achievementDepDataLoader: {
                     id: 1,
                     name: 'problemCount',
                     type: 'NUMERIC',
                     sql: 'SELECT problems.pid AS value FROM problems WHERE problems.pid > 0',
                  },
               },
            ],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );
         mockPrisma.$queryRawUnsafe.mockResolvedValue([{ value: 5 }]);

         const result = await observer.triggerCheckAchievement(1);

         expect(result).toStrictEqual({ achieved: false, progress: 0.5, score: 0 });
      });

      test('should throw error when achievement validation script is not set', async () => {
         const mockAchievement = {
            AchievementValidateScript: null,
            AchievementDependencyData: [],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );

         await expect(observer.triggerCheckAchievement(1)).rejects.toThrow(
            TRPCError
         );
         await expect(observer.triggerCheckAchievement(1)).rejects.toThrow(
            '成就（ID: 1）的达成检测脚本未设置'
         );
      });

      test('should handle multiple dependency data loaders', async () => {
         const mockAchievement = {
            AchievementValidateScript: {
               script:
                  '(depData) => ({ achieved: depData.problemCount >= 10 && depData.isActive, progress: depData.problemCount / 10 })',
            },
            AchievementDependencyData: [
               {
                  achievementDepDataLoader: {
                     id: 1,
                     name: 'problemCount',
                     type: 'NUMERIC',
                     sql: 'SELECT problems.pid AS value FROM problems',
                  },
               },
               {
                  achievementDepDataLoader: {
                     id: 2,
                     name: 'isActive',
                     type: 'BOOLEAN',
                     sql: 'SELECT users.id AS value FROM users WHERE users.id = "1"',
                  },
               },
            ],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );
         mockPrisma.$queryRawUnsafe
            .mockResolvedValueOnce([{ value: 8 }])
            .mockResolvedValueOnce([{ value: true }]);

         const result = await observer.triggerCheckAchievement(1);

         expect(result).toStrictEqual({ achieved: false, progress: 0.8, score: 0 });
         expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
      });

      test('should handle BOOLEAN type data loader', async () => {
         const mockAchievement = {
            AchievementValidateScript: {
               script:
                  '(depData) => ({ achieved: depData.hasCompletedTask, progress: depData.hasCompletedTask ? 1 : 0 })',
            },
            AchievementDependencyData: [
               {
                  achievementDepDataLoader: {
                     id: 1,
                     name: 'hasCompletedTask',
                     type: 'BOOLEAN',
                     sql: 'SELECT users.id AS value FROM users WHERE users.id = "1"',
                  },
               },
            ],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );
         mockPrisma.$queryRawUnsafe.mockResolvedValue([{ value: true }]);

         const result = await observer.triggerCheckAchievement(1);

         expect(result).toStrictEqual({ achieved: true, progress: 1, score: 0 });
      });

      test('should handle TEXT type data loader', async () => {
         const mockAchievement = {
            AchievementValidateScript: {
               script:
                  '(depData) => ({ achieved: depData.userName === "testUser", progress: depData.userName === "testUser" ? 1 : 0 })',
            },
            AchievementDependencyData: [
               {
                  achievementDepDataLoader: {
                     id: 1,
                     name: 'userName',
                     type: 'TEXT',
                     sql: 'SELECT users.name AS value FROM users WHERE users.id = "1"',
                  },
               },
            ],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );
         mockPrisma.$queryRawUnsafe.mockResolvedValue([{ value: 'testUser' }]);

         const result = await observer.triggerCheckAchievement(1);

         expect(result).toStrictEqual({ achieved: true, progress: 1, score: 0 });
      });

      test('should handle empty result from data loader', async () => {
         const mockAchievement = {
            AchievementValidateScript: {
               script:
                  '(depData) => ({ achieved: depData.count > 0, progress: depData.count / 10 })',
            },
            AchievementDependencyData: [
               {
                  achievementDepDataLoader: {
                     id: 1,
                     name: 'count',
                     type: 'NUMERIC',
                     sql: 'SELECT problems.pid AS value FROM problems',
                  },
               },
            ],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );
         mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

         const result = await observer.triggerCheckAchievement(1);

         expect(result).toStrictEqual({ achieved: false, progress: 0, score: 0 });
      });

      test('should use default values when loader returns no data', async () => {
         const mockAchievement = {
            AchievementValidateScript: {
               script: `(depData) => {
                     const r = depData.numericValue === 0 && !depData.boolValue && depData.textValue === "";
                     return { achieved: r, progress: r ? 1 : 0 };
                  }`,
            },
            AchievementDependencyData: [
               {
                  achievementDepDataLoader: {
                     id: 1,
                     name: 'numericValue',
                     type: 'NUMERIC',
                     sql: 'SELECT problems.pid AS value FROM problems',
                  },
               },
               {
                  achievementDepDataLoader: {
                     id: 2,
                     name: 'boolValue',
                     type: 'BOOLEAN',
                     sql: 'SELECT users.id AS value FROM users',
                  },
               },
               {
                  achievementDepDataLoader: {
                     id: 3,
                     name: 'textValue',
                     type: 'TEXT',
                     sql: 'SELECT users.name AS value FROM users',
                  },
               },
            ],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );
         mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

         const result = await observer.triggerCheckAchievement(1);

         expect(result).toStrictEqual({ achieved: true, progress: 1, score: 0 });
      });

      test('should throw error when script execution fails', async () => {
         const mockAchievement = {
            AchievementValidateScript: {
               script: '(depData) => { throw new Error("Script error"); }',
            },
            AchievementDependencyData: [
               {
                  achievementDepDataLoader: {
                     id: 1,
                     name: 'count',
                     type: 'NUMERIC',
                     sql: 'SELECT problems.pid AS value FROM problems',
                  },
               },
            ],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );
         mockPrisma.$queryRawUnsafe.mockResolvedValue([{ value: 10 }]);

         await expect(observer.triggerCheckAchievement(1)).rejects.toThrow(
            TRPCError
         );
         await expect(observer.triggerCheckAchievement(1)).rejects.toThrow(
            '成就判定条件脚本执行失败'
         );
      });

      test('should pass injectVars to runQuery', async () => {
         const mockAchievement = {
            AchievementValidateScript: {
               script:
                  '(depData) => ({ achieved: depData.userProblemCount >= 5, progress: depData.userProblemCount / 5 })',
            },
            AchievementDependencyData: [
               {
                  achievementDepDataLoader: {
                     id: 1,
                     name: 'userProblemCount',
                     type: 'NUMERIC',
                     sql: 'SELECT problems.pid AS value FROM problems WHERE problems.pid = __ctx.userId',
                  },
               },
            ],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );
         mockPrisma.$queryRawUnsafe.mockResolvedValue([{ value: 2 }]);

         const injectVars = { userId: 'user123' };
         const result = await observer.triggerCheckAchievement(
            1,
            undefined,
            injectVars
         );

         expect(result).toStrictEqual({ achieved: false, progress: 0.4, score: 0 });
         expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
            expect.stringContaining("SELECT 'user123' AS userId")
         );
      });

      test('should handle complex script logic', async () => {
         const mockAchievement = {
            AchievementValidateScript: {
               script: `(depData) => {
                  const { problemCount, difficulty, isActive } = depData;
                  const r = problemCount >= 10 && difficulty === 'hard' && isActive;
                  return { achieved: r, progress: r ? 1 : (problemCount / 10) * 0.5 + (difficulty === 'hard' ? 0.3 : 0) + (isActive ? 0.2 : 0)}
               }`,
            },
            AchievementDependencyData: [
               {
                  achievementDepDataLoader: {
                     id: 1,
                     name: 'problemCount',
                     type: 'NUMERIC',
                     sql: 'SELECT problems.pid AS value FROM problems',
                  },
               },
               {
                  achievementDepDataLoader: {
                     id: 2,
                     name: 'difficulty',
                     type: 'TEXT',
                     sql: 'SELECT problems.difficulty AS value FROM problems',
                  },
               },
               {
                  achievementDepDataLoader: {
                     id: 3,
                     name: 'isActive',
                     type: 'BOOLEAN',
                     sql: 'SELECT users.id AS value FROM users',
                  },
               },
            ],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );
         mockPrisma.$queryRawUnsafe
            .mockResolvedValueOnce([{ value: 15 }])
            .mockResolvedValueOnce([{ value: 'hard' }])
            .mockResolvedValueOnce([{ value: true }]);

         const result = await observer.triggerCheckAchievement(1);

         expect(result).toStrictEqual({ achieved: true, progress: 1, score: 0 });
      });

      test('should emit check event with achievement result', async () => {
         const mockAchievement = {
            AchievementValidateScript: {
               script:
                  '(depData) => ({ achieved: depData.count >= 5, progress: depData.count / 5 })',
            },
            AchievementDependencyData: [
               {
                  achievementDepDataLoader: {
                     id: 1,
                     name: 'count',
                     type: 'NUMERIC',
                     sql: 'SELECT problems.pid AS value FROM problems',
                  },
               },
            ],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );
         mockPrisma.$queryRawUnsafe.mockResolvedValue([{ value: 1 }]);

         const checkListener = vi.fn();
         observer.addListener('check', checkListener);

         await observer.triggerCheckAchievement(1);

         expect(checkListener).toHaveBeenCalledWith(
            1,
            { achieved: false, progress: 0.2, score: 0 },
            undefined,
            undefined
         );

         observer.removeListener('check', checkListener);
      });

      test('should emit check event with injectVars', async () => {
         const mockAchievement = {
            AchievementValidateScript: {
               script:
                  '(depData) => ({ achieved: depData.count >= 5, progress: depData.count / 5 })',
            },
            AchievementDependencyData: [
               {
                  achievementDepDataLoader: {
                     id: 1,
                     name: 'count',
                     type: 'NUMERIC',
                     sql: 'SELECT problems.pid AS value FROM problems',
                  },
               },
            ],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );
         mockPrisma.$queryRawUnsafe.mockResolvedValue([{ value: 2 }]);

         const checkListener = vi.fn();
         observer.addListener('check', checkListener);

         const injectVars = { userId: 'test123' };
         await observer.triggerCheckAchievement(1, undefined, injectVars);

         expect(checkListener).toHaveBeenCalledWith(
            1,
            { achieved: false, progress: 0.4, score: 0 },
            undefined,
            injectVars
         );

         observer.removeListener('check', checkListener);
      });

      test('should emit error event when script execution fails', async () => {
         const mockAchievement = {
            AchievementValidateScript: {
               script: '(depData) => { invalid syntax here',
            },
            AchievementDependencyData: [
               {
                  achievementDepDataLoader: {
                     id: 1,
                     name: 'count',
                     type: 'NUMERIC',
                     sql: 'SELECT problems.pid AS value FROM problems',
                  },
               },
            ],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );
         mockPrisma.$queryRawUnsafe.mockResolvedValue([{ value: 10 }]);

         const errorListener = vi.fn();
         observer.addListener('error', errorListener);

         await expect(observer.triggerCheckAchievement(1)).rejects.toThrow();

         expect(errorListener).toHaveBeenCalledWith(
            expect.objectContaining({
               code: 'INTERNAL_SERVER_ERROR',
            })
         );

         observer.removeListener('error', errorListener);
      });

      test('should emit error event when achievement has no script', async () => {
         const mockAchievement = {
            AchievementValidateScript: null,
            AchievementDependencyData: [],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );

         const errorListener = vi.fn();
         observer.addListener('error', errorListener);

         await expect(observer.triggerCheckAchievement(1)).rejects.toThrow();

         expect(errorListener).toHaveBeenCalledWith(
            expect.objectContaining({
               code: 'INTERNAL_SERVER_ERROR',
               message: '成就（ID: 1）的达成检测脚本未设置',
            })
         );

         observer.removeListener('error', errorListener);
      });

      test('should handle truthy/falsy values correctly', async () => {
         // Test with value 0 (falsy)
         const mockAchievement1 = {
            AchievementValidateScript: {
               script:
                  '(depData) => ({ achieved: depData.value, progress: depData.value })',
            },
            AchievementDependencyData: [
               {
                  achievementDepDataLoader: {
                     id: 1,
                     name: 'value',
                     type: 'NUMERIC',
                     sql: 'SELECT problems.pid AS value FROM problems',
                  },
               },
            ],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValueOnce(
            mockAchievement1
         );
         mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ value: 0 }]);
         let result = await observer.triggerCheckAchievement(1);
         expect(result).toStrictEqual({ achieved: false, progress: 0, score: 0 });

         // Test with value 1 (truthy) using a different loader id to avoid cache
         const mockAchievement2 = {
            AchievementValidateScript: {
               script: '(depData) => depData.value',
            },
            AchievementDependencyData: [
               {
                  achievementDepDataLoader: {
                     id: 2, // Different loader id to bypass cache
                     name: 'value',
                     type: 'NUMERIC',
                     sql: 'SELECT problems.pid AS value FROM problems',
                  },
               },
            ],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValueOnce(
            mockAchievement2
         );
         mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ value: 1 }]);
         result = await observer.triggerCheckAchievement(2); // Different achievement id
         expect(result).toStrictEqual({ achieved: false, progress: 0, score: 0 });
      });

      test('should handle undefined script return value', async () => {
         const mockAchievement = {
            AchievementValidateScript: {
               script: '(depData) => {}',
            },
            AchievementDependencyData: [
               {
                  achievementDepDataLoader: {
                     id: 1,
                     name: 'count',
                     type: 'NUMERIC',
                     sql: 'SELECT problems.pid AS value FROM problems',
                  },
               },
            ],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );
         mockPrisma.$queryRawUnsafe.mockResolvedValue([{ value: 10 }]);

         const result = await observer.triggerCheckAchievement(1);

         expect(result).toStrictEqual({ achieved: false, progress: 0, score: 0 });
      });

      test('should handle achievement with no dependency data', async () => {
         const mockAchievement = {
            AchievementValidateScript: {
               script: '(depData) => ({ achieved: true, progress: 1, score: 0 })',
            },
            AchievementDependencyData: [],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );

         const result = await observer.triggerCheckAchievement(1);

         expect(result).toStrictEqual({ achieved: true, progress: 1, score: 0 });
         expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
      });

      test('should sandbox the script execution properly', async () => {
         const mockAchievement = {
            AchievementValidateScript: {
               // Trying to access Node.js globals should fail
               script:
                  '(depData) => { try { return {achieved:typeof process !== "undefined",progress:1}; } catch(e) { return false; } }',
            },
            AchievementDependencyData: [],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );

         const result = await observer.triggerCheckAchievement(1);

         expect(result).toStrictEqual({ achieved: false, progress: 1, score: 0 });
      });

      test('should timeout long-running scripts', async () => {
         const mockAchievement = {
            AchievementValidateScript: {
               script: '(depData) => { while(true) {} }',
            },
            AchievementDependencyData: [],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );

         await expect(observer.triggerCheckAchievement(1)).rejects.toThrow(
            TRPCError
         );
      });
   });

   describe('dependency tracking and automatic achievement checking', () => {
      beforeEach(() => {
         // Setup achievement mock
         (mockPrisma as any).achievement = {
            findUnique: vi.fn(),
            findMany: vi.fn(),
         };
      });

      test('should build dependency tree from achievements', async () => {
         const mockAchievements = [
            {
               id: 1,
               AchievementDependencyData: [
                  {
                     achievementDepDataLoader: {
                        id: 1,
                        sql: 'SELECT problems.pid, problems.title FROM problems',
                     },
                  },
               ],
            },
            {
               id: 2,
               AchievementDependencyData: [
                  {
                     achievementDepDataLoader: {
                        id: 2,
                        sql: 'SELECT users.id, users.name FROM users',
                     },
                  },
               ],
            },
         ];

         (mockPrisma as any).achievement.findMany.mockResolvedValue(
            mockAchievements
         );

         await observer.rebuildDepTree();

         expect((mockPrisma as any).achievement.findMany).toHaveBeenCalledWith({
            select: {
               id: true,
               AchievementDependencyData: {
                  select: {
                     achievementDepDataLoader: {
                        select: {
                           id: true,
                           sql: true,
                        },
                     },
                  },
               },
            },
         });
      });

      test('should trigger achievement check when dependent field changes via manualMarkDirty', async () => {
         // Setup dependency tree
         const mockAchievements = [
            {
               id: 1,
               AchievementDependencyData: [
                  {
                     achievementDepDataLoader: {
                        id: 1,
                        sql: 'SELECT problems.pid AS value FROM problems',
                     },
                  },
               ],
            },
         ];

         (mockPrisma as any).achievement.findMany.mockResolvedValue(
            mockAchievements
         );
         await observer.rebuildDepTree();

         // Setup achievement check mock
         const mockAchievement = {
            AchievementValidateScript: {
               script:
                  '(depData) => ({ achieved: depData.count >= 5, progress: depData.count / 5 })',
            },
            AchievementDependencyData: [
               {
                  achievementDepDataLoader: {
                     id: 1,
                     name: 'count',
                     type: 'NUMERIC',
                     sql: 'SELECT problems.pid AS value FROM problems',
                  },
               },
            ],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );
         mockPrisma.$queryRawUnsafe.mockResolvedValue([{ value: 1 }]);

         const checkListener = vi.fn();
         observer.addListener('check', checkListener);

         // Trigger field change
         observer.manualMarkDirty('problems.pid');

         // Wait for microtask to complete
         await new Promise((resolve) => setTimeout(resolve, 0));

         expect(checkListener).toHaveBeenCalledWith(
            1,
            { achieved: false, progress: 0.2, score: 0 },
            undefined,
            undefined
         );

         observer.removeListener('check', checkListener);
      });

      test('should trigger achievement check when table changes via manualMarkDirty', async () => {
         // Setup dependency tree
         const mockAchievements = [
            {
               id: 1,
               AchievementDependencyData: [
                  {
                     achievementDepDataLoader: {
                        id: 1,
                        sql: 'SELECT users.id, users.name FROM users',
                     },
                  },
               ],
            },
         ];

         (mockPrisma as any).achievement.findMany.mockResolvedValue(
            mockAchievements
         );
         await observer.rebuildDepTree();

         // Setup achievement check mock
         const mockAchievement = {
            AchievementValidateScript: {
               script:
                  '(depData) => ({ achieved: depData.userCount >= 5, progress: depData.userCount / 5 })',
            },
            AchievementDependencyData: [
               {
                  achievementDepDataLoader: {
                     id: 1,
                     name: 'userCount',
                     type: 'NUMERIC',
                     sql: 'SELECT users.id, users.name FROM users',
                  },
               },
            ],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );
         mockPrisma.$queryRawUnsafe.mockResolvedValue([{ value: 5 }]);

         const checkListener = vi.fn();
         observer.addListener('check', checkListener);

         // Trigger table change (e.g., new user created)
         observer.manualMarkDirty('users');

         // Wait for microtask to complete
         await new Promise((resolve) => setTimeout(resolve, 0));

         expect(checkListener).toHaveBeenCalledWith(
            1,
            { achieved: true, progress: 1, score: 0 },
            undefined,
            undefined
         );

         observer.removeListener('check', checkListener);
      });

      test('should trigger multiple achievements when they depend on same field', async () => {
         // Setup dependency tree with multiple achievements depending on same field
         const mockAchievements = [
            {
               id: 1,
               AchievementDependencyData: [
                  {
                     achievementDepDataLoader: {
                        id: 1,
                        sql: 'SELECT problems.pid AS value FROM problems',
                     },
                  },
               ],
            },
            {
               id: 2,
               AchievementDependencyData: [
                  {
                     achievementDepDataLoader: {
                        id: 2,
                        sql: 'SELECT problems.pid, problems.title AS value FROM problems',
                     },
                  },
               ],
            },
         ];

         (mockPrisma as any).achievement.findMany.mockResolvedValue(
            mockAchievements
         );
         await observer.rebuildDepTree();

         // Setup achievement check mocks
         const mockAchievement1 = {
            AchievementValidateScript: {
               script:
                  '(depData) => ({ achieved: depData.count >= 5, progress: depData.count / 5 })',
            },
            AchievementDependencyData: [
               {
                  achievementDepDataLoader: {
                     id: 1,
                     name: 'count',
                     type: 'NUMERIC',
                     sql: 'SELECT problems.pid AS value FROM problems',
                  },
               },
            ],
         };

         const mockAchievement2 = {
            AchievementValidateScript: {
               script:
                  '(depData) => ({ achieved: depData.count >= 5, progress: depData.count / 5 })',
            },
            AchievementDependencyData: [
               {
                  achievementDepDataLoader: {
                     id: 2,
                     name: 'count',
                     type: 'NUMERIC',
                     sql: 'SELECT problems.pid, problems.title AS value FROM problems',
                  },
               },
            ],
         };

         (mockPrisma as any).achievement.findUnique
            .mockResolvedValueOnce(mockAchievement1)
            .mockResolvedValueOnce(mockAchievement2);

         mockPrisma.$queryRawUnsafe
            .mockResolvedValueOnce([{ value: 2 }])
            .mockResolvedValueOnce([{ value: 4 }]);

         const checkListener = vi.fn();
         observer.addListener('check', checkListener);

         // Trigger field change
         observer.manualMarkDirty('problems.pid');

         // Wait for microtask to complete
         await new Promise((resolve) => setTimeout(resolve, 0));

         expect(checkListener).toHaveBeenCalledTimes(2);
         expect(checkListener).toHaveBeenCalledWith(
            1,
            { achieved: false, progress: 0.4, score: 0 },
            undefined,
            undefined
         );
         expect(checkListener).toHaveBeenCalledWith(
            2,
            { achieved: false, progress: 0.8, score: 0 },
            undefined,
            undefined
         );

         observer.removeListener('check', checkListener);
      });

      test('injectVars 里的 userId 会被当作本次判定的用户（判题完成路径依赖它）', async () => {
         // Setup dependency tree
         const mockAchievements = [
            {
               id: 1,
               AchievementDependencyData: [
                  {
                     achievementDepDataLoader: {
                        id: 1,
                        sql: 'SELECT problems.pid AS value FROM problems WHERE problems.pid = __ctx.userId',
                     },
                  },
               ],
            },
         ];

         (mockPrisma as any).achievement.findMany.mockResolvedValue(
            mockAchievements
         );
         await observer.rebuildDepTree();

         // Setup achievement check mock
         const mockAchievement = {
            AchievementValidateScript: {
               script:
                  '(depData) => ({achieved: depData.count >= 5, progress: depData.count/5})',
            },
            AchievementDependencyData: [
               {
                  achievementDepDataLoader: {
                     id: 1,
                     name: 'count',
                     type: 'NUMERIC',
                     sql: 'SELECT problems.pid AS value FROM problems WHERE problems.pid = __ctx.userId',
                  },
               },
            ],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );
         mockPrisma.$queryRawUnsafe.mockResolvedValue([{ value: 2 }]);

         const checkListener = vi.fn();
         observer.addListener('check', checkListener);

         const injectVars = { userId: 'user123' };
         observer.manualMarkDirty('problems.pid', injectVars);

         // Wait for microtask to complete
         await new Promise((resolve) => setTimeout(resolve, 0));

         // 注意第三个参数：injectVars.userId 必须被当成"这次判定属于谁"。
         // 判题完成 webhook 里没有请求上下文（_useUserId() 拿不到人），只能靠它把
         // 用户带进来；若仍传出 undefined，发分监听器会立刻 return，成就永不落库。
         expect(checkListener).toHaveBeenCalledWith(
            1,
            { achieved: false, progress: 0.4, score: 0 },
            'user123',
            injectVars
         );

         observer.removeListener('check', checkListener);
      });

      test('should not trigger achievement check for unrelated field changes', async () => {
         // Setup dependency tree - achievement depends on problems table
         const mockAchievements = [
            {
               id: 1,
               AchievementDependencyData: [
                  {
                     achievementDepDataLoader: {
                        id: 1,
                        sql: 'SELECT problems.pid AS value FROM problems',
                     },
                  },
               ],
            },
         ];

         (mockPrisma as any).achievement.findMany.mockResolvedValue(
            mockAchievements
         );
         await observer.rebuildDepTree();

         const mockAchievement = {
            AchievementValidateScript: {
               script:
                  '(depData) => ({ achieved: depData.count >= 5, progress: depData.count / 5 })',
            },
            AchievementDependencyData: [
               {
                  achievementDepDataLoader: {
                     id: 1,
                     name: 'count',
                     type: 'NUMERIC',
                     sql: 'SELECT problems.pid AS value FROM problems',
                  },
               },
            ],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );
         mockPrisma.$queryRawUnsafe.mockResolvedValue([{ value: 10 }]);

         const checkListener = vi.fn();
         observer.addListener('check', checkListener);

         // Trigger change on unrelated table
         observer.manualMarkDirty('problems.title');

         // Wait for microtask to complete
         await new Promise((resolve) => setTimeout(resolve, 0));

         // Should not trigger any achievement check
         expect(checkListener).not.toHaveBeenCalled();

         observer.removeListener('check', checkListener);
      });

      test('should batch multiple field changes in same microtask', async () => {
         // Setup dependency tree
         const mockAchievements = [
            {
               id: 999,
               AchievementDependencyData: [
                  {
                     achievementDepDataLoader: {
                        id: 1,
                        sql: 'SELECT problems.pid, problems.title FROM problems',
                     },
                  },
               ],
            },
         ];

         (mockPrisma as any).achievement.findMany.mockResolvedValue(
            mockAchievements
         );
         await observer.rebuildDepTree();

         // Setup achievement check mock
         const mockAchievement = {
            AchievementValidateScript: {
               script:
                  '(depData) => ({achieved: depData.count >= 5, progress: depData.count/5})',
            },
            AchievementDependencyData: [
               {
                  achievementDepDataLoader: {
                     id: 1,
                     name: 'count',
                     type: 'NUMERIC',
                     sql: 'SELECT problems.pid, problems.title FROM problems',
                  },
               },
            ],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );
         mockPrisma.$queryRawUnsafe.mockResolvedValue([{ value: 2 }]);

         const checkListener = vi.fn();
         observer.addListener('check', checkListener);

         // Trigger multiple field changes synchronously
         observer.manualMarkDirty('problems.pid');
         observer.manualMarkDirty('problems.title');

         // Wait for microtask to complete
         await new Promise((resolve) => setTimeout(resolve, 0));

         // Should only check once (batched)
         expect(checkListener).toHaveBeenCalledTimes(1);
         expect(checkListener).toHaveBeenCalledWith(
            999,
            { achieved: false, progress: 0.4, score: 0 },
            undefined,
            undefined
         );

         observer.removeListener('check', checkListener);
      });

      test('should emit error when achievement check fails during auto-trigger', async () => {
         // Setup dependency tree
         const mockAchievements = [
            {
               id: 1,
               AchievementDependencyData: [
                  {
                     achievementDepDataLoader: {
                        id: 1,
                        sql: 'SELECT problems.pid AS value FROM problems',
                     },
                  },
               ],
            },
         ];

         (mockPrisma as any).achievement.findMany.mockResolvedValue(
            mockAchievements
         );
         await observer.rebuildDepTree();

         // Setup achievement with invalid script
         const mockAchievement = {
            AchievementValidateScript: null, // Missing script
            AchievementDependencyData: [],
         };

         (mockPrisma as any).achievement.findUnique.mockResolvedValue(
            mockAchievement
         );

         const errorListener = vi.fn();
         observer.addListener('error', errorListener);

         // Trigger field change
         observer.manualMarkDirty('problems.pid');

         // Wait for microtask to complete
         await new Promise((resolve) => setTimeout(resolve, 0));

         expect(errorListener).toHaveBeenCalledWith(
            expect.objectContaining({
               code: 'INTERNAL_SERVER_ERROR',
               message: '成就（ID: 1）的达成检测脚本未设置',
            })
         );

         observer.removeListener('error', errorListener);
      });

      test('should emit dirty event when field is marked dirty', async () => {
         const dirtyListener = vi.fn();
         observer.addListener('dirty', dirtyListener);

         observer.manualMarkDirty('problems.pid');

         expect(dirtyListener).toHaveBeenCalledWith('problems.pid');

         observer.removeListener('dirty', dirtyListener);
      });

      test('should invalidate query cache when dependent field is marked dirty', async () => {
         // First, execute a query to cache it
         const sql = 'SELECT problems.pid AS value FROM problems';
         mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ value: 5 }]);
         await observer.runQuery('query1', sql);

         expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);

         // Mark the field as dirty
         observer.manualMarkDirty('problems.pid');

         // Execute the same query again - should re-run due to dirty flag
         mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ value: 10 }]);
         const result = await observer.runQuery('query1', sql);

         expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
         expect(result).toEqual([{ value: 10 }]);
      });

      test('should emit rebuild event after rebuilding dependency tree', async () => {
         const mockAchievements = [
            {
               id: 1,
               AchievementDependencyData: [
                  {
                     achievementDepDataLoader: {
                        id: 1,
                        sql: 'SELECT problems.pid AS value FROM problems',
                     },
                  },
               ],
            },
         ];

         (mockPrisma as any).achievement.findMany.mockResolvedValue(
            mockAchievements
         );

         const rebuildListener = vi.fn();
         observer.addListener('rebuild', rebuildListener);

         await observer.rebuildDepTree();

         expect(rebuildListener).toHaveBeenCalled();

         observer.removeListener('rebuild', rebuildListener);
      });

      test('should throw error when loader SQL is invalid during rebuild', async () => {
         const mockAchievements = [
            {
               id: 1,
               AchievementDependencyData: [
                  {
                     achievementDepDataLoader: {
                        id: 1,
                        sql: 'UPDATE problems SET title = "test"', // Invalid: not SELECT
                     },
                  },
               ],
            },
         ];

         (mockPrisma as any).achievement.findMany.mockResolvedValue(
            mockAchievements
         );

         await expect(observer.rebuildDepTree()).rejects.toThrow(TRPCError);
         await expect(observer.rebuildDepTree()).rejects.toThrow(
            '成就依赖的数据加载器（ID: 1）的 SQL 语句中只能包含 SELECT 操作，且列引用必须限定表名或表别名'
         );
      });
   });
});
