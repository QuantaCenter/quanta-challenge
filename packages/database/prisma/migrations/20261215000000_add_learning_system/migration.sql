-- CreateEnum
CREATE TYPE "LearningCourseStatus" AS ENUM ('draft', 'published', 'unpublished');

-- CreateEnum
CREATE TYPE "CourseSectionType" AS ENUM ('article', 'problem');

-- CreateEnum
CREATE TYPE "SectionCommentReferenceType" AS ENUM ('text');

-- CreateTable
CREATE TABLE "learning_courses" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "coverImageId" TEXT,
    "status" "LearningCourseStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_chapters" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "introduction" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_stages" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_sections" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "CourseSectionType" NOT NULL,
    "articleContent" TEXT,
    "baseProblemId" INTEGER,
    "contentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_enrollments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "section_progress" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "judgeRecordId" INTEGER,

    CONSTRAINT "section_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_ratings" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "section_comments" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "section_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "section_comment_references" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "type" "SectionCommentReferenceType" NOT NULL,
    "quotedText" TEXT NOT NULL,
    "prefix" TEXT,
    "suffix" TEXT,
    "startOffset" INTEGER,
    "endOffset" INTEGER,
    "contentVersion" INTEGER NOT NULL,
    "contentTarget" TEXT NOT NULL,

    CONSTRAINT "section_comment_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "learning_courses_status_createdAt_idx" ON "learning_courses"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "course_chapters_courseId_position_key" ON "course_chapters"("courseId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "learning_stages_chapterId_position_key" ON "learning_stages"("chapterId", "position");

-- CreateIndex
CREATE INDEX "course_sections_baseProblemId_idx" ON "course_sections"("baseProblemId");

-- CreateIndex
CREATE UNIQUE INDEX "course_sections_stageId_position_key" ON "course_sections"("stageId", "position");

-- CreateIndex
CREATE INDEX "course_enrollments_courseId_idx" ON "course_enrollments"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "course_enrollments_userId_courseId_key" ON "course_enrollments"("userId", "courseId");

-- CreateIndex
CREATE INDEX "section_progress_sectionId_idx" ON "section_progress"("sectionId");

-- CreateIndex
CREATE INDEX "section_progress_judgeRecordId_idx" ON "section_progress"("judgeRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "section_progress_enrollmentId_sectionId_key" ON "section_progress"("enrollmentId", "sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "course_ratings_enrollmentId_key" ON "course_ratings"("enrollmentId");

-- CreateIndex
CREATE INDEX "section_comments_sectionId_createdAt_id_idx" ON "section_comments"("sectionId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "section_comments_parentId_createdAt_id_idx" ON "section_comments"("parentId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "section_comments_authorId_idx" ON "section_comments"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "section_comment_references_commentId_key" ON "section_comment_references"("commentId");

-- AddForeignKey
ALTER TABLE "learning_courses" ADD CONSTRAINT "learning_courses_coverImageId_fkey" FOREIGN KEY ("coverImageId") REFERENCES "images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_chapters" ADD CONSTRAINT "course_chapters_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "learning_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_stages" ADD CONSTRAINT "learning_stages_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "course_chapters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "learning_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_baseProblemId_fkey" FOREIGN KEY ("baseProblemId") REFERENCES "base_problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "learning_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_progress" ADD CONSTRAINT "section_progress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "course_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_progress" ADD CONSTRAINT "section_progress_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "course_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_progress" ADD CONSTRAINT "section_progress_judgeRecordId_fkey" FOREIGN KEY ("judgeRecordId") REFERENCES "judge_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_ratings" ADD CONSTRAINT "course_ratings_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "course_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_comments" ADD CONSTRAINT "section_comments_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "course_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_comments" ADD CONSTRAINT "section_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_comments" ADD CONSTRAINT "section_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "section_comments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_comment_references" ADD CONSTRAINT "section_comment_references_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "section_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce the rating range and section content type.
ALTER TABLE "course_ratings" ADD CONSTRAINT "course_ratings_score_check" CHECK ("score" BETWEEN 1 AND 5);
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_content_check" CHECK (("type" = 'article' AND "articleContent" IS NOT NULL AND "baseProblemId" IS NULL) OR ("type" = 'problem' AND "baseProblemId" IS NOT NULL AND "articleContent" IS NULL));
ALTER TABLE "section_comment_references" ADD CONSTRAINT "section_comment_references_offsets_check" CHECK (("startOffset" IS NULL AND "endOffset" IS NULL) OR ("startOffset" IS NOT NULL AND "endOffset" IS NOT NULL AND "startOffset" >= 0 AND "endOffset" > "startOffset"));
