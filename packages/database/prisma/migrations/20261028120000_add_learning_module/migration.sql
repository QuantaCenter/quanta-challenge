-- CreateEnum
CREATE TYPE "LearningPublishStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "learning_articles" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "status" "LearningPublishStatus" NOT NULL DEFAULT 'DRAFT',
    "coverImageId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "learning_articles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_topics" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "LearningPublishStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "learning_topics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_topic_articles" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "sort" INTEGER NOT NULL,
    CONSTRAINT "learning_topic_articles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_topic_problems" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "baseId" INTEGER NOT NULL,
    "sort" INTEGER NOT NULL,
    CONSTRAINT "learning_topic_problems_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_article_problems" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "baseId" INTEGER NOT NULL,
    "sort" INTEGER NOT NULL,
    CONSTRAINT "learning_article_problems_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_playgrounds" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '动手试一试',
    "html" TEXT NOT NULL DEFAULT '',
    "css" TEXT NOT NULL DEFAULT '',
    "js" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "learning_playgrounds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_article_reads" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "learning_article_reads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_topic_visits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "learning_topic_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "learning_articles_status_publishedAt_idx" ON "learning_articles"("status", "publishedAt");
CREATE INDEX "learning_articles_authorId_idx" ON "learning_articles"("authorId");
CREATE INDEX "learning_topics_status_publishedAt_idx" ON "learning_topics"("status", "publishedAt");
CREATE INDEX "learning_topics_authorId_idx" ON "learning_topics"("authorId");
CREATE UNIQUE INDEX "learning_topic_articles_topicId_articleId_key" ON "learning_topic_articles"("topicId", "articleId");
CREATE INDEX "learning_topic_articles_topicId_sort_idx" ON "learning_topic_articles"("topicId", "sort");
CREATE INDEX "learning_topic_articles_articleId_idx" ON "learning_topic_articles"("articleId");
CREATE UNIQUE INDEX "learning_topic_problems_topicId_baseId_key" ON "learning_topic_problems"("topicId", "baseId");
CREATE INDEX "learning_topic_problems_topicId_sort_idx" ON "learning_topic_problems"("topicId", "sort");
CREATE INDEX "learning_topic_problems_baseId_idx" ON "learning_topic_problems"("baseId");
CREATE UNIQUE INDEX "learning_article_problems_articleId_baseId_key" ON "learning_article_problems"("articleId", "baseId");
CREATE INDEX "learning_article_problems_articleId_sort_idx" ON "learning_article_problems"("articleId", "sort");
CREATE INDEX "learning_article_problems_baseId_idx" ON "learning_article_problems"("baseId");
CREATE INDEX "learning_playgrounds_articleId_idx" ON "learning_playgrounds"("articleId");
CREATE UNIQUE INDEX "learning_article_reads_userId_articleId_key" ON "learning_article_reads"("userId", "articleId");
CREATE INDEX "learning_article_reads_userId_readAt_idx" ON "learning_article_reads"("userId", "readAt");
CREATE UNIQUE INDEX "learning_topic_visits_userId_topicId_key" ON "learning_topic_visits"("userId", "topicId");
CREATE INDEX "learning_topic_visits_userId_visitedAt_idx" ON "learning_topic_visits"("userId", "visitedAt");

-- AddForeignKey
ALTER TABLE "learning_articles" ADD CONSTRAINT "learning_articles_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learning_articles" ADD CONSTRAINT "learning_articles_coverImageId_fkey" FOREIGN KEY ("coverImageId") REFERENCES "images"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "learning_topics" ADD CONSTRAINT "learning_topics_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learning_topic_articles" ADD CONSTRAINT "learning_topic_articles_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "learning_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_topic_articles" ADD CONSTRAINT "learning_topic_articles_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "learning_articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learning_topic_problems" ADD CONSTRAINT "learning_topic_problems_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "learning_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_topic_problems" ADD CONSTRAINT "learning_topic_problems_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "base_problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learning_article_problems" ADD CONSTRAINT "learning_article_problems_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "learning_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_article_problems" ADD CONSTRAINT "learning_article_problems_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "base_problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learning_playgrounds" ADD CONSTRAINT "learning_playgrounds_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "learning_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_article_reads" ADD CONSTRAINT "learning_article_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_article_reads" ADD CONSTRAINT "learning_article_reads_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "learning_articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learning_topic_visits" ADD CONSTRAINT "learning_topic_visits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_topic_visits" ADD CONSTRAINT "learning_topic_visits_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "learning_topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
