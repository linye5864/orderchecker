/*
  Warnings:

  - Added the required column `kind` to the `UploadedFile` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UploadedFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "originalName" TEXT,
    "type" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "platformId" TEXT,
    "taskId" TEXT,
    "size" INTEGER NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UploadedFile_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ReconciliationTask" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_UploadedFile" ("createdAt", "error", "filePath", "id", "name", "platformId", "rowCount", "size", "status", "taskId", "type") SELECT "createdAt", "error", "filePath", "id", "name", "platformId", "rowCount", "size", "status", "taskId", "type" FROM "UploadedFile";
DROP TABLE "UploadedFile";
ALTER TABLE "new_UploadedFile" RENAME TO "UploadedFile";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
