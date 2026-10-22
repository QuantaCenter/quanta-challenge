export interface BackendServiceImage {
   /** 存进数据库的稳定 id，也是下拉选项的 value（不要改，改了要写数据迁移） */
   id: string;
   /** 展示名，带版本号 */
   label: string;
   /** 真正拉起容器的 docker 镜像名 */
   image: string;
   /** 编辑器（WebContainer）里的一次性准备步骤，`mountPath` = 题目的 judgeUploadPath */
   editorBootCommand: (mountPath: string) => string;
   /** 服务启动命令，编辑器与判题容器共用 */
   initCommand: (mountPath: string) => string;
   defaultPort: number;
}

const PNPM_VERSION = '9.15.9';

export const BACKEND_SERVICE_IMAGES = {
   'node-24': {
      id: 'node-24',
      label: 'Node.js 24',
      image: 'challenge-backend-service-agent',
      editorBootCommand: (mountPath: string) =>
         [
            `[install-pnpm] npm install --global pnpm@${PNPM_VERSION}`,
            `[install] pnpm --dir ./${mountPath} install`,
         ].join('\n'),
      // 入口由题目的 package.json 决定；npm 在没有 scripts.start 时回退到 node server.js。
      initCommand: (mountPath: string) =>
         `[dev-server] cd ./${mountPath} && npm start`,
      defaultPort: 3000,
   },
} as const satisfies Record<string, BackendServiceImage>;

export type BackendServiceImageId = keyof typeof BACKEND_SERVICE_IMAGES;

export const BACKEND_SERVICE_IMAGE_IDS = Object.keys(
   BACKEND_SERVICE_IMAGES
) as BackendServiceImageId[];

export const DEFAULT_BACKEND_SERVICE_IMAGE_ID: BackendServiceImageId =
   'node-24';

const isBackendServiceImageId = (
   value: unknown
): value is BackendServiceImageId =>
   typeof value === 'string' &&
   Object.prototype.hasOwnProperty.call(BACKEND_SERVICE_IMAGES, value);

/** 只认注册表 id：空值 / 未知值一律收敛成默认镜像。 */
export const normalizeBackendServiceImageId = (
   id?: string | null
): BackendServiceImageId =>
   isBackendServiceImageId(id) ? id : DEFAULT_BACKEND_SERVICE_IMAGE_ID;

const getBackendServiceImage = (
   id?: string | null
): BackendServiceImage =>
   BACKEND_SERVICE_IMAGES[normalizeBackendServiceImageId(id)];

/** 库里的 id → 真正拉起的 docker 镜像名。 */
export const resolveBackendServiceImageName = (id?: string | null): string =>
   getBackendServiceImage(id).image;

export const buildBackendBootCommand = (
   id: string | null | undefined,
   mountPath: string
): string => getBackendServiceImage(id).editorBootCommand(mountPath);

export const buildBackendInitCommand = (
   id: string | null | undefined,
   mountPath: string
): string => getBackendServiceImage(id).initCommand(mountPath);

export const getBackendServiceDefaultPort = (id?: string | null): number =>
   getBackendServiceImage(id).defaultPort;

/** 所有后端题容器镜像（调度器清扫器用来回收泄漏容器）。 */
export const BACKEND_SERVICE_CONTAINER_IMAGES = Object.values(
   BACKEND_SERVICE_IMAGES
).map((item) => item.image);

/**
 * 自定义镜像（WebContainer 基础镜像）引用：存进 Problems.serviceImage 的值为
 * `custom:<ImageBuild.id>`。自定义镜像只影响在线编辑器（WebContainer）环境，
 * 判题容器仍使用 BACKEND_SERVICE_IMAGES 里的默认 docker 镜像。
 */
export const CUSTOM_IMAGE_PREFIX = 'custom:';

export const isCustomImageId = (
   id?: string | null
): id is `${typeof CUSTOM_IMAGE_PREFIX}${string}` =>
   typeof id === 'string' &&
   id.startsWith(CUSTOM_IMAGE_PREFIX) &&
   id.length > CUSTOM_IMAGE_PREFIX.length;

export const parseCustomImageId = (id: string): string =>
   id.slice(CUSTOM_IMAGE_PREFIX.length);
