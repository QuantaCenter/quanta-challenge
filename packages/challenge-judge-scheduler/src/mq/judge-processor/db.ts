import prisma from '../../utils/prisma';
import { JudgeJob } from './types';
import z from 'zod';
import { JudgeSuccessResultSchema } from '@challenge/judge-machine-agent/schemas';
import type { Prisma } from '@prisma/client';

export const getProblemInfoByRecordId = async (judgeRecordId: number) => {
   const result = await prisma.judgeRecords.findUniqueOrThrow({
      where: {
         id: judgeRecordId,
      },
      select: {
         problem: {
            select: { pid: true, totalScore: true },
         },
      },
   });

   return {
      problemId: result.problem.pid,
      score: result.problem.totalScore,
   };
};

export const getTemplateJudgeRecordCacheFiles = async (problemId: number) => {
   const result = await prisma.templateJudgeRecords.findFirstOrThrow({
      where: {
         problemId: problemId,
      },
      select: {
         judgeRecord: {
            select: {
               info: true,
            },
         },
      },
   });

   const info = result.judgeRecord.info as Record<string, any>[];
   const cacheFiles: Record<string, string> = info
      .map((item) => item.cacheFiles)
      .reduce((prev, curr) => {
         return { ...prev, ...curr };
      }, {});

   return cacheFiles;
};

export const saveFirstScreen = async (
   tx: Prisma.TransactionClient,
   options: {
      fileId: string;
      fileName: string;
      hash: string;
      problemId: number;
   }
) => {
   const { fileId, fileName, hash, problemId } = options;

   const { id: imageId } = await tx.image.create({
      data: {
         id: fileId,
         name: fileName,
         thumbhash: hash,
      },
      select: { id: true },
   });
   await tx.problemDefaultCovers.create({
      data: {
         imageId,
         problemId,
      },
   });
};

export const createShadowFiles = async (
   tx: Prisma.TransactionClient,
   options: {
      job: JudgeJob;
      storedBufferRecords: Record<string, string>;
   }
) => {
   const { job, storedBufferRecords } = options;

   const images = Object.entries(storedBufferRecords).map(([_, name]) => ({
      id: name.split('.').shift(),
      name,
   }));

   await tx.image.createMany({
      data: images,
   });

   await tx.shadowFile.createMany({
      data: images.map((image) => ({
         judgeRecordId: job.data.judgeRecordId,
         type: 'image',
         imageId: image.id,
      })),
   });
};

export const saveSuccessRecord = async (
   tx: Prisma.TransactionClient,
   options: {
      result: z.infer<typeof JudgeSuccessResultSchema>;
      pendingTime: number;
      startTime: number;
      job: JudgeJob;
      storedBufferRecords: Record<string, string>;
   }
) => {
   const { result, pendingTime, startTime, job, storedBufferRecords } = options;

   // 将结果中的文件 buffer 替换为存储的 URL
   const savedResult = result.results.map((item) => ({
      ...item,
      cacheFiles: Object.keys(item.cacheFiles).reduce(
         (acc, key) => ({
            ...acc,
            [key]: storedBufferRecords[key] || '',
         }),
         {} as Record<string, string>
      ),
   }));

   // 更新数据库记录
   await tx.judgeRecords.update({
      where: { id: job.data.judgeRecordId },
      data: {
         pendingTime,
         judgingTime: Date.now() - startTime,
         info: savedResult,
         result: result.status === 'completed' ? 'success' : 'failed',
         score: result.totalScore,
         problem: {
            update: {
               JudgeStatus: {
                  update: {
                     totalCount: { increment: 1 },
                     passedCount:
                        result.status === 'completed'
                           ? { increment: 1 }
                           : undefined,
                  },
               },
            },
         },
      },
   });
};

export const saveErrorRecord = async (options: {
   error: Error;
   pendingTime: number;
   startTime: number;
   job: JudgeJob;
}) => {
   await prisma.judgeRecords.update({
      where: { id: options.job.data.judgeRecordId },
      data: {
         pendingTime: options.pendingTime,
         judgingTime: Date.now() - options.startTime,
         result: 'failed',
         info: {
            errorMessage: options.error.message,
         },
         problem: {
            update: {
               JudgeStatus: {
                  update: {
                     totalCount: { increment: 1 },
                  },
               },
            },
         },
      },
   });
};
