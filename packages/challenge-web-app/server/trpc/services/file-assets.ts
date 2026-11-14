import { createHash, randomUUID } from 'node:crypto';
import {
   decodeSnapshotContent,
   parseSnapshotBase64DataUrl,
} from '@challenge/shared/snapshot-content';
import { TRPCError } from '@trpc/server';
import type { Prisma } from '@prisma/client';
import prisma from '~~/lib/prisma';
import { LocalStore } from '~~/server/utils/local-store';
import { logger } from '~~/server/utils/logger';

const store = new LocalStore();
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 100 * 1024 * 1024;
let collectionCursor = '';
type Asset = {
   id: string;
   storageKey: string;
   sizeBytes: bigint;
   sha256: string;
};
type Candidate = {
   id: string;
   storageKey: string;
   bytes: Buffer;
   sha256: string;
   asset?: Asset;
};
type PreparedFile = {
   path: string;
   content: string;
   candidate?: Candidate;
};
type BoundFile = {
   path: string;
   name: string;
   content: string | null;
   assetId: string | null;
};

const cleanupCandidates = async (candidates: Candidate[]) => {
   await Promise.all(candidates.map(async (candidate) => {
      try {
         await store.deleteAsset(candidate.storageKey);
      } catch (error) {
         logger.error(
            { error, storageKey: candidate.storageKey },
            'Failed to remove asset candidate',
         );
      }
   }));
};

export const snapshotBytes = (path: string, content: string): Buffer => {
   const decoded = decodeSnapshotContent(path, content);
   return typeof decoded === 'string' ? Buffer.from(decoded, 'utf8') : Buffer.from(decoded);
};

const binaryContent = (path: string, content: string): Buffer | undefined => {
   if (/^data:[^,]*;base64,/i.test(content)) {
      const bytes = parseSnapshotBase64DataUrl(content);
      if (!bytes) {
         throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid base64 content' });
      }
      return Buffer.from(bytes);
   }
   const decoded = decodeSnapshotContent(path, content);
   return typeof decoded === 'string' ? undefined : Buffer.from(decoded);
};

const verify = async (asset: Asset, size: number) => {
   if (asset.sizeBytes !== BigInt(size)) throw new Error('Asset size mismatch');
   const bytes = await store.readAsset(asset.storageKey);
   if (bytes.length !== size || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
      throw new Error('Asset storage integrity check failed');
   }
   return bytes;
};

