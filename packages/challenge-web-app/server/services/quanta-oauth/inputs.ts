import z from 'zod';

const csrfToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const onboardingInputSchema = z.discriminatedUnion('action', [
   z.strictObject({ action: z.literal('create'), csrfToken }),
   z.strictObject({
      action: z.literal('verify'),
      csrfToken,
      email: z.email().max(254),
      password: z.string().min(1).max(200),
   }),
   z.strictObject({ action: z.literal('link'), csrfToken }),
]);

export type OnboardingInput = z.infer<typeof onboardingInputSchema>;

export interface PendingIdentity {
   identityKey: string;
   name: string;
   verifiedUserId?: string;
   verifiedAt?: number;
}
