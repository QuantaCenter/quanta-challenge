export type LearningChapter = {
   id: string;
   title: string;
   introduction: string;
   stages: { sections: { id: string; title: string; type: 'article' | 'problem' }[] }[];
};

export function buildLearningOutline(
   chapters: LearningChapter[],
   progress: { sectionId: string; completedAt: Date }[],
   enrolledAt: Date,
) {
   const completed = new Map(progress.map(item => [item.sectionId, item.completedAt]));
   let previousComplete = true;
   let unlockedAt = enrolledAt;
   return chapters.map(chapter => {
      const unlocked = previousComplete;
      const sections = chapter.stages.flatMap(stage => {
         const stageUnlocked = previousComplete;
         const stageUnlockedAt = unlockedAt;
         const items = stage.sections.map(section => ({
            ...section,
            completed: completed.has(section.id),
            unlocked: stageUnlocked,
            unlockedAt: stageUnlocked ? stageUnlockedAt : null,
         }));
         previousComplete = stageUnlocked && items.length > 0 && items.every(item => item.completed);
         if (previousComplete) {
            for (const section of stage.sections) {
               const date = completed.get(section.id)!;
               if (date > unlockedAt) unlockedAt = date;
            }
         }
         return items;
      });
      const complete = sections.length > 0 && sections.every(section => section.completed);
      if (!sections.length) previousComplete = false;
      return {
         id: chapter.id,
         title: chapter.title,
         introduction: unlocked ? chapter.introduction : null,
         unlocked,
         completed: complete,
         sections,
      };
   });
}
