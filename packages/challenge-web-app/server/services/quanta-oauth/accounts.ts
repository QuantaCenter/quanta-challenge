import prisma from '~~/lib/prisma';
import { createAccountService } from './accounts-core';

export const { findBinding, createOrLink } = createAccountService(prisma);
