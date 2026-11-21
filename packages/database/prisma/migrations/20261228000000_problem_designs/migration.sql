CREATE TYPE "ProblemDesignMode" AS ENUM ('flat', 'hierarchical');
CREATE TYPE "ProblemDesignStatus" AS ENUM ('pending', 'ready', 'failed');

CREATE TABLE "problem_designs" (
  "problemId" INTEGER NOT NULL,
  "mode" "ProblemDesignMode" NOT NULL,
  "status" "ProblemDesignStatus" NOT NULL DEFAULT 'pending',
  "document" JSONB,
  CONSTRAINT "problem_designs_pkey" PRIMARY KEY ("problemId"),
  CONSTRAINT "problem_designs_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("pid") ON DELETE CASCADE ON UPDATE CASCADE
);
