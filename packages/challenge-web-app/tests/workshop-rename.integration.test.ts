import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
   cp,
   mkdtemp,
   readFile,
   readdir,
   rm,
   writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const require = createRequire(import.meta.url);
const prismaCli = require.resolve('prisma/build/index.js');
const schemaDirectory = resolve(import.meta.dirname, '../../database/prisma');
const renameMigration = '20261223000000_rename_lab_to_workshop';

test('workshop migration preserves projects, files, templates, tags and import history', {
   timeout: 120_000,
}, async () => {
   assert.ok(
      process.env.DATABASE_URL,
      'Set DATABASE_URL to a local PostgreSQL instance',
   );
   const url = new URL(process.env.DATABASE_URL);
   assert.ok(
      ['localhost', '127.0.0.1'].includes(url.hostname),
      'Only local PostgreSQL is allowed',
   );
   const databaseName = `quanta_workshop_rename_test_${randomUUID().replaceAll('-', '')}`;
   const adminUrl = new URL(url);
   adminUrl.pathname = '/postgres';
   const admin = new PrismaClient({ datasourceUrl: adminUrl.href });
   url.pathname = `/${databaseName}`;
   const database = new PrismaClient({ datasourceUrl: url.href });
   const baseline = await mkdtemp(join(tmpdir(), 'quanta-workshop-migration-'));
   let created = false;

   const prisma = (...args: string[]) =>
      execFileSync(process.execPath, [prismaCli, ...args], {
         env: { ...process.env, DATABASE_URL: url.href },
         stdio: 'pipe',
         encoding: 'utf8',
         timeout: 60_000,
      });

   try {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
      created = true;
      const schema = await readFile(
         join(schemaDirectory, 'schema.prisma'),
         'utf8',
      );
      const baselineSchema = join(baseline, 'schema.prisma');
      const beforeProjectSettings = schema.replace(/model WorkshopProject \{[\s\S]*?\n\}/, (model) =>
         model.replace(/^\s*startCommand\s+String\?.*\n/m, ''),
      );
      await writeFile(
         baselineSchema,
         beforeProjectSettings.replaceAll('Workshop', 'Lab').replaceAll('workshop', 'lab'),
      );
      const migrations = await readdir(join(schemaDirectory, 'migrations'));
      for (const migration of migrations.filter(
         (name) => name < renameMigration || name === 'migration_lock.toml',
      )) {
         await cp(
            join(schemaDirectory, 'migrations', migration),
            join(baseline, 'migrations', migration),
            { recursive: true },
         );
      }
      prisma('migrate', 'deploy', '--schema', baselineSchema);
      const baselineChanges = prisma(
         'migrate',
         'diff',
         '--from-schema-datasource',
         baselineSchema,
         '--to-schema-datamodel',
         baselineSchema,
      );

      const user = await database.user.create({
         data: { name: 'workshop-migration-fixture' },
      });
      await database.$executeRaw`
         INSERT INTO lab_projects (id, "ownerId", name, "templateId", source, "updatedAt")
         VALUES ('template-project', ${user.id}, 'Template project', 'blank', 'template', NOW()),
                ('github-project', ${user.id}, 'Imported project', NULL, 'github', NOW())
      `;
      await database.$executeRaw`
         INSERT INTO file_systems (fsid, "ownerId", "labProjectId", "updatedAt")
         VALUES ('project-files', ${user.id}, 'github-project', NOW())
      `;
      await database.virtualFiles.create({
         data: {
            ownerId: user.id,
            path: '/project/README.md',
            content: '# Existing project',
            fileSystemFsid: 'project-files',
         },
      });
      await database.$executeRaw`
         INSERT INTO lab_github_imports ("projectId", "repositoryId", "ownerLogin", "repositoryName", visibility, "branchName", "commitSha")
         VALUES ('github-project', 123, 'owner', 'repository', 'private', 'main', 'original-commit')
      `;
      await database.$executeRaw`
         INSERT INTO lab_templates (id, name, category, tags, files, "updatedAt")
         VALUES ('custom-existing', 'Existing template', 'basic', ARRAY['Existing tag'], '{"index.html":"<h1>Existing</h1>"}'::jsonb, NOW())
      `;
      await database.$executeRaw`
         INSERT INTO tags (name, "creatorId", scope, "updatedAt")
         VALUES ('Existing tag', ${user.id}, 'lab', NOW()), ('Problem tag', ${user.id}, 'problem', NOW())
      `;

      prisma(
         'migrate',
         'deploy',
         '--schema',
         join(schemaDirectory, 'schema.prisma'),
      );
      const project = await database.workshopProject.findUniqueOrThrow({
         where: { id: 'github-project' },
         include: {
            githubImport: true,
            fileSystem: { include: { files: true } },
         },
      });
      assert.equal(project.ownerId, user.id);
      assert.equal(project.source, 'github');
      assert.equal(project.githubImport?.repositoryId, 123n);
      assert.equal(project.githubImport?.commitSha, 'original-commit');
      assert.equal(project.fileSystem?.workshopProjectId, project.id);
      assert.equal(project.fileSystem?.files[0]?.content, '# Existing project');
      assert.equal(await database.workshopProject.count(), 2);
      const templateProject = await database.workshopProject.findUniqueOrThrow({
         where: { id: 'template-project' },
      });
      assert.equal(templateProject.templateId, 'blank');
      assert.equal(templateProject.source, 'template');
      const template = await database.workshopTemplate.findUniqueOrThrow({
         where: { id: 'custom-existing' },
      });
      assert.deepEqual(template.files, { 'index.html': '<h1>Existing</h1>' });
      assert.deepEqual(template.tags, ['Existing tag']);
      assert.equal(await database.workshopCategory.count(), 4);
      assert.equal(
         (
            await database.tags.findFirstOrThrow({
               where: { name: 'Existing tag' },
            })
         ).scope,
         'workshop',
      );
      assert.equal(
         (
            await database.tags.findFirstOrThrow({
               where: { name: 'Problem tag' },
            })
         ).scope,
         'problem',
      );
      for (const name of [
         'lab_projects',
         'lab_templates',
         'lab_categories',
         'lab_github_imports',
      ]) {
         const rows = await database.$queryRaw<
            { name: string | null }[]
         >`SELECT to_regclass(${name})::text AS name`;
         assert.equal(rows[0]?.name, null);
      }
      await assert.rejects(database.$executeRaw`
         INSERT INTO workshop_projects (id, "ownerId", name, source, "updatedAt")
         VALUES ('invalid-template-project', ${user.id}, 'Invalid', 'template', NOW())
      `);
      await database.workshopProject.delete({ where: { id: project.id } });
      assert.equal(await database.workshopGitHubImport.count(), 0);
      assert.equal(await database.fileSystems.count(), 0);
      const changes = prisma(
         'migrate',
         'diff',
         '--from-schema-datasource',
         join(schemaDirectory, 'schema.prisma'),
         '--to-schema-datamodel',
         join(schemaDirectory, 'schema.prisma'),
      );
      // Existing index differences must stay unchanged; this migration must introduce no drift.
      assert.equal(changes, baselineChanges);
      const legacyConstraints = await database.$queryRaw<{ conname: string }[]>`
         SELECT conname FROM pg_constraint
         WHERE connamespace = current_schema()::regnamespace AND conname LIKE '%lab%'
      `;
      assert.deepEqual(legacyConstraints, []);
   } finally {
      await database.$disconnect();
      if (created)
         await admin.$executeRawUnsafe(
            `DROP DATABASE "${databaseName}" WITH (FORCE)`,
         );
      await admin.$disconnect();
      await rm(baseline, { recursive: true, force: true });
   }
});
