/**
 * Direct SQLite database helper
 * Bypasses Prisma to avoid client generation issues
 */
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

const dbPath = path.join(process.cwd(), 'dev.db');

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (db) return db;

  db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  return db;
}

// ==================== 文件操作 ====================

/**
 * Upload file record to database
 */
export async function uploadFileRecord(data: {
  id: string;
  name: string;
  originalName: string;
  type: string;
  size: number;
  filePath: string;
  kind: string;
  platformId?: string;
  rowCount: number;
}): Promise<any> {
  const database = await getDb();
  
  await database.run(
    `INSERT INTO UploadedFile (id, name, originalName, type, kind, platformId, size, rowCount, filePath, status, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', datetime('now'))`,
    [data.id, data.name, data.originalName, data.type, data.kind, data.platformId || null, data.size, data.rowCount, data.filePath]
  );

  return {
    id: data.id,
    name: data.name,
    originalName: data.originalName,
    size: data.size,
    type: data.type,
    kind: data.kind,
    rowCount: data.rowCount,
  };
}

/**
 * Get uploaded files
 */
export async function getFiles(kind?: string): Promise<any[]> {
  const database = await getDb();
  
  if (kind) {
    return database.all(
      `SELECT id, name, originalName, type, kind, platformId, size, rowCount, filePath, status, createdAt
       FROM UploadedFile WHERE kind = ? ORDER BY createdAt DESC`,
      [kind]
    );
  }
  
  return database.all(
    `SELECT id, name, originalName, type, kind, platformId, size, rowCount, filePath, status, createdAt
     FROM UploadedFile ORDER BY createdAt DESC`
  );
}

/**
 * Get file by ID
 */
export async function getFileById(id: string): Promise<any> {
  const database = await getDb();
  
  const file = await database.get(
    `SELECT id, name, originalName, type, kind, platformId, size, rowCount, filePath, status, createdAt
     FROM UploadedFile WHERE id = ?`,
    [id]
  );
  
  return file || null;
}

/**
 * Delete file record
 */
export async function deleteFileRecord(id: string): Promise<boolean> {
  const database = await getDb();
  
  const result = await database.run(
    `DELETE FROM UploadedFile WHERE id = ?`,
    [id]
  );
  
  return (result.changes ?? 0) > 0;
}

// ==================== 任务操作 ====================

/**
 * Create reconciliation task
 */
export async function createReconciliationTask(data: {
  id: string;
  name: string;
  platformId: string;
  userId?: string;
}): Promise<void> {
  const database = await getDb();
  
  await database.run(
    `INSERT INTO ReconciliationTask (id, name, platformId, userId, startDate, endDate, status, progress, createdAt)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), 'PROCESSING', 0, datetime('now'))`,
    [data.id, data.name, data.platformId, data.userId || 'system']
  );
}

/**
 * Update reconciliation task
 */
export async function updateReconciliationTask(
  id: string,
  data: Partial<{
    status: string;
    progress: number;
    errorMessage: string;
    localOrderCount: number;
    platformOrderCount: number;
    matchedCount: number;
    exceptionCount: number;
    totalAmount: number;
    matchedAmount: number;
    completedAt: Date;
  }>
): Promise<void> {
  const database = await getDb();
  
  const sets: string[] = [];
  const values: any[] = [];
  
  if (data.status !== undefined) {
    sets.push('status = ?');
    values.push(data.status);
  }
  if (data.progress !== undefined) {
    sets.push('progress = ?');
    values.push(data.progress);
  }
  if (data.errorMessage !== undefined) {
    sets.push('errorMessage = ?');
    values.push(data.errorMessage);
  }
  if (data.localOrderCount !== undefined) {
    sets.push('localOrderCount = ?');
    values.push(data.localOrderCount);
  }
  if (data.platformOrderCount !== undefined) {
    sets.push('platformOrderCount = ?');
    values.push(data.platformOrderCount);
  }
  if (data.matchedCount !== undefined) {
    sets.push('matchedCount = ?');
    values.push(data.matchedCount);
  }
  if (data.exceptionCount !== undefined) {
    sets.push('exceptionCount = ?');
    values.push(data.exceptionCount);
  }
  if (data.totalAmount !== undefined) {
    sets.push('totalAmount = ?');
    values.push(data.totalAmount);
  }
  if (data.matchedAmount !== undefined) {
    sets.push('matchedAmount = ?');
    values.push(data.matchedAmount);
  }
  if (data.completedAt !== undefined) {
    sets.push('completedAt = datetime(?)');
    values.push(data.completedAt.toISOString());
  }
  
  if (sets.length === 0) return;
  
  values.push(id);
  
  await database.run(
    `UPDATE ReconciliationTask SET ${sets.join(', ')} WHERE id = ?`,
    values
  );
}

