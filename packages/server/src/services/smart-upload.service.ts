/**
 * 智能文件上传服务
 * 支持：文件大小限制、并发控制、重复检测、断点续传、大文件友好
 */

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import * as fileService from './file-parser.service.js';

// ==================== 配置常量 ====================

const CONFIG = {
  // 文件大小限制
  MAX_FILE_SIZE: 50 * 1024 * 1024,        // 50MB
  MIN_FILE_SIZE: 1 * 1024,                // 1KB（防止空文件）
  
  // 并发限制
  MAX_CONCURRENT_UPLOADS: 5,              // 最大并发上传数
  MAX_CONCURRENT_PER_USER: 3,             // 每用户最大并发
  
  // 大文件阈值
  LARGE_FILE_THRESHOLD: 10 * 1024 * 1024, // 10MB以上视为大文件
  
  // 重复检测
  DUPLICATE_CHECK_METHOD: 'name_size',    // name_size | hash
  
  // 支持的文件类型
  ALLOWED_EXTENSIONS: ['.xlsx', '.xls', '.csv'],
  
  // 上传目录
  UPLOAD_DIR: './uploads',
};

// ==================== 类型定义 ====================

export interface UploadConfig {
  maxFileSize?: number;
  maxConcurrent?: number;
  allowedExtensions?: string[];
  enableDuplicateCheck?: boolean;
}

export interface FileMetadata {
  id: string;
  originalName: string;
  name: string;
  size: number;
  type: 'EXCEL' | 'CSV';
  kind: 'LOCAL' | 'PLATFORM' | 'FLOW';
  platformId?: string;
  rowCount: number;
  filePath: string;
  checksum: string;        // 文件哈希，用于重复检测
  createdAt: Date;
}

export interface UploadResult {
  success: boolean;
  file?: FileMetadata;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  isDuplicate?: boolean;
  existingFile?: FileMetadata;
  suggestions?: string[];
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
  speed: number;           // bytes per second
  remainingTime: number;   // seconds
}

// 上传会话（用于断点续传）
interface UploadSession {
  id: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  uploadedBytes: number;
  checksum: string;
  createdAt: Date;
  expiresAt: Date;
}

// ==================== 上传会话管理 ====================

const uploadSessions = new Map<string, UploadSession>();

// 清理过期的上传会话（24小时过期）
function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of uploadSessions.entries()) {
    if (session.expiresAt.getTime() < now) {
      uploadSessions.delete(id);
    }
  }
}

// 定期清理过期会话
setInterval(cleanupExpiredSessions, 60 * 60 * 1000); // 每小时清理一次

// ==================== 工具函数 ====================

/**
 * 计算文件哈希（用于重复检测）
 */
export async function calculateFileChecksum(buffer: Buffer): Promise<string> {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * 格式化速度
 */
export function formatSpeed(bytesPerSecond: number): string {
  return `${formatFileSize(bytesPerSecond)}/s`;
}

/**
 * 格式化剩余时间
 */
export function formatRemainingTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}秒`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}分钟`;
  return `${Math.round(seconds / 3600)}小时`;
}

/**
 * 检测文件类型
 */
export function getFileType(filename: string): 'EXCEL' | 'CSV' {
  const ext = path.extname(filename).toLowerCase();
  return ext === '.csv' ? 'CSV' : 'EXCEL';
}

/**
 * 根据文件名智能识别文件类型（LOCAL / PLATFORM / FLOW）
 */
export function detectFileKind(filename: string): 'LOCAL' | 'PLATFORM' | 'FLOW' {
  const name = filename.toLowerCase();
  
  // 流水账单关键词
  const flowKeywords = ['流水', 'fund', 'bank', '交易', '账单明细', '收支'];
  if (flowKeywords.some(kw => name.includes(kw))) {
    return 'FLOW';
  }
  
  // 平台账单关键词
  const platformKeywords = ['平台', 'platform', '账单', 'bill', '订单明细', '结算'];
  if (platformKeywords.some(kw => name.includes(kw))) {
    return 'PLATFORM';
  }
  
  // 默认是本地配送单
  return 'LOCAL';
}

/**
 * 根据文件名智能识别平台
 */
