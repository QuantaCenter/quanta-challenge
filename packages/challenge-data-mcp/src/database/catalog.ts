export const DATABASE_CATALOG = {
  schema: 'agent_read',
  notes: [
    '所有时间均为 PostgreSQL timestamptz；调用方应明确查询时间范围。',
    '所有视图均为只读安全投影，不包含密码、令牌、密钥、题目正文、判题脚本或用户文件。',
    '通用 SQL 必须使用完整名称 agent_read.<view>。',
    '数据库只读角色无法访问 public 基础表；不要尝试查询未列出的表、系统目录或认证原始数据。',
  ],
  conventions: {
    timeRange: '时间查询使用左闭右开区间：created_at >= $1 AND created_at < $2。',
    identifiers: 'user_id/id 为字符串；problem_id/pid 为整数。',
    duration: 'pending_time_ms、judging_time_ms、duration_ms 的单位为毫秒。',
    rates: 'correct_rate 为数据库已有聚合值；临时成功率建议使用成功数 / NULLIF(总数, 0)。',
    pagination: 'database_query 最多返回 200 行；聚合查询应显式 LIMIT 并设置稳定排序。',
  },
  enums: {
    userRole: ['SUPER_ADMIN', 'ADMIN', 'USER'],
    problemStatus: ['draft', 'invalid', 'ready', 'published'],
    problemType: ['frontend', 'backend_service'],
    judgeResult: ['pending', 'success', 'failed'],
    judgeType: ['audit', 'judge'],
  },
  relationships: [
    'users.id = judge_records.user_id',
    'users.id = daily_checkins.user_id',
    'users.id = user_statistics.user_id',
    'users.id = webauthn_summary.user_id',
    'problems.pid = judge_records.problem_id',
    'problems.pid = judge_status.problem_id',
  ],
  views: {
    users: {
      description: '用户基础信息与活跃度，不包含邮箱和认证信息',
      columns: ['id', 'role', 'name', 'display_name', 'created_at', 'last_login', 'last_active_at', 'score'],
    },
    problems: {
      description: '当前及历史题目版本的非敏感元数据',
      columns: ['pid', 'base_id', 'author_id', 'title', 'difficulty', 'total_score', 'status', 'is_deprecated', 'problem_type', 'created_at', 'updated_at'],
    },
    judge_records: {
      description: '提交/审核结果，不包含判题详情 JSON 与文件',
      columns: ['id', 'problem_id', 'user_id', 'result', 'type', 'score', 'pending_time_ms', 'judging_time_ms', 'created_at'],
    },
    judge_status: {
      description: '题目累计通过与判题次数',
      columns: ['problem_id', 'passed_count', 'total_count', 'updated_at'],
    },
    daily_checkins: {
      description: '每日挑战打卡',
      columns: ['id', 'user_id', 'date', 'created_at'],
    },
    user_statistics: {
      description: '用户聚合统计',
      columns: ['user_id', 'score', 'correct_rate', 'pass_count', 'created_at', 'updated_at'],
    },
    cloud_function_invocations: {
      description: '云函数调用元数据，不包含输入输出和调用凭据',
      columns: ['id', 'function_id', 'version_id', 'caller_type', 'status', 'error_code', 'duration_ms', 'input_bytes', 'output_bytes', 'trace_id', 'created_at'],
    },
    webauthn_summary: {
      description: '按用户聚合的 WebAuthn 绑定与使用状态，不包含凭据 ID、公钥及认证数据',
      columns: ['user_id', 'credential_count', 'first_registered_at', 'last_registered_at', 'last_used_at', 'transports', 'max_counter', 'zero_counter_count'],
    },
  },
  queryExamples: {
    dailySubmissions: `SELECT date_trunc('day', created_at) AS day, count(*) AS submissions
FROM agent_read.judge_records
WHERE type = 'judge' AND created_at >= $1 AND created_at < $2
GROUP BY 1 ORDER BY 1`,
    problemSuccessRate: `SELECT problem_id, count(*) AS total,
       count(*) FILTER (WHERE result = 'success') AS success,
       round(100.0 * count(*) FILTER (WHERE result = 'success') / NULLIF(count(*), 0), 2) AS success_rate_pct
FROM agent_read.judge_records
WHERE type = 'judge' AND created_at >= $1 AND created_at < $2
GROUP BY problem_id ORDER BY total DESC LIMIT 20`,
    inactiveUsers: `SELECT id, name, last_active_at
FROM agent_read.users
WHERE last_active_at IS NULL OR last_active_at < $1
ORDER BY last_active_at NULLS FIRST LIMIT 100`,
    webauthnStatus: `SELECT u.name, w.credential_count, w.last_used_at, w.transports, w.zero_counter_count
FROM agent_read.users u
LEFT JOIN agent_read.webauthn_summary w ON w.user_id = u.id
WHERE u.id = $1 OR lower(u.name) = lower($1)`,
  },
} as const;
