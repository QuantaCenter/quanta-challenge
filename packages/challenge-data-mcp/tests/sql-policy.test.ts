import assert from 'node:assert/strict';
import test from 'node:test';
import { SqlPolicyError, validateReadOnlySql } from '../src/database/sql-policy';

test('允许白名单视图和只读 CTE', () => {
  assert.deepEqual(
    validateReadOnlySql('SELECT id, name FROM agent_read.users'),
    { sql: 'SELECT id, name FROM agent_read.users', tables: ['users'] },
  );
  assert.deepEqual(
    validateReadOnlySql('WITH recent AS (SELECT * FROM agent_read.judge_records) SELECT count(*) FROM recent').tables,
    ['judge_records'],
  );
  assert.deepEqual(
    validateReadOnlySql('SELECT credential_count FROM agent_read.webauthn_summary').tables,
    ['webauthn_summary'],
  );
});

test('拒绝基础表、系统表和多语句', () => {
  rejectsWithCode('SELECT * FROM public.users', 'TABLE_NOT_ALLOWED');
  rejectsWithCode('SELECT * FROM pg_catalog.pg_roles', 'TABLE_NOT_ALLOWED');
  rejectsWithCode('SELECT * FROM agent_read.users; SELECT * FROM agent_read.problems', 'MULTIPLE_STATEMENTS');
});

test('拒绝写语句、写 CTE、锁和危险函数', () => {
  rejectsWithCode('DELETE FROM agent_read.users', 'NOT_READ_ONLY');
  rejectsWithCode(
    "WITH changed AS (DELETE FROM agent_read.users RETURNING id) SELECT * FROM changed",
    'NOT_READ_ONLY',
  );
  rejectsWithCode('SELECT * FROM agent_read.users FOR UPDATE', 'LOCK_NOT_ALLOWED');
  rejectsWithCode('SELECT pg_sleep(10) FROM agent_read.users', 'FORBIDDEN_FUNCTION');
  rejectsWithCode('SELECT * INTO copied_users FROM agent_read.users', 'SELECT_INTO_NOT_ALLOWED');
});

function rejectsWithCode(sql: string, code: string): void {
  assert.throws(
    () => validateReadOnlySql(sql),
    (error) => error instanceof SqlPolicyError && error.code === code,
  );
}
