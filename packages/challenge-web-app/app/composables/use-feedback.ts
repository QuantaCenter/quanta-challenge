interface FeedbackContext {
   pagePath?: string;
   traceId?: string;
}

export function useFeedback() {
   const context = useState<FeedbackContext | null>('feedback-context', () => null);

   function openFeedback(event: MouseEvent, errorTraceId?: string) {
      if (context.value) return;

      // Store the page the user reported from, even if a navigation finishes
      // while the dialog is open. The URL search and fragment are excluded.
      const path = window.location.pathname;
      const pagePath = /^\/(?![/\\])[^\\]*$/.test(path) && path.length <= 500 ? path : undefined;
      const traceId = errorTraceId && /^[\da-f]{32}$/.test(errorTraceId) ? errorTraceId : undefined;

      // Safari does not focus buttons on pointer activation by default.
      if (event.currentTarget instanceof HTMLElement) {
         event.currentTarget.focus({ preventScroll: true });
      }
      context.value = { pagePath, traceId };
   }

   return { context, openFeedback };
}
