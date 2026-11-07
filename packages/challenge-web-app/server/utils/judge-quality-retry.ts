export type ReviewAttempt = {
   attempt: number;
   errorCode?: string;
   finishReason?: string;
   status?: number;
};

type PreviousFailure = {
   code: string;
   text?: string;
   details?: string;
};

type ReviewError = {
   name?: string;
   message?: string;
   statusCode?: number;
   finishReason?: string;
   text?: string;
   issues?: unknown;
};

type ClassifiedError = PreviousFailure & {
   retry: boolean;
   status?: number;
   finishReason?: string;
};

export class QualityGenerationError extends Error {
   attempts: ReviewAttempt[];

   constructor(attempts: ReviewAttempt[]) {
      super('QUALITY_GENERATION_FAILED');
      this.name = 'QualityGenerationError';
      this.attempts = attempts;
   }
}

export function classifyReviewError(error: unknown): ClassifiedError {
   const reviewError = error as ReviewError;
   const status = reviewError?.statusCode;

   if (status === 401 || status === 403) {
      return { code: 'QUALITY_AUTH_FAILED', retry: false, status };
   }
   if (status && status >= 400 && status < 500 && status !== 429 && status !== 408) {
      return { code: 'QUALITY_REQUEST_REJECTED', retry: false, status };
   }

   const message = reviewError?.message?.split(':')[0] ?? '';
   if (['LLM_NOT_CONFIGURED', 'QUALITY_INPUT_TOO_LARGE'].includes(message)) {
      return { code: message, retry: false };
   }

   let code: string;
   if (reviewError?.finishReason === 'length') {
      code = 'QUALITY_OUTPUT_TRUNCATED';
   } else if (reviewError?.name?.includes('NoObject') || reviewError?.name?.includes('NoOutput')) {
      code = 'QUALITY_INVALID_OBJECT';
   } else if (reviewError?.name === 'ZodError') {
      code = 'QUALITY_INVALID_SCHEMA';
   } else if (status === 429) {
      code = 'QUALITY_RATE_LIMITED';
   } else {
      code = 'QUALITY_PROVIDER_ERROR';
   }

   let details: string | undefined;
   if (reviewError?.name === 'ZodError' && reviewError.issues) {
      details = JSON.stringify(reviewError.issues).slice(0, 4000);
   } else if (reviewError?.message?.includes(':')) {
      details = reviewError.message.slice(reviewError.message.indexOf(':') + 1, 4000);
   }

   return {
      code,
      retry: true,
      status,
      finishReason: reviewError?.finishReason,
      text: reviewError?.text,
      details,
   };
}

/** Injectable backoff/deadline for deterministic failure-path tests. Never returns an unvalidated result. */
export async function withQualityRetries<T>(
   run: (context: { attempt: number; previous?: PreviousFailure; signal: AbortSignal }) => Promise<T>,
   options: {
      onAttempt?: (attempt: ReviewAttempt) => void;
      sleep?: (milliseconds: number) => Promise<void>;
      signal?: AbortSignal;
   } = {},
) {
   const signal = options.signal ?? AbortSignal.timeout(240_000);
   const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds)));
   const attempts: ReviewAttempt[] = [];
   let previous: PreviousFailure | undefined;

   for (let attempt = 1; attempt <= 3; attempt++) {
      if (signal.aborted) break;

      try {
         const value = await run({ attempt, previous, signal });
         options.onAttempt?.({ attempt });
         return value;
      } catch (error) {
         const errorInfo = classifyReviewError(error);
         const entry = {
            attempt,
            errorCode: errorInfo.code,
            finishReason: errorInfo.finishReason,
            status: errorInfo.status,
         };
         attempts.push(entry);
         options.onAttempt?.(entry);

         if (!errorInfo.retry || signal.aborted || attempt === 3) break;

         previous = {
            code: errorInfo.code,
            text: errorInfo.text?.slice(0, 40_000),
            details: errorInfo.details,
         };
         await sleep(1000 * 2 ** (attempt - 1));
      }
   }

   throw new QualityGenerationError(attempts);
}