/**
 * Get reconciliation task by ID
 */
export async function getReconciliationTaskById(id: string): Promise<any> {
  const database = await getDb();
  
  const task = await database.get(
    `SELECT * FROM ReconciliationTask WHERE id = ?`,
    [id]
  );
  
  return task || null;
}

/**
 * Get reconciliation task by ID with results
 */
export async function getReconciliationTaskWithResults(id: string): Promise<any> {
  const database = await getDb();
  
  const task = await database.get(
    `SELECT * FROM ReconciliationTask WHERE id = ?`,
    [id]
  );
  
  if (!task) return null;
  
  // Get results
  const results = await database.all(
    `SELECT * FROM ReconciliationResult WHERE taskId = ?`,
    [id]
  );
  
  // Get files
  const files = await database.all(
    `SELECT * FROM UploadedFile WHERE taskId = ?`,
    [id]
  );
  
  return {
    ...task,
    results,
    files,
  };
}

/**
 * Get reconciliation progress
 */
export async function getReconciliationProgress(id: string): Promise<any> {
  const database = await getDb();
  
  const task = await database.get(
    `SELECT id, name, status, progress, errorMessage, createdAt, completedAt
     FROM ReconciliationTask WHERE id = ?`,
    [id]
  );
  
  return task || null;
}

/**
 * Get reconciliation result with orders parsed
 */
export async function getReconciliationResultWithOrders(taskId: string): Promise<any> {
  const database = await getDb();
  
  const task = await database.get(
    `SELECT * FROM ReconciliationTask WHERE id = ?`,
    [taskId]
  );
  
  if (!task) return null;
  
  const result = await database.get(
    `SELECT * FROM ReconciliationResult WHERE taskId = ?`,
    [taskId]
  );
  
  if (!result) return null;
  
  return {
    task,
    results: {
      ...result,
      orders: JSON.parse(result.orders),
    },
  };
}

/**
 * Create reconciliation result
 */
