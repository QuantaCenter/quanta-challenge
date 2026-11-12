-- CreateTable
CREATE TABLE "lab_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lab_categories_sortOrder_idx" ON "lab_categories"("sortOrder");

-- 预置内置分类：id 与内置模板 template.json / 已发布模板中的 category 保持一致
INSERT INTO "lab_categories" ("id", "name", "description", "color", "icon", "sortOrder", "enabled", "builtin", "updatedAt") VALUES
    ('framework', '前端框架', 'Vue、React 等前端框架项目', '#38BDF8', 'components', 0, true, true, CURRENT_TIMESTAMP),
    ('chart', '数据可视化', 'ECharts、Chart.js、D3 等图表项目', '#FA7C0E', 'chart-histogram', 1, true, true, CURRENT_TIMESTAMP),
    ('basic', '基础', 'HTML / CSS / JavaScript 基础项目', '#4ADE80', 'code-brackets', 2, true, true, CURRENT_TIMESTAMP),
    ('backend', '后端服务', 'Node.js 等后端服务项目', '#A78BFA', 'server', 3, true, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
