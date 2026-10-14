import { createNpmFileSystem } from '@volar/jsdelivr';
import type { FileSystem } from '@volar/monaco/worker';
import type { URI } from 'vscode-uri';

/**
 * 按题目项目的 package.json 与锁文件提供 /node_modules 下的类型文件（内容仍来自 jsDelivr）。
 *
 * · 可见范围模拟真实安装：package.json 声明的依赖，加上这些包自己声明的依赖（读到其 package.json 时登记）。
 *   未声明的包一律视为不存在，不再“import 什么就有什么”。
 * · 版本优先取锁文件（pnpm-lock.yaml / package-lock.json / yarn.lock），否则把 semver 范围
 *   交给 jsDelivr 解析成范围内的最新版本；无法解析（workspace: / file: / git 等）的包视为不存在。
 * · 虚拟文件系统按包名平铺，同名包只能有一个版本：取锁文件里提升到顶层或被项目直接依赖的版本，
 *   否则取锁文件中的最高版本。
 */

export interface ProjectFile {
   uri: { path: string };
   version: number;
   getValue(): string;
}

const NODE_MODULES = '/node_modules';
const MANIFEST_NAMES = new Set([
   'package.json',
   'pnpm-lock.yaml',
   'package-lock.json',
   'yarn.lock',
]);
const DEPENDENCY_FIELDS = [
   'dependencies',
   'devDependencies',
   'optionalDependencies',
   'peerDependencies',
] as const;
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;
const UNRESOLVABLE_SPEC = /^(?:workspace|file|link|portal|git|git\+\w+|github|gitlab|bitbucket|https?|npm):/;

interface LockedVersions {
   /** yarn.lock 的 `名称@范围` → 版本 */
   bySpec: Map<string, string>;
   /** 提升到顶层 / 被项目直接依赖的版本 */
   preferred: Map<string, string>;
   all: Map<string, Set<string>>;
}

const createLockedVersions = (): LockedVersions => ({
   bySpec: new Map(),
   preferred: new Map(),
   all: new Map(),
});

const addLocked = (locked: LockedVersions, name: string, version: string) => {
   if (!name || !EXACT_VERSION.test(version)) return;
   let versions = locked.all.get(name);
   if (!versions) locked.all.set(name, (versions = new Set()));
   versions.add(version);
};

const addPreferred = (locked: LockedVersions, name: string, version: string) => {
   if (!EXACT_VERSION.test(version) || locked.preferred.has(name)) return;
   locked.preferred.set(name, version);
   addLocked(locked, name, version);
};

const compareVersions = (a: string, b: string) => {
   const [coreA = '', preA] = a.split('-', 2);
   const [coreB = '', preB] = b.split('-', 2);
   const partsA = coreA.split('.').map(Number);
   const partsB = coreB.split('.').map(Number);
   for (let i = 0; i < 3; i++) {
      const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
      if (diff) return diff;
   }
   if (preA === preB) return 0;
   if (!preA) return 1;
   if (!preB) return -1;
   return preA < preB ? -1 : 1;
};

/** `@scope/name@1.2.3` / `name@1.2.3` → [name, rest]；没有版本部分时 rest 为 undefined */
const splitNameAndVersion = (input: string): [string, string | undefined] => {
   const at = input.indexOf('@', input.startsWith('@') ? 1 : 0);
   return at < 0 ? [input, undefined] : [input.slice(0, at), input.slice(at + 1)];
};

