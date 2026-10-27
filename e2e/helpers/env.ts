import fs from 'node:fs';
import path from 'node:path';

function readIdFile(): Record<string, number> {
   const file = path.resolve(import.meta.dirname, '../.e2e-ids.json');
   try {
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, number>;
   } catch {
      return {};
   }
}

const ids = readIdFile();

export const E2E_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'e2e-admin@quanta.test';
export const E2E_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-password';

export const E2E_PROBLEM_PID = Number(process.env.E2E_PROBLEM_PID ?? ids.problemPid ?? 1);
export const E2E_ACHIEVEMENT_ID = Number(
   process.env.E2E_ACHIEVEMENT_ID ?? ids.achievementId ?? 1,
);