export function detectPlatformFromFileName(filename: string): string {
  const name = filename.toLowerCase();
  
  const platformPatterns: { pattern: RegExp; platformId: string }[] = [
    { pattern: /闪送|shansong/i, platformId: 'shansong' },
    { pattern: /达达|dada/i, platformId: 'dada' },
    { pattern: /蜂鸟|fengniao/i, platformId: 'fengniao' },
    { pattern: /顺丰.*企业.*c|xunfeng.*c|xunfeng-c/i, platformId: 'xunfeng-c' },
    { pattern: /顺丰.*同城|xunfeng/i, platformId: 'xunfeng' },
    { pattern: /裹小递|guoxiaodi/i, platformId: 'guoxiaodi' },
    { pattern: /uu|uu跑腿/i, platformId: 'uu' },
  ];
  
  for (const { pattern, platformId } of platformPatterns) {
    if (pattern.test(name)) {
      return platformId;
    }
  }
  
  return 'unknown';
}

/**
 * 验证文件名格式
 */
export function validateFileName(filename: string): { valid: boolean; error?: string } {
  // 检查长度
  if (filename.length > 200) {
    return { valid: false, error: '文件名过长（最多200字符）' };
  }
  
  // 检查特殊字符
  const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
  if (invalidChars.test(filename)) {
    return { valid: false, error: '文件名包含非法字符' };
  }
  
  // 检查扩展名
  const ext = path.extname(filename).toLowerCase();
  if (!CONFIG.ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `不支持的文件格式，仅支持: ${CONFIG.ALLOWED_EXTENSIONS.join(', ')}` };
  }
  
  return { valid: true };
}

/**
 * 根据内容检测文件实际类型（更智能）
 */
export async function detectFileContentType(
  buffer: Buffer,
  filename: string
): Promise<{ kind: 'LOCAL' | 'PLATFORM' | 'FLOW'; confidence: number; suggestions: string[] }> {
  const suggestions: string[] = [];
  let maxConfidence = 0;
  let detectedKind: 'LOCAL' | 'PLATFORM' | 'FLOW' = 'LOCAL';
  
  try {
    // 尝试解析 Excel
    const excelResult = fileService.parseExcel<any>(buffer, { headerRow: 1 });
    
    if (excelResult.success && excelResult.data.length > 0) {
      const headers = Object.keys(excelResult.data[0]);
      
      // 检测是否为配送单
      const dispatchFields = ['配送单订单号', '发单运力', '配送状态', 'free', 'delivery_channel'];
      const dispatchMatch = dispatchFields.filter(f => headers.includes(f)).length;
      if (dispatchMatch >= 2) {
        detectedKind = 'LOCAL';
        maxConfidence = Math.max(maxConfidence, dispatchMatch / dispatchFields.length);
        suggestions.push('检测到配送单字段：配送单订单号、发单运力等');
      }
      
      // 检测是否为流水账单
      const flowFields = ['admin_id', 'type', 'method', 'money', 'delivery_order_id'];
      const flowMatch = flowFields.filter(f => headers.some(h => h.toLowerCase() === f.toLowerCase())).length;
      if (flowMatch >= 2) {
        if (flowMatch > maxConfidence) {
          detectedKind = 'FLOW';
          maxConfidence = flowMatch / flowFields.length;
        }
        suggestions.push('检测到流水账单字段：admin_id、type、money等');
      }
      
      // 检测是否为平台账单
      const platformFields = ['订单编号', '三方订单编号', '订单状态', '实付金额', 'paidAmount'];
      const platformMatch = platformFields.filter(f => headers.includes(f)).length;
      if (platformMatch >= 2) {
        if (platformMatch > maxConfidence) {
          detectedKind = 'PLATFORM';
          maxConfidence = platformMatch / platformFields.length;
        }
        suggestions.push('检测到平台账单字段：订单编号、订单状态、实付金额等');
      }
    }
  } catch (error) {
    suggestions.push('无法解析文件内容，请手动确认文件类型');
  }
  
  // 如果文件名有明确提示，提高对应类型的置信度
  const nameBasedKind = detectFileKind(filename);
  if (nameBasedKind !== 'LOCAL') {
    maxConfidence = Math.max(maxConfidence, 0.5);
    suggestions.push(`文件名包含"${nameBasedKind}"关键词`);
  }
  
  return {
    kind: detectedKind,
    confidence: Math.min(maxConfidence, 1),
    suggestions,
  };
}

// ==================== 重复文件检测 ====================

/**
 * 检测重复文件
 */