const stripPeerSuffix = (version: string) => version.replace(/[(_].*$/, '');

const unquote = (value: string) => value.trim().replace(/^['"]|['"]$/g, '');

const parseNpmLock = (text: string, locked: LockedVersions) => {
   const lock = JSON.parse(text) as {
      packages?: Record<string, { name?: string; version?: string; link?: boolean }>;
      dependencies?: Record<string, NpmLockV1Entry>;
   };
   if (lock.packages) {
      for (const [key, entry] of Object.entries(lock.packages)) {
         const index = key.lastIndexOf('node_modules/');
         if (index < 0 || !entry.version || entry.link) continue;
         const name = key.slice(index + 'node_modules/'.length);
         addLocked(locked, name, entry.version);
         if (index === 0) addPreferred(locked, name, entry.version);
      }
      return;
   }
   const walk = (deps: Record<string, NpmLockV1Entry>, hoisted: boolean) => {
      for (const [name, entry] of Object.entries(deps)) {
         if (!entry.version) continue;
         addLocked(locked, name, entry.version);
         if (hoisted) addPreferred(locked, name, entry.version);
         if (entry.dependencies) walk(entry.dependencies, false);
      }
   };
   if (lock.dependencies) walk(lock.dependencies, true);
};
interface NpmLockV1Entry {
   version?: string;
   dependencies?: Record<string, NpmLockV1Entry>;
}

/**
 * 只取 pnpm-lock.yaml 里需要的两部分，按缩进逐行解析（不引入 YAML 解析器）：
 * · packages / snapshots 的键：v5 `/name/1.0.0_peer`，v6 `/name@1.0.0(peer)`，v9 `name@1.0.0(peer)`；
 * · 项目直接依赖的版本：单项目时位于顶层 dependencies，多项目时位于 importers.<路径>.dependencies，
 *   值为行内 `name: 1.0.0`（v5）或子键 `version: 1.0.0(peer)`（v6 / v9）。
 */
const parsePnpmLock = (text: string, locked: LockedVersions) => {
   const lines = text.split(/\r?\n/);
   const lockfileVersion = parseFloat(
      unquote(lines.find((l) => l.startsWith('lockfileVersion:'))?.split(':')[1] ?? '9')
   );
   const isV5 = lockfileVersion < 6;

   let section = '';
   let depsIndent = -1;
   let currentDep: string | undefined;
   for (const line of lines) {
      if (!line.trim() || line.trimStart().startsWith('#')) continue;
      const indent = line.length - line.trimStart().length;
      const match = /^\s*('[^']*'|"[^"]*"|[^:\s][^:]*?):(?:\s+(.*))?$/.exec(line);
      if (!match) continue;
      const key = unquote(match[1]!);
      const value = match[2]?.trim();

      if (indent === 0) {
         section = key;
         depsIndent = -1;
         currentDep = undefined;
      }

      if (section === 'packages' || section === 'snapshots') {
         if (indent !== 2) continue;
         const id = key.replace(/^\//, '');
         if (isV5) {
            const slash = id.lastIndexOf('/');
            if (slash > 0) addLocked(locked, id.slice(0, slash), stripPeerSuffix(id.slice(slash + 1)));
         } else {
            const [name, version] = splitNameAndVersion(id);
            if (version) addLocked(locked, name, stripPeerSuffix(version));
         }
         continue;
      }

      const isDepsKey = /^(dependencies|devDependencies|optionalDependencies)$/.test(key);
      if (isDepsKey && (indent === 0 || (section === 'importers' && indent === 4))) {
         depsIndent = indent;
         currentDep = undefined;
         continue;
      }
      if (depsIndent < 0) continue;
      if (indent <= depsIndent) {
         depsIndent = -1;
         continue;
      }
      if (indent === depsIndent + 2) {
         currentDep = key;
         if (value) addPreferred(locked, key, stripPeerSuffix(unquote(value)));
      } else if (indent === depsIndent + 4 && key === 'version' && currentDep && value) {
         addPreferred(locked, currentDep, stripPeerSuffix(unquote(value)));
      }
   }
};

/**
 * yarn.lock：v1 块头 `"a@^1.0.0", a@^1.1.0:` + `  version "1.1.2"`；
 * berry 块头 `"a@npm:^1.0.0, a@npm:^1.1.0":` + `  version: 1.1.2`。
 */
const parseYarnLock = (text: string, locked: LockedVersions) => {
   let specs: string[] = [];
   for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || line.startsWith('#')) continue;
      if (!/^\s/.test(line)) {
         specs = line
            .replace(/:\s*$/, '')
            .split(',')
            .map(unquote)
            .filter((spec) => spec && spec !== '__metadata');
         continue;
      }
      const version = /^\s+version:?\s+"?([^"\s]+)"?/.exec(line)?.[1];
      if (!version) continue;
      for (const spec of specs) {
         const [name, range] = splitNameAndVersion(spec);
         if (range === undefined) continue;
         addLocked(locked, name, version);
         locked.bySpec.set(`${name}@${range.replace(/^npm:/, '')}`, version);
      }
      specs = [];
   }
};

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const depth = (path: string) => path.split('/').length;

const readProjectManifests = (files: ProjectFile[]) => {
   const ranges = new Map<string, string>();
   const locked = createLockedVersions();
   const manifests = files
      .filter(
         (file) =>
            MANIFEST_NAMES.has(baseName(file.uri.path)) &&
            !file.uri.path.includes(`${NODE_MODULES}/`)
      )
      .sort((a, b) => depth(a.uri.path) - depth(b.uri.path));

   for (const file of manifests) {
      try {
         const text = file.getValue();
         switch (baseName(file.uri.path)) {
            case 'package.json':
               registerDependencies(ranges, JSON.parse(text));
               break;
            case 'package-lock.json':
               parseNpmLock(text, locked);
               break;
            case 'pnpm-lock.yaml':
               parsePnpmLock(text, locked);
               break;
            case 'yarn.lock':
               parseYarnLock(text, locked);
               break;
         }
      } catch (error) {
         console.warn('[project-npm-fs] 无法解析', file.uri.path, error);
      }
   }
   return { ranges, locked };
};

