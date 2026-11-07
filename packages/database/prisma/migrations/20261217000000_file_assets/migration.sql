CREATE TABLE "file_assets" (
  "id" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "sizeBytes" BIGINT NOT NULL CHECK ("sizeBytes" >= 0),
  "sha256" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "file_assets_storageKey_key" ON "file_assets"("storageKey");
CREATE UNIQUE INDEX "file_assets_uploadedById_sha256_key" ON "file_assets"("uploadedById", "sha256");
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "virtual_files" ALTER COLUMN "content" DROP NOT NULL, ADD COLUMN "assetId" TEXT;
ALTER TABLE "virtual_files" ADD CONSTRAINT "virtual_files_content_asset_check" CHECK (("content" IS NOT NULL) <> ("assetId" IS NOT NULL));
CREATE INDEX "virtual_files_assetId_idx" ON "virtual_files"("assetId");
ALTER TABLE "virtual_files" ADD CONSTRAINT "virtual_files_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
