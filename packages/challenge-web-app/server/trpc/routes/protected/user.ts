import prisma from '~~/lib/prisma';
import { protectedProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import { useStore } from '../../store';
import z from 'zod';
import path from 'path';
import { TRPCError } from '@trpc/server';
import { logger } from '~~/server/utils/logger';
import { renderThumbhashDataUrls } from '~~/server/utils/thumbhash';
import { problemStatService } from '../../services/problem-stat';
import { imageFormDataSchema } from '../../schemas/image-upload';

// 获取用户信息
const getUserInfoProcedure = protectedProcedure.query(async ({ ctx }) => {
   const { userId } = ctx.user;

   const result = await prisma.userInfo.findUnique({
      where: {
         userId,
      },
      include: {
         bannerImage: {
            select: {
               name: true,
            },
         },
         user: {
            select: {
               displayName: true,
               imageId: true,
               avatar: {
                  select: {
                     name: true,
                  },
               },
            },
         },
      },
   });

   return {
      ...result,
      displayName: result?.user?.displayName || null,
      bannerImageUrl: result?.bannerImage?.name
         ? `/api/static/${result?.bannerImage?.name}`
         : null,
      avatarUrl: result?.user?.avatar?.name
         ? `/api/static/${result?.user?.avatar?.name}`
         : null,
      avatarImageId: result?.user?.imageId || null,
   };
});

// 更新用户信息
const UpdateUserInfoSchema = z.object({
   displayName: z.string().max(30).optional(),
   bio: z.string().max(500).optional(),
   email: z.email().optional().or(z.literal('')),
   major: z.string().max(100).optional(),
   identifier: z.string().max(100).optional(),
   birthday: z.string().optional(),
   bannerImageId: z.string().optional(),
   avatarImageId: z.string().optional(),
});

const updateUserInfoProcedure = protectedProcedure
   .input(UpdateUserInfoSchema)
   .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // 处理生日字段
      const birthdayData = input.birthday
         ? { birthday: new Date(input.birthday) }
         : {};

      // 如果提供了昵称或头像，更新 User 表
      const userUpdate: {
         displayName?: string | null;
         imageId?: string | null;
      } = {};
      if (input.displayName !== undefined) {
         userUpdate.displayName = input.displayName.trim() || null;
      }
      if (input.avatarImageId !== undefined) {
         userUpdate.imageId = input.avatarImageId || null;
      }
      if (Object.keys(userUpdate).length > 0) {
         await prisma.user.update({
            where: { id: userId },
            data: userUpdate,
         });
      }

      // 检查用户信息是否存在
      const existingUserInfo = await prisma.userInfo.findUnique({
         where: { userId },
      });

      if (existingUserInfo) {
         // 更新现有记录
         const result = await prisma.userInfo.update({
            where: { userId },
            data: {
               bio: input.bio,
               email: input.email || null,
               major: input.major,
               identifier: input.identifier,
               bannerImageId: input.bannerImageId || null,
               ...birthdayData,
            },
         });
         return result;
      } else {
         // 创建新记录
         const result = await prisma.userInfo.create({
            data: {
               userId,
               bio: input.bio,
               email: input.email || null,
               major: input.major,
               identifier: input.identifier,
               bannerImageId: input.bannerImageId || null,
               ...birthdayData,
            },
         });
         return result;
      }
   });

// 上传图片
const uploadImageProcedure = protectedProcedure
   .input(imageFormDataSchema)
   .mutation(async ({ ctx, input }) => {
      const { buffer: fileBuffer, fileName } = input;
      const { userId } = ctx.user;

      // 验证文件类型
      const ext = path.extname(fileName).toLowerCase();
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      if (!allowedExtensions.includes(ext)) {
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: '不支持的文件类型，仅支持 JPG、PNG、GIF 和 WEBP 格式',
         });
      }

      const store = useStore();
      const fileId = await store.save(fileBuffer, fileName);

      return await prisma.image.create({
         data: {
            id: fileId,
            name: `${fileId}${ext}`,
            UserImage: {
               create: {
                  userId,
               },
            },
         },
         select: {
            id: true,
            name: true,
         },
      });
   });

