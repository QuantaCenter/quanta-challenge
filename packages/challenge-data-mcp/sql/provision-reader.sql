\set ON_ERROR_STOP on

\if :{?reader_password}
\else
  \echo '缺少 reader_password。示例：psql "$DATABASE_URL" -v reader_password="..." -f provision-reader.sql'
  \quit
\endif

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'data_agent_reader') THEN
    CREATE ROLE data_agent_reader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

SELECT format('ALTER ROLE data_agent_reader PASSWORD %L', :'reader_password') \gexec
ALTER ROLE data_agent_reader SET default_transaction_read_only = on;
ALTER ROLE data_agent_reader SET statement_timeout = '5s';
ALTER ROLE data_agent_reader SET lock_timeout = '1s';
ALTER ROLE data_agent_reader SET search_path = agent_read, pg_catalog;

CREATE SCHEMA IF NOT EXISTS agent_read;
REVOKE ALL ON SCHEMA public FROM data_agent_reader;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM data_agent_reader;
GRANT CONNECT ON DATABASE :"DBNAME" TO data_agent_reader;
GRANT USAGE ON SCHEMA agent_read TO data_agent_reader;

CREATE OR REPLACE VIEW agent_read.users
WITH (security_barrier = true) AS
SELECT
  id,
  role::text AS role,
  name,
  "displayName" AS display_name,
  "createdAt" AS created_at,
  "lastLogin" AS last_login,
  "lastActiveAt" AS last_active_at,
  score
FROM public.users;

CREATE OR REPLACE VIEW agent_read.problems
WITH (security_barrier = true) AS
SELECT
  pid,
  "baseId" AS base_id,
  bp."authorId" AS author_id,
  title,
  difficulty::text AS difficulty,
  "totalScore" AS total_score,
  status::text AS status,
  "isDeprecated" AS is_deprecated,
  "problemType"::text AS problem_type,
  p."createdAt" AS created_at,
  p."updatedAt" AS updated_at
FROM public.problems p
JOIN public.base_problems bp ON bp.id = p."baseId";

CREATE OR REPLACE VIEW agent_read.judge_records
WITH (security_barrier = true) AS
SELECT
  id,
  "problemId" AS problem_id,
  "userId" AS user_id,
  result::text AS result,
  type::text AS type,
  score,
  "pendingTime" AS pending_time_ms,
  "judgingTime" AS judging_time_ms,
  "createdAt" AS created_at
FROM public.judge_records;

CREATE OR REPLACE VIEW agent_read.judge_status
WITH (security_barrier = true) AS
SELECT
  "problemId" AS problem_id,
  "passedCount" AS passed_count,
  "totalCount" AS total_count,
  "updatedAt" AS updated_at
FROM public.judge_status;

CREATE OR REPLACE VIEW agent_read.daily_checkins
WITH (security_barrier = true) AS
SELECT id, "userId" AS user_id, date, "createdAt" AS created_at
FROM public.daily_checkins;

CREATE OR REPLACE VIEW agent_read.user_statistics
WITH (security_barrier = true) AS
SELECT
  "userId" AS user_id,
  score,
  "correctRate" AS correct_rate,
  "passCount" AS pass_count,
  "createdAt" AS created_at,
  "updatedAt" AS updated_at
FROM public.user_statistics;

CREATE OR REPLACE VIEW agent_read.cloud_function_invocations
WITH (security_barrier = true) AS
SELECT
  id,
  "functionId" AS function_id,
  "versionId" AS version_id,
  "callerType" AS caller_type,
  status,
  "errorCode" AS error_code,
  "durationMs" AS duration_ms,
  "inputBytes" AS input_bytes,
  "outputBytes" AS output_bytes,
  "traceId" AS trace_id,
  "createdAt" AS created_at
FROM public.cloud_function_invocations;

CREATE OR REPLACE VIEW agent_read.webauthn_summary
WITH (security_barrier = true) AS
SELECT
  "userId" AS user_id,
  count(*)::integer AS credential_count,
  min("createdAt") AS first_registered_at,
  max("createdAt") AS last_registered_at,
  max("lastUsed") AS last_used_at,
  coalesce(
    array_agg(DISTINCT transport) FILTER (WHERE transport IS NOT NULL),
    ARRAY[]::text[]
  ) AS transports,
  max(counter) AS max_counter,
  count(*) FILTER (WHERE counter = 0)::integer AS zero_counter_count
FROM public.webauthn_credentials
GROUP BY "userId";

REVOKE ALL ON ALL TABLES IN SCHEMA agent_read FROM PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA agent_read TO data_agent_reader;
