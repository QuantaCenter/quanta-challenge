// 必须用默认导入再解构：@prisma/client 是 CJS 入口（default.js 形如 module.exports = { ...require('<绝对路径>.prisma/client/default') }），cjs-module-lexer 无法静态分析出 PrismaClient，ESM 具名导入会报 "Named export 'PrismaClient' not found"。
import prismaClientPkg from '@prisma/client';

const { PrismaClient } = prismaClientPkg;

const prismaClientSingleton = () => {
   return new PrismaClient();
};

declare const globalThis: {
   prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;
