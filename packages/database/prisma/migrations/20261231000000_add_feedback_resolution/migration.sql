ALTER TABLE "feedback"
  ADD COLUMN "notifyOnResolve" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "resolution" VARCHAR(1000);