// 获取指定用户的公开信息（用于个人空间展示）
const getUserByNameProcedure = protectedProcedure
   .input(z.object({ name: z.string() }))
   .query(async ({ input }) => {
      const { name } = input;

      const user = await prisma.user.findUnique({
         where: { name },
         select: {
            id: true,
            name: true,
            displayName: true,
            imageId: true,
            createdAt: true,
            avatar: {
               select: {
                  name: true,
               },
            },
            UserInfo: {
               include: {
                  bannerImage: {
                     select: {
                        name: true,
                     },
                  },
               },
            },
         },
      });

      if (!user) {
         throw new TRPCError({
            code: 'NOT_FOUND',
            message: '用户不存在',
         });
      }

      return {
         ...user,
         avatarUrl: user.avatar?.name
            ? `/api/static/${user.avatar.name}`
            : null,
         bannerImageUrl: user.UserInfo?.bannerImage?.name
            ? `/api/static/${user.UserInfo.bannerImage.name}`
            : null,
      };
   });

// 获取用户空间配置
const getUserSpaceConfigProcedure = protectedProcedure
   .input(z.object({ name: z.string() }))
   .query(async ({ input }) => {
      const { name } = input;

      const user = await prisma.user.findUnique({
         where: { name },
         select: { id: true },
      });

      if (!user) {
         throw new TRPCError({
            code: 'NOT_FOUND',
            message: '用户不存在',
         });
      }

      let config = await prisma.userSpaceConfig.findUnique({
         where: { userId: user.id },
      });

      // 如果配置不存在，创建默认配置
      if (!config) {
         config = await prisma.userSpaceConfig.create({
            data: {
               userId: user.id,
               showSubmissionStatus: true,
               showAchievements: true,
               personalInfoVisibility: {
                  birthday: true,
                  email: true,
                  identifier: true,
                  major: true,
               },
            },
         });
      }

      return config;
   });

// 更新用户空间配置
const UpdateUserSpaceConfigSchema = z.object({
   showSubmissionStatus: z.boolean().optional(),
   showAchievements: z.boolean().optional(),
   personalInfoVisibility: z
      .object({
         birthday: z.boolean().optional(),
         email: z.boolean().optional(),
         identifier: z.boolean().optional(),
         major: z.boolean().optional(),
      })
      .optional(),
});

const updateUserSpaceConfigProcedure = protectedProcedure
   .input(UpdateUserSpaceConfigSchema)
   .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // 查找或创建配置
      const existingConfig = await prisma.userSpaceConfig.findUnique({
         where: { userId },
      });

      if (existingConfig) {
         // 更新现有配置
         return await prisma.userSpaceConfig.update({
            where: { userId },
            data: {
               showSubmissionStatus: input.showSubmissionStatus,
               showAchievements: input.showAchievements,
               personalInfoVisibility: input.personalInfoVisibility
                  ? input.personalInfoVisibility
                  : undefined,
            },
         });
      } else {
         // 创建新配置
         return await prisma.userSpaceConfig.create({
            data: {
               userId,
               showSubmissionStatus: input.showSubmissionStatus ?? true,
               showAchievements: input.showAchievements ?? true,
               personalInfoVisibility: input.personalInfoVisibility ?? {
                  birthday: true,
                  email: true,
                  identifier: true,
                  major: true,
               },
            },
         });
      }
   });

// 获取提交统计
const GetCommitStatisticSchema = z.object({
   name: z.string(),
});

const getCommitStatisticProcedure = protectedProcedure
   .input(GetCommitStatisticSchema)
   .query(async ({ input }) => {
      const { name } = input;

      const user = await prisma.user.findUnique({
         where: { name },
         select: { id: true },
      });

      if (!user) {
         throw new TRPCError({
            code: 'NOT_FOUND',
            message: '用户不存在',
         });
      }

      return await prisma.userStatistic.findUnique({
         where: { userId: user.id },
         select: {
            correctRate: true,
            passCount: true,
            score: true,
         },
      });
   });

// 获取最近提交题目
const GetRecentPromblemsSchema = z.object({
   name: z.string(),
});