const lockStorageKey = async (tx: Prisma.TransactionClient, storageKey: string) => {
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${storageKey}, 0))`;
};

/**
 * 删除已不被任何虚拟文件引用的资产记录（尽力而为）。
 * 对应的存储文件随后由 collectOrphanAssetFiles 定时回收。并发写入正在引用同一资产时，
 * 外键约束会让删除失败，此时直接跳过，资产保留。
 */
export const releaseUnreferencedAssets = async (assetIds: Iterable<string>) => {
   const ids = [...new Set(assetIds)];
   if (!ids.length) return;
   for (const id of ids) {
      try {
         await prisma.$executeRaw`
            DELETE FROM file_assets fa
            WHERE fa.id = ${id}
              AND NOT EXISTS (SELECT 1 FROM virtual_files vf WHERE vf."assetId" = fa.id)
         `;
      } catch (error) {
         logger.debug({ error, assetId: id }, 'Skip releasing referenced asset');
      }
   }
};

export const collectOrphanAssetFiles = async (before: Date, limit = 100) => {
   const keys = await store.listOldAssets(before, limit, collectionCursor);
   collectionCursor = keys.length === limit ? keys[keys.length - 1]! : '';
   for (const key of keys) {
      try {
         await prisma.$transaction(async (tx) => {
            await lockStorageKey(tx, key);
            const asset = await tx.fileAsset.findUnique({ where: { storageKey: key } });
            if (!asset) await store.deleteAsset(key);
         });
      } catch (error) {
         logger.error({ error, storageKey: key }, 'Failed to collect orphan asset file');
      }
   }
};

export const prepareAssets = async (
   files: { path: string; content: string }[],
   userId: string,
   options?: { deferExistingVerification?: boolean },
) => {
   const candidates = new Map<string, Candidate>();
   const prepared: PreparedFile[] = [];
   let total = 0;
   try {
      for (const file of files) {
         if (!file.path || file.path.includes('\0') || file.path.split('/').includes('..')) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid file path' });
         }
         const bytes = binaryContent(file.path, file.content);
         const size = bytes?.length ?? Buffer.byteLength(file.content);
         total += size;
         if (size > MAX_FILE_BYTES) {
            throw new TRPCError({
               code: 'PAYLOAD_TOO_LARGE',
               message: `单个文件不能超过 ${MAX_FILE_BYTES / 1024 / 1024}MB：${file.path}`,
            });
         }
         if (total > MAX_SNAPSHOT_BYTES) {
            throw new TRPCError({
               code: 'PAYLOAD_TOO_LARGE',
               message: `单次写入的内容不能超过 ${MAX_SNAPSHOT_BYTES / 1024 / 1024}MB`,
            });
         }
         if (!bytes) {
            if (file.content.includes('\0')) {
               throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid text content' });
            }
            prepared.push(file);
            continue;
         }
         const sha256 = createHash('sha256').update(bytes).digest('hex');
         let candidate = candidates.get(sha256);
         if (!candidate) {
            const existing = await prisma.fileAsset.findUnique({
               where: { uploadedById_sha256: { uploadedById: userId, sha256 } },
            });
            candidate = {
               id: randomUUID(),
               storageKey: `assets/${randomUUID()}.bin`,
               bytes,
               sha256,
               asset: existing ?? undefined,
            };
            candidates.set(sha256, candidate);
            if (existing && !options?.deferExistingVerification) {
               await verify(existing, bytes.length);
            } else if (!existing) {
               await store.saveAsset(candidate.storageKey, bytes);
            }
         }
         prepared.push({ ...file, candidate });
      }
   } catch (error) {
      await cleanupCandidates([...candidates.values()].filter((candidate) => !candidate.asset));
      throw error;
   }
   return {
      async bind(tx: Prisma.TransactionClient, options?: { reusableAssets: Asset[] }) {
         const projectAssets = new Map<string, Asset>();
         for (const asset of options?.reusableAssets ?? []) {
            if (!projectAssets.has(asset.sha256)) projectAssets.set(asset.sha256, asset);
         }
         const sorted = [...candidates.values()].sort((a, b) =>
            a.sha256.localeCompare(b.sha256),
         );
         for (const candidate of sorted) {
            const projectAsset = projectAssets.get(candidate.sha256);
            if (projectAsset) {
               await verify(projectAsset, candidate.bytes.length);
               candidate.asset = projectAsset;
               continue;
            }
            if (candidate.asset) {
               await verify(candidate.asset, candidate.bytes.length);
               continue;
            }
            await lockStorageKey(tx, candidate.storageKey);
            await verify({
               id: candidate.id,
               storageKey: candidate.storageKey,
               sizeBytes: BigInt(candidate.bytes.length),
               sha256: candidate.sha256,
            }, candidate.bytes.length);
            const inserted = await tx.$queryRaw<Asset[]>`
               INSERT INTO file_assets (id, "storageKey", "sizeBytes", sha256, "mimeType", "uploadedById", "createdAt")
               VALUES (${candidate.id}, ${candidate.storageKey}, ${BigInt(candidate.bytes.length)}, ${candidate.sha256}, 'application/octet-stream', ${userId}, NOW())
               ON CONFLICT ("uploadedById", sha256) DO NOTHING RETURNING id, "storageKey", "sizeBytes", sha256
            `;
            candidate.asset = inserted[0] ?? await tx.fileAsset.findUniqueOrThrow({
               where: { uploadedById_sha256: { uploadedById: userId, sha256: candidate.sha256 } },
            });
            if (!inserted[0]) await verify(candidate.asset, candidate.bytes.length);
         }
         return prepared.map((file) => ({
            path: file.path,
            name: file.path.split('/').pop() || 'unknown',
            content: file.candidate ? null : file.content,
            assetId: file.candidate?.asset!.id ?? null,
         }));
      },
      async cleanup(committed: boolean) {
         const unused = [...candidates.values()].filter(
            (candidate) => !committed || candidate.asset?.storageKey !== candidate.storageKey,
         );
         await cleanupCandidates(unused);
      },
   };
};

export const withAssetTransaction = async <T>(
   snapshot: Record<string, string>,
   userId: string,
   action: (tx: Prisma.TransactionClient, files: BoundFile[]) => Promise<T>,
): Promise<T> => {
   const files = Object.entries(snapshot).map(([path, content]) => ({ path, content }));
   const assets = await prepareAssets(files, userId);
   let committed = false;
   try {
      const result = await prisma.$transaction(async (tx) =>
         action(tx, await assets.bind(tx)),
      );
      committed = true;
      return result;
   } finally {
      await assets.cleanup(committed);
   }
};

export const expandFile = async <T extends { content: string | null; assetId: string | null }>(
   file: T,
): Promise<Omit<T, 'content'> & { content: string }> => {
   if (file.content !== null) return { ...file, content: file.content };
   if (!file.assetId) throw new Error('Invalid virtual file');
   const asset = await prisma.fileAsset.findUniqueOrThrow({ where: { id: file.assetId } });
   const bytes = await verify(asset, Number(asset.sizeBytes));
   return {
      ...file,
      content: `data:application/octet-stream;base64,${bytes.toString('base64')}`,
   };
};

export const readProjectAsset = async (
   userId: string,
   projectId: string,
   assetId: string,
) => {
   const file = await prisma.virtualFiles.findFirst({
      where: {
         assetId,
         FileSystem: { projectId, project: { ownerId: userId } },
      },
      select: { content: true, assetId: true },
   });
   if (!file) throw new TRPCError({ code: 'NOT_FOUND', message: 'Asset not found' });
   return (await expandFile(file)).content;
};

/** 读取工坊项目中某个文件资产的原始字节（校验资产确实属于该用户的该项目） */
export const readWorkshopProjectAssetBytes = async (
   userId: string,
   workshopProjectId: string,
   assetId: string,
) => {
   const file = await prisma.virtualFiles.findFirst({
      where: {
         assetId,
         FileSystem: { workshopProjectId, workshopProject: { ownerId: userId } },
      },
      select: { asset: true },
   });
   if (!file?.asset) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Asset not found' });
   }
   return verify(file.asset, Number(file.asset.sizeBytes));
};
