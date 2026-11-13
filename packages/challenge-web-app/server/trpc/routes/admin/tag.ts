import prisma from '~~/lib/prisma';
import { TRPCError } from '@trpc/server';
import { protectedAdminProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import z from 'zod';
import {
   countLabTagUsage,
   ensureLabTagNameAvailable,
   listBuiltinLabTagNames,
   listLabTags,
} from '../../services/lab-tag';

const hexRegex = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/i;

/** 标签用途：题目标签 / 实验室标签（实验室模板的技术栈标签） */
export const TagScopeSchema = z.enum(['problem', 'lab']);

const AddTagSchema = z.object({
   name: z.string().trim().min(1, 'Tag name is required'),
   color: z
      .string('Color must be a valid hex code')
      .regex(hexRegex, 'Color must be a valid hex code')
      .default('#FA7C0C'),
   description: z.string().optional(),
   imageId: z.string().optional(),
   scope: TagScopeSchema.default('problem'),
});

const addTagProcedure = protectedAdminProcedure
   .input(AddTagSchema)
   .mutation(async ({ ctx, input }) => {
      if (input.scope === 'lab') {
         await ensureLabTagNameAvailable(input.name);
      }
      const tag = await prisma.tags.create({
         data: {
            name: input.name,
            color: input.color,
            description: input.description,
            scope: input.scope,
            creator: {
               connect: {
                  id: ctx.user.userId,
               },
            },
            // 实验室标签可以不上传图标（使用内置技术栈图标或通用图标）
            ...(input.imageId
               ? { image: { connect: { id: input.imageId } } }
               : {}),
         },
      });
      if (input.imageId) {
         await prisma.image.update({
            where: { id: input.imageId },
            data: {
               refCount: {
                  increment: 1,
               },
            },
         });
      }
      return tag;
   });

// 标签用途创建后不可修改：题目已关联的标签不能变成实验室标签，反之亦然
const EditTagSchema = AddTagSchema.omit({ scope: true }).partial().extend({
   tid: z.number().int().nonnegative().min(1, 'Tag ID is required'),
});

const editTagProcedure = protectedAdminProcedure
   .input(EditTagSchema)
   .mutation(async ({ input }) => {
      const current = await prisma.tags.findUnique({
         where: { tid: input.tid },
         select: { name: true, scope: true },
      });
      if (!current) {
         throw new TRPCError({ code: 'NOT_FOUND', message: '标签不存在或已被删除' });
      }
      const renamedLabTag =
         current.scope === 'lab' && input.name !== undefined && input.name !== current.name;
      if (renamedLabTag) {
         await ensureLabTagNameAvailable(input.name!, input.tid);
      }
      return prisma.$transaction(async (tx) => {
         const tag = await tx.tags.update({
            where: { tid: input.tid },
            data: { ...input },
         });
         // 模板按名称引用实验室标签：重命名时同步更新自定义模板
         if (renamedLabTag) {
            await tx.$executeRaw`
               UPDATE lab_templates
               SET tags = array_replace(tags, ${current.name}, ${input.name!}), "updatedAt" = NOW()
               WHERE builtin = false AND ${current.name} = ANY(tags)
            `;
         }
         return tag;
      });
   });

const DeleteTagSchema = z.object({
   tid: z.number().int().nonnegative().min(1, 'Tag ID is required'),
});

const deleteTagProcedure = protectedAdminProcedure
   .input(DeleteTagSchema)
   .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;
      const builtinNames = new Set(await listBuiltinLabTagNames());
      return prisma.$transaction(async (tx) => {
         const tag = await tx.tags.delete({
            where: {
               tid: input.tid,
               creatorId: userId,
            },
         });
         // 删除实验室标签时从自定义模板中移除；与内置标签同名时会恢复为内置标签，保留引用
         if (tag.scope === 'lab' && !builtinNames.has(tag.name)) {
            await tx.$executeRaw`
               UPDATE lab_templates
               SET tags = array_remove(tags, ${tag.name}), "updatedAt" = NOW()
               WHERE builtin = false AND ${tag.name} = ANY(tags)
            `;
         }
         return tag;
      });
   });

/** 实验室标签管理列表：内置标签与已发布的实验室标签合并，附带使用该标签的模板数 */
const labListProcedure = protectedAdminProcedure.query(async () => {
   const [tags, usage] = await Promise.all([listLabTags(), countLabTagUsage()]);
   return tags.map((tag) => ({
      ...tag,
      templateCount: usage.get(tag.name) ?? 0,
   }));
});

const getTagsInMyPublishedProcedure = protectedAdminProcedure.query(
   async ({ ctx }) => {
      const { userId } = ctx.user;
      const tags = await prisma.tags.findMany({
         where: {
            creatorId: userId,
            Problem: {
               some: {
                  BaseProblem: {
                     authorId: userId,
                  },
               },
            },
         },
         select: {
            tid: true,
            name: true,
            color: true,
            image: {
               select: {
                  name: true,
               },
            },
         },
      });

      return tags;
   }
);

export const tagRouter = router({
   add: addTagProcedure,
   edit: editTagProcedure,
   delete: deleteTagProcedure,
   labList: labListProcedure,
   getTagsInMyPublished: getTagsInMyPublishedProcedure,
});