// 获取最近提交的题目列表（去重后按提交时间排序，限制返回数量）
const getRecentProblemsProcedure = protectedProcedure
   .input(GetRecentPromblemsSchema)
   .query(async ({ input }) => {
      const { name } = input;

      const user = await prisma.user.findUnique({
         where: { name },
         select: { id: true },
      });

      if (!user) {
         throw new TRPCError({
            code: 'NOT_FOUND',
            message: '用户不存在',
         });
      }

      // 按基础题汇总最近提交（任一版本的提交都算），展示基础题当前已发布的版本
      const recentBases = await prisma.$queryRaw<
         { baseId: number; currentPid: number }[]
      >`
         SELECT base_problems.id AS "baseId", base_problems."currentPid" AS "currentPid"
         FROM judge_records
         JOIN problems ON judge_records."problemId" = problems.pid
         JOIN base_problems ON base_problems.id = problems."baseId"
         JOIN problems current ON current.pid = base_problems."currentPid"
         WHERE judge_records."userId" = ${user.id}
            AND current.status = 'published'
            AND current."isDeprecated" = false
         GROUP BY base_problems.id, base_problems."currentPid"
         ORDER BY MAX(judge_records."createdAt") DESC
         LIMIT 5
      `;
      const currentPids = recentBases.map((row) => row.currentPid);

      const [problems, passRates] = await Promise.all([
         prisma.problems.findMany({
            where: { pid: { in: currentPids } },
            select: {
               pid: true,
               baseId: true,
               title: true,
               difficulty: true,
               totalScore: true,
               tags: {
                  select: {
                     name: true,
                     color: true,
                  },
               },
               CoverImage: {
                  select: {
                     name: true,
                     thumbhash: true,
                  },
               },
               ProblemDefaultCover: {
                  select: {
                     image: {
                        select: { name: true, thumbhash: true },
                     },
                  },
               },
            },
         }),
         problemStatService.getPassRates(recentBases.map((row) => row.baseId)),
      ]);
      const problemByPid = new Map(problems.map((p) => [p.pid, p]));

      const rawProblems = currentPids
         .map((pid) => problemByPid.get(pid))
         .filter((p) => p !== undefined)
         .map((p) => {
            const passRate = (passRates.get(p.baseId) ?? 0) * 100;
            return {
               ...p,
               // 同 public/problem.ts：无封面返回 null，避免拼出 /api/static/unknown（403）
               imageName:
                  p.CoverImage?.name ||
                  p.ProblemDefaultCover?.[0]?.image?.name ||
                  null,
               imageHash:
                  p.CoverImage?.thumbhash ||
                  p.ProblemDefaultCover?.[0]?.image?.thumbhash ||
                  null,
               passRate,
               CoverImage: undefined,
               ProblemDefaultCover: undefined,
            };
         });

      // 服务端带缓存地把 thumbhash 渲染为 data URL，供 SSR 首帧直接使用
      const imageThumbhashUrls = await renderThumbhashDataUrls(
         rawProblems.map((problem) => problem.imageHash),
      );
      return rawProblems.map((problem, index) => ({
         ...problem,
         imageThumbhashUrl: imageThumbhashUrls[index],
      }));
   });

// 修改密码
const ChangePasswordSchema = z.object({
   verifyToken: z.string().length(4),
   newPassword: z.string().min(6),
   confirmPassword: z.string().min(6),
});

const changePasswordProcedure = protectedProcedure
   .input(ChangePasswordSchema)
   .mutation(async ({ input, ctx }) => {
      const { userId } = ctx.user;
      const { verifyToken, newPassword, confirmPassword } = input;

      if (newPassword !== confirmPassword) {
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: '新密码和确认密码不匹配',
         });
      }

      const userInfo = await prisma.user.findUnique({
         where: { id: ctx.user.userId },
         select: { email: true },
      });

      if (!userInfo) {
         throw new TRPCError({
            code: 'NOT_FOUND',
            message: '用户不存在',
         });
      }

      const redis = useRedis();
      const verifiedEmail = await redis.get(`verify_token:${verifyToken}`);

      if (verifiedEmail !== userInfo.email) {
         logger.error(
            `验证码验证失败，用户输入的验证码: ${verifyToken}, 存储的邮箱: ${verifiedEmail}, 用户邮箱: ${userInfo.email}`,
         );
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: '验证码错误或已过期',
         });
      }

      const hashedPassword = await hashPassword(newPassword);

      await prisma.auth.update({
         where: { id: userId, provider: 'EMAIL' },
         data: { password: hashedPassword },
      });

      await redis.del(`verify_token:${verifyToken}`);

      return true;
   });

export const userRouter = router({
   getUserInfo: getUserInfoProcedure,
   updateUserInfo: updateUserInfoProcedure,
   uploadImage: uploadImageProcedure,
   getUserByName: getUserByNameProcedure,
   getUserSpaceConfig: getUserSpaceConfigProcedure,
   updateUserSpaceConfig: updateUserSpaceConfigProcedure,
   getCommitStatistic: getCommitStatisticProcedure,
   getRecentProblems: getRecentProblemsProcedure,
   changePassword: changePasswordProcedure,
});