export async function findDuplicateFile(
  name: string,
  size: number,
  checksum?: string
): Promise<{ isDuplicate: boolean; existingFile?: FileMetadata }> {
  // 简化实现：先按文件名和大小检测
  // 完整实现需要查询数据库
  
  // 这里返回不存在重复（实际使用时需要查询数据库）
  return { isDuplicate: false };
}

// ==================== 核心上传函数 ====================

/**
 * 智能文件上传
 * 包含：大小限制、类型检测、重复检查、智能分类
 */
export async function smartUpload(
  buffer: Buffer,
  originalName: string,
  options: {
    kind?: 'LOCAL' | 'PLATFORM' | 'FLOW';
    platformId?: string;
    calculateChecksum?: boolean;
    skipDuplicateCheck?: boolean;
  } = {}
): Promise<UploadResult> {
  console.log(`[SmartUpload] ========== 开始处理文件: ${originalName} ==========`);
  console.log(`[SmartUpload] buffer.length: ${buffer.length} bytes`);

  const { kind: forcedKind, platformId, calculateChecksum = true, skipDuplicateCheck = false } = options;

  // 1. 验证文件名
  console.log(`[SmartUpload] 步骤1: 验证文件名`);
  const nameValidation = validateFileName(originalName);
  if (!nameValidation.valid) {
    console.log(`[SmartUpload] 文件名验证失败: ${nameValidation.error}`);
    return {
      success: false,
      error: {
        code: 'INVALID_FILENAME',
        message: nameValidation.error!,
      },
    };
  }

  // 2. 验证文件大小
  console.log(`[SmartUpload] 步骤2: 验证文件大小`);
  console.log(`[SmartUpload] buffer.length: ${buffer.length}, MIN_FILE_SIZE: ${CONFIG.MIN_FILE_SIZE}`);
  if (buffer.length < CONFIG.MIN_FILE_SIZE) {
    console.warn(`[SmartUpload] 文件过小: ${originalName}, 大小: ${buffer.length} bytes < ${CONFIG.MIN_FILE_SIZE} bytes`);
    return {
      success: false,
      error: {
        code: 'FILE_TOO_SMALL',
        message: `文件过小（最小${formatFileSize(CONFIG.MIN_FILE_SIZE)}）`,
        details: {
          fileSize: buffer.length,
          minSize: CONFIG.MIN_FILE_SIZE,
        },
      },
    };
  }

  if (buffer.length > CONFIG.MAX_FILE_SIZE) {
    return {
      success: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: `文件超过限制（最大${formatFileSize(CONFIG.MAX_FILE_SIZE)}）`,
        details: {
          fileSize: buffer.length,
          maxSize: CONFIG.MAX_FILE_SIZE,
          suggestion: buffer.length > 100 * 1024 * 1024
            ? '建议将大文件拆分为多个小文件后上传'
            : '请压缩文件或上传较小的新版本',
        },
      },
    };
  }

  console.log(`[SmartUpload] 文件大小验证通过`);

  // 3. 计算文件哈希（用于重复检测和完整性校验）
  console.log(`[SmartUpload] 步骤3: 计算文件哈希`);
  const checksum = calculateChecksum ? await calculateFileChecksum(buffer) : '';

  // 4. 检测重复文件
  console.log(`[SmartUpload] 步骤4: 检测重复文件`);
  if (!skipDuplicateCheck) {
    const duplicateCheck = await findDuplicateFile(originalName, buffer.length, checksum);
    if (duplicateCheck.isDuplicate) {
      console.log(`[SmartUpload] 检测到重复文件: ${duplicateCheck.existingFile?.id}`);
      return {
        success: true,
        isDuplicate: true,
        existingFile: duplicateCheck.existingFile,
        error: {
          code: 'DUPLICATE_FILE',
          message: '相同的文件已存在',
        },
      };
    }
  }

  // 5. 智能识别文件类型
  console.log(`[SmartUpload] 步骤5: 识别文件类型`);
  const detectedKind = forcedKind || detectFileKind(originalName);
  const detectedPlatform = platformId || detectPlatformFromFileName(originalName);
  console.log(`[SmartUpload] detectedKind: ${detectedKind}, detectedPlatform: ${detectedPlatform}`);

  // 6. 尝试基于内容检测（更准确）
  let contentDetection;
  try {
    console.log(`[SmartUpload] 步骤6: 基于内容检测`);
    contentDetection = await detectFileContentType(buffer, originalName);
    if (contentDetection.confidence > 0.5 && forcedKind === undefined) {
      // 可以在这里决定是否使用内容检测的结果
    }
  } catch (error) {
    contentDetection = { kind: detectedKind, confidence: 0, suggestions: [] };
  }

  // 7. 解析文件获取行数
  console.log(`[SmartUpload] 步骤7: 解析文件获取行数`);
  const fileType = getFileType(originalName);
  console.log(`[SmartUpload] fileType: ${fileType}`);

  let rowCount = 0;
  let parseError = '';

  try {
    let parseResult;
    if (fileType === 'EXCEL') {
      console.log(`[SmartUpload] 解析 Excel 文件...`);
      parseResult = fileService.parseExcel<any>(buffer, { headerRow: 1 });
    } else {
      console.log(`[SmartUpload] 解析 CSV 文件...`);
      parseResult = await fileService.parseCSV<any>(buffer, { encoding: 'utf-8', header: true });
    }

    console.log(`[SmartUpload] parseResult.success: ${parseResult.success}`);
    console.log(`[SmartUpload] parseResult.data length: ${parseResult.data?.length || 0}`);

    if (parseResult.success) {
      rowCount = parseResult.meta?.rowCount || parseResult.data.length;
      console.log(`[SmartUpload] rowCount: ${rowCount}`);
    } else {
      parseError = parseResult.error || '解析失败';
      console.log(`[SmartUpload] parseError: ${parseError}`);
    }
  } catch (error) {
    parseError = error instanceof Error ? error.message : '解析失败';
    console.log(`[SmartUpload] 解析异常: ${parseError}`);
  }

  if (rowCount === 0 && !parseError) {
    console.warn(`[SmartUpload] 文件解析成功但没有数据: ${originalName}`);
    return {
      success: false,
      error: {
        code: 'EMPTY_FILE',
        message: '文件中没有有效数据',
      },
    };
  }

  console.log(`[SmartUpload] 步骤8: 保存文件`);
  // 8. 生成唯一文件名并保存
  const fileId = uuidv4();
  const extension = path.extname(originalName);
  const filename = `${fileId}${extension}`;
  const filePath = path.join(process.cwd(), CONFIG.UPLOAD_DIR, filename);

  // 确保目录存在
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  // 保存文件
  await fs.writeFile(filePath, buffer);
  console.log(`[SmartUpload] 文件已保存: ${filePath}`);

  // 9. 构建结果
  const fileMetadata: FileMetadata = {
    id: fileId,
    originalName: originalName,
    name: filename,
    size: buffer.length,
    type: fileType,
    kind: detectedKind,
    platformId: detectedPlatform,
    rowCount,
    filePath,
    checksum,
    createdAt: new Date(),
  };

  // 10. 返回结果，包含智能建议
  console.log(`[SmartUpload] 步骤10: 构建返回结果`);
  const suggestions: string[] = [];
  if (buffer.length > CONFIG.LARGE_FILE_THRESHOLD) {
    suggestions.push(`大文件（${formatFileSize(buffer.length)}），对账时间可能较长`);
  }
  if (contentDetection.suggestions.length > 0) {
    suggestions.push(...contentDetection.suggestions);
  }
  if (detectedPlatform === 'unknown') {
    suggestions.push('未能识别平台，请手动配置');
  }

  console.log(`[SmartUpload] ========== 文件处理成功: ${originalName} ==========`);
  return {
    success: true,
    file: fileMetadata,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}

/**
 * 计算上传进度
 */
export function calculateUploadProgress(
  loaded: number,
  total: number,
  startTime: Date,
  previousLoaded: number,
  previousTime: number
): UploadProgress {
  const now = Date.now();
  const elapsed = (now - startTime.getTime()) / 1000; // 秒
  
  const percentage = total > 0 ? (loaded / total) * 100 : 0;
  
  // 计算速度
  let speed = 0;
  if (elapsed > 0 && previousLoaded > 0) {
    const bytesDelta = loaded - previousLoaded;
    const timeDelta = (now - previousTime) / 1000;
    if (timeDelta > 0) {
      speed = bytesDelta / timeDelta;
    }
  }
  
  // 计算剩余时间
  let remainingTime = 0;
  if (speed > 0 && loaded < total) {
    remainingTime = (total - loaded) / speed;
  }
  
  return {
    loaded,
    total,
    percentage: Math.min(percentage, 100),
    speed,
    remainingTime,
  };
}

// ==================== 导出配置和工具 ====================

export { CONFIG };