const registerDependencies = (ranges: Map<string, string>, manifest: unknown) => {
   if (!manifest || typeof manifest !== 'object') return;
   for (const field of DEPENDENCY_FIELDS) {
      const deps = (manifest as Record<string, unknown>)[field];
      if (!deps || typeof deps !== 'object') continue;
      for (const [name, range] of Object.entries(deps)) {
         if (typeof range === 'string' && !ranges.has(name)) ranges.set(name, range);
      }
   }
};

const resolveRange = async (name: string, range: string) => {
   try {
      const res = await fetch(
         `https://data.jsdelivr.com/v1/package/resolve/npm/${name}@${encodeURIComponent(range || 'latest')}`
      );
      if (!res.ok) return;
      const { version } = (await res.json()) as { version?: string };
      return version && EXACT_VERSION.test(version) ? version : undefined;
   } catch {
      return;
   }
};

const createProjectPackages = (files: ProjectFile[]) => {
   const { ranges, locked } = readProjectManifests(files);
   const directTypes = [...ranges.keys()].filter((name) => name.startsWith('@types/'));
   const versions = new Map<string, string>();
   const pending = new Map<string, Promise<string | undefined>>();

   const pickLocked = (name: string, range: string) => {
      const candidates = locked.all.get(name);
      return (
         locked.bySpec.get(`${name}@${range}`) ??
         locked.preferred.get(name) ??
         (candidates && [...candidates].sort(compareVersions).pop())
      );
   };

   const resolveVersion = (name: string) => {
      const range = ranges.get(name);
      if (range === undefined) return Promise.resolve(undefined);
      let promise = pending.get(name);
      if (!promise) {
         promise = (async () => {
            if (UNRESOLVABLE_SPEC.test(range)) return;
            const version = pickLocked(name, range) ?? (await resolveRange(name, range));
            if (version) versions.set(name, version);
            return version;
         })();
         pending.set(name, promise);
      }
      return promise;
   };

   const npmFs = createNpmFileSystem(undefined, (name) => versions.get(name));

   return {
      npmFs,
      directTypes,
      isDeclared: (name: string) => ranges.has(name),
      resolveVersion,
      registerPackageJson: (text: string) => {
         try {
            registerDependencies(ranges, JSON.parse(text));
         } catch {
            // 非法 package.json 不影响其他包
         }
      },
   };
};

/** `/node_modules/@a/b/c.d.ts` → { name: '@a/b', rest: 'c.d.ts' }；不在包内时 name 为 undefined */
const parseModulePath = (path: string) => {
   const parts = path.slice(NODE_MODULES.length + 1).split('/');
   const isScope = parts[0]?.startsWith('@');
   if (!parts[0] || (isScope && !parts[1])) return { scope: parts[0] };
   const name = isScope ? `${parts[0]}/${parts[1]}` : parts[0];
   const rest = parts.slice(isScope ? 2 : 1).join('/');
   return { name, rest };
};

export const createProjectNpmFileSystem = (
   getProjectFiles: () => ProjectFile[]
): FileSystem => {
   let manifestKey: string | undefined;
   let packages: ReturnType<typeof createProjectPackages>;

   const getPackages = () => {
      const files = getProjectFiles();
      const key = files
         .filter((file) => MANIFEST_NAMES.has(baseName(file.uri.path)))
         .map((file) => `${file.uri.path}@${file.version}`)
         .sort()
         .join('|');
      if (key !== manifestKey) {
         manifestKey = key;
         packages = createProjectPackages(files);
      }
      return packages;
   };

   /** 返回可以交给 jsDelivr 文件系统的包；未声明或无法确定版本时返回 undefined */
   const resolvePackage = async (uri: URI) => {
      if (!uri.path.startsWith(`${NODE_MODULES}/`)) return;
      const { name, rest } = parseModulePath(uri.path);
      const current = getPackages();
      if (!name || !current.isDeclared(name)) return;
      if (!(await current.resolveVersion(name))) return;
      return { packages: current, rest };
   };

   return {
      async stat(uri) {
         if (uri.path === NODE_MODULES) return getPackages().npmFs.stat(uri);
         const { name, scope } = parseModulePath(uri.path);
         if (!name && scope) return getPackages().npmFs.stat(uri);
         const resolved = await resolvePackage(uri);
         return resolved?.packages.npmFs.stat(uri);
      },
      async readFile(uri) {
         const resolved = await resolvePackage(uri);
         if (!resolved) return;
         const text = await resolved.packages.npmFs.readFile(uri);
         if (text !== undefined && resolved.rest === 'package.json') {
            resolved.packages.registerPackageJson(text);
         }
         return text;
      },
      async readDirectory(uri) {
         if (uri.path === `${NODE_MODULES}/@types`) {
            return getPackages().directTypes.map(
               (name) => [name.slice('@types/'.length), 2] as [string, 2]
            );
         }
         const resolved = await resolvePackage(uri);
         return resolved ? resolved.packages.npmFs.readDirectory(uri) : [];
      },
   };
};
