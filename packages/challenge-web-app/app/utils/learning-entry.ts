type Chapter = {
   id: string;
   unlocked: boolean;
   sections: { id: string; unlocked: boolean; completed: boolean }[];
};

export function getLearningEntry(chapters: Chapter[]): { chapter: string } | { section: string } | undefined {
   for (const chapter of chapters) {
      if (!chapter.unlocked) continue;
      const next = chapter.sections.find(section => section.unlocked && !section.completed);
      if (!next) continue;
      return chapter.sections.some(section => section.completed)
         ? { section: next.id }
         : { chapter: chapter.id };
   }
}
