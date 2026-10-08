-- CreateTable
CREATE TABLE "cloud_functions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "kvUserIsolated" BOOLEAN NOT NULL DEFAULT true,
    "timeoutMs" INTEGER NOT NULL DEFAULT 5000,
    "maxResponseBytes" INTEGER NOT NULL DEFAULT 262144,
    "activeVersionId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cloud_functions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_function_versions" (
    "id" TEXT NOT NULL,
    "functionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "compiledCode" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_function_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_function_api_keys" (
    "id" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scopes" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "allowedFunctions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "masterVersion" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cloudFunctionId" TEXT,

    CONSTRAINT "cloud_function_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_function_invocations" (
    "id" TEXT NOT NULL,
    "functionId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "callerType" TEXT NOT NULL,
    "callerKeyId" TEXT,
    "userId" TEXT,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "durationMs" INTEGER NOT NULL,
    "inputBytes" INTEGER NOT NULL DEFAULT 0,
    "outputBytes" INTEGER NOT NULL DEFAULT 0,
    "traceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_function_invocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cloud_functions_name_key" ON "cloud_functions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_functions_activeVersionId_key" ON "cloud_functions"("activeVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_function_versions_functionId_version_key" ON "cloud_function_versions"("functionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_function_api_keys_keyId_key" ON "cloud_function_api_keys"("keyId");

-- CreateIndex
CREATE INDEX "cloud_function_invocations_functionId_createdAt_idx" ON "cloud_function_invocations"("functionId", "createdAt");

-- CreateIndex
CREATE INDEX "cloud_function_invocations_userId_createdAt_idx" ON "cloud_function_invocations"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "cloud_functions" ADD CONSTRAINT "cloud_functions_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "cloud_function_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_function_versions" ADD CONSTRAINT "cloud_function_versions_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "cloud_functions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_function_api_keys" ADD CONSTRAINT "cloud_function_api_keys_cloudFunctionId_fkey" FOREIGN KEY ("cloudFunctionId") REFERENCES "cloud_functions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