export async function createReconciliationResult(data: {
  id: string;
  taskId: string;
  totalOrders: number;
  matchedOrders: number;
  exceptionOrders: number;
  perfectMatches: number;
  toleranceMatches: number;
  totalLocalAmount: number;
  totalPlatformAmount: number;
  totalMatchedAmount: number;
  matchRate: number;
  amountDiff: number;
  orders: string;
}): Promise<void> {
  const database = await getDb();
  
  await database.run(
    `INSERT INTO ReconciliationResult 
     (id, taskId, totalOrders, matchedOrders, exceptionOrders, perfectMatches, toleranceMatches,
      totalLocalAmount, totalPlatformAmount, totalMatchedAmount, matchRate, amountDiff, orders, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [data.id, data.taskId, data.totalOrders, data.matchedOrders, data.exceptionOrders,
     data.perfectMatches, data.toleranceMatches, data.totalLocalAmount, data.totalPlatformAmount,
     data.totalMatchedAmount, data.matchRate, data.amountDiff, data.orders]
  );
}

/**
 * Get reconciliation result by task ID
 */
export async function getReconciliationResultByTaskId(taskId: string): Promise<any> {
  const database = await getDb();
  
  const result = await database.get(
    `SELECT * FROM ReconciliationResult WHERE taskId = ?`,
    [taskId]
  );
  
  return result || null;
}

// ==================== 历史记录操作 ====================

export interface ReconciliationHistoryFilters {
  status?: string;
  platformId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface ReconciliationHistoryItem {
  id: string;
  name: string;
  platformId: string;
  status: string;
  progress: number;
  localOrderCount: number;
  platformOrderCount: number;
  matchedCount: number;
  exceptionCount: number;
  totalAmount: number;
  matchedAmount: number;
  createdAt: string;
  completedAt?: string;
  resultId?: string;
  totalOrders?: number;
  matchedOrders?: number;
  exceptionOrders?: number;
  matchRate?: number;
  amountDiff?: number;
}

/**
 * Get reconciliation history with pagination and filtering
 */
export async function getReconciliationHistory(
  page: number = 1,
  pageSize: number = 10,
  filters?: ReconciliationHistoryFilters
): Promise<{ items: ReconciliationHistoryItem[]; total: number; totalPages: number }> {
  const database = await getDb();
  
  // Build WHERE clause
  const conditions: string[] = [];
  const params: any[] = [];
  
  if (filters?.status && filters.status !== 'all') {
    conditions.push('t.status = ?');
    params.push(filters.status.toUpperCase());
  }
  
  if (filters?.platformId) {
    conditions.push('t.platformId = ?');
    params.push(filters.platformId);
  }
  
  if (filters?.startDate) {
    conditions.push('date(t.createdAt) >= date(?)');
    params.push(filters.startDate);
  }
  
  if (filters?.endDate) {
    conditions.push('date(t.createdAt) <= date(?)');
    params.push(filters.endDate);
  }
  
  if (filters?.search) {
    conditions.push('(t.name LIKE ? OR t.id LIKE ?)');
    const searchPattern = `%${filters.search}%`;
    params.push(searchPattern, searchPattern);
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Get total count
  const countResult = await database.get(
    `SELECT COUNT(*) as total FROM ReconciliationTask t ${whereClause}`,
    params
  );
  const total = countResult?.total || 0;
  const totalPages = Math.ceil(total / pageSize);
  
  // Get paginated results
  const offset = (page - 1) * pageSize;
  
  const tasks = await database.all(
    `SELECT 
       t.id,
       t.name,
       t.platformId,
       t.status,
       t.progress,
       t.localOrderCount,
       t.platformOrderCount,
       t.matchedCount,
       t.exceptionCount,
       t.totalAmount,
       t.matchedAmount,
       t.createdAt,
       t.completedAt,
       r.id as resultId,
       r.totalOrders,
       r.matchedOrders,
       r.exceptionOrders,
       r.matchRate,
       r.amountDiff
     FROM ReconciliationTask t
     LEFT JOIN ReconciliationResult r ON t.id = r.taskId
     ${whereClause}
     ORDER BY t.createdAt DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  
  return {
    items: tasks.map(task => ({
      ...task,
      exceptionCount: task.exceptionCount || 0,
    })),
    total,
    totalPages,
  };
}

/**
 * Get reconciliation history statistics
 */
export async function getReconciliationHistoryStats(): Promise<{
  total: number;
  completed: number;
  failed: number;
  cancelled: number;
  totalOrders: number;
  totalMatchedOrders: number;
  totalAmount: number;
  totalMatchedAmount: number;
}> {
  const database = await getDb();
  
  const stats = await database.get(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled,
      SUM(CASE WHEN status = 'COMPLETED' THEN localOrderCount ELSE 0 END) as totalOrders,
      SUM(CASE WHEN status = 'COMPLETED' THEN matchedCount ELSE 0 END) as totalMatchedOrders,
      SUM(CASE WHEN status = 'COMPLETED' THEN totalAmount ELSE 0 END) as totalAmount,
      SUM(CASE WHEN status = 'COMPLETED' THEN matchedAmount ELSE 0 END) as totalMatchedAmount
    FROM ReconciliationTask
  `);
  
  return {
    total: stats?.total || 0,
    completed: stats?.completed || 0,
    failed: stats?.failed || 0,
    cancelled: stats?.cancelled || 0,
    totalOrders: stats?.totalOrders || 0,
    totalMatchedOrders: stats?.totalMatchedOrders || 0,
    totalAmount: stats?.totalAmount || 0,
    totalMatchedAmount: stats?.totalMatchedAmount || 0,
  };
}

// ==================== 用户操作 ====================

/**
 * Check if admin user exists
 */
export async function hasAdminUser(): Promise<boolean> {
  const database = await getDb();
  
  const user = await database.get(
    `SELECT id FROM User WHERE username = 'admin'`
  );
  
  return !!user;
}
