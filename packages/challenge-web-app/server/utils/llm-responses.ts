export type LLMMessage = {
   role: 'user' | 'assistant';
   content: string;
};

type LLMResponse = {
   status?: string;
   incomplete_details?: { reason?: string } | null;
   output?: {
      type?: string;
      role?: string;
      content?: { type?: string; text?: string }[];
   }[];
};

type LLMRequest = {
   model: string;
   instructions: string;
   messages: LLMMessage[];
   signal: AbortSignal;
   maxOutputTokens: number;
   reasoningEffort?: 'none' | 'low' | 'high' | 'max';
   outputFormat?: 'text' | 'json_object';
   topP?: number;
};

/** Call the Responses API and return only the assistant's final text and completion status. */
export async function callLlmResponses(request: LLMRequest) {
   const { apiKey, responsesUrl } = useRuntimeConfig().llm;
   if (!apiKey) throw new Error('LLM_NOT_CONFIGURED');

   const response = await fetch(responsesUrl, {
      method: 'POST',
      headers: {
         'Content-Type': 'application/json',
         Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
         model: request.model,
         reasoning: { effort: request.reasoningEffort ?? 'high' },
         max_output_tokens: request.maxOutputTokens,
         top_p: request.topP,
         text: { format: { type: request.outputFormat ?? 'json_object' } },
         instructions: request.instructions,
         input: request.messages,
      }),
      signal: request.signal,
   });

   if (!response.ok) {
      throw Object.assign(new Error('MODEL_HTTP_ERROR'), { statusCode: response.status });
   }

   const result = await response.json() as LLMResponse;
   const text = (result.output ?? [])
      .filter(item => item.type === 'message' && item.role === 'assistant')
      .flatMap(item => item.content ?? [])
      .filter(part => part.type === 'output_text')
      .map(part => part.text ?? '')
      .join('');

   return {
      text,
      status: result.status,
      finishReason: result.incomplete_details?.reason === 'max_output_tokens' ? 'length' : result.status,
   };
}
