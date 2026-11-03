export function useLearningSection() {
   const { $trpc } = useNuxtApp();
   type Section = Awaited<ReturnType<typeof $trpc.protected.learning.section.query>>;
   const prepared = useState<{ key: string; data: Section } | null>('learning-prepared-section', () => null);
   const key = (courseId: string, sectionId: string) => `${courseId}:${sectionId}`;
   const fetchSection = (courseId: string, sectionId: string) =>
      $trpc.protected.learning.section.query({ id: courseId, sectionId });
   return {
      fetchSection,
      prepare(courseId: string, sectionId: string, data: Section) {
         prepared.value = { key: key(courseId, sectionId), data };
      },
      async load(courseId: string, sectionId: string) {
         if (prepared.value?.key === key(courseId, sectionId)) {
            const data = prepared.value.data;
            prepared.value = null;
            return data;
         }
         return fetchSection(courseId, sectionId);
      },
   };
}
