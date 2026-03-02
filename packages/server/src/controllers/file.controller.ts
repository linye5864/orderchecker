/**
 * 文件管理控制器
 * 集成智能上传功能：文件大小限制、并发控制、重复检测、智能分类
 */

import { Request, Response, NextFunction } from 'express';
import { smartUpload, formatFileSize, formatSpeed, formatRemainingTime, CONFIG } from '../services/smart-upload.service.js';
import { uploadFileRecord as uploadFileToDb, getFiles as queryFiles, getFileById as queryFileById, deleteFileRecord as deleteFileFromDb } from '../lib/sqlite.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';

// ==================== 上传并发控制 ====================

// 简单的信号量实现
class UploadSemaphore {
  private permits: number;
  private waitingQueue: Array<{ resolve: () => void }>;

  constructor(maxPermits: number) {
    this.permits = maxPermits;
    this.waitingQueue = [];
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.waitingQueue.push({ resolve });
    });
  }

  release(): void {
    this.permits++;
    if (this.waitingQueue.length > 0) {
      this.permits--;
      const next = this.waitingQueue.shift();
      if (next) next.resolve();
    }
  }
}

// 全局上传信号量（最多5个并发）
const uploadSemaphore = new UploadSemaphore(CONFIG.MAX_CONCURRENT_UPLOADS);

// ==================== 请求体类型 ====================

interface UploadRequest {
  kind?: 'LOCAL' | 'PLATFORM' | 'FLOW';
  platformId?: string;
}

// ==================== 错误代码映射 ====================

const ERROR_MESSAGES: Record<string, { title: string; message: string }> = {
  INVALID_FILENAME: {
    title: '文件名无效',
    message: '文件名包含非法字符或格式不正确',
  },
  FILE_TOO_SMALL: {
    title: '文件过小',
    message: `文件小于最小限制（${formatFileSize(CONFIG.MIN_FILE_SIZE)}）`,
  },
  FILE_TOO_LARGE: {
    title: '文件过大',
    message: `文件超过大小限制（${formatFileSize(CONFIG.MAX_FILE_SIZE)}）`,
  },
  EMPTY_FILE: {
    title: '文件为空',
    message: '文件中没有有效数据，请检查文件内容',
  },
  PARSE_ERROR: {
    title: '解析失败',
    message: '无法解析文件格式，请确保是有效的 Excel 或 CSV 文件',
  },
  DUPLICATE_FILE: {
    title: '文件已存在',
    message: '相同的文件已存在，无需重复上传',
  },
  UPLOAD_ERROR: {
    title: '上传失败',
    message: '文件上传过程中发生错误，请稍后重试',
  },
};

/**
 * 上传单个文件
 */
export async function uploadFile(req: Request, res: Response): Promise<void> {
  // 获取信号量（并发控制）
  await uploadSemaphore.acquire();
  
  try {
    const { kind, platformId } = req.body as UploadRequest;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'NO_FILES',
          title: '未选择文件',
          message: '请选择要上传的文件',
        },
      });
      return;
    }

    // 限制单次请求的文件数量
    if (files.length > 10) {
      res.status(400).json({
        success: false,
        error: {
          code: 'TOO_MANY_FILES',
          title: '文件数量过多',
          message: '单次最多上传10个文件',
        },
      });
      return;
    }

    const results = [];

    for (const file of files) {
      try {
        // 调试日志：记录文件信息
        console.log(`[Upload] 收到文件: ${file.originalname}, 大小: ${file.size} bytes, buffer.length: ${file.buffer.length}`);

        // 检查 buffer 是否为空或过小
        if (!file.buffer || file.buffer.length === 0) {
          console.error(`[Upload] 文件 buffer 为空: ${file.originalname}`);
          results.push({
            id: null,
            name: file.originalname,
            success: false,
            error: {
              code: 'EMPTY_BUFFER',
              title: '文件内容为空',
              message: '文件上传失败，文件内容为空，请重试',
            },
          });
          continue;
        }

        // 额外检查：如果 file.size 为 0 但 buffer 有内容，可能是 multer 的问题
        if (file.size === 0 && file.buffer.length > 0) {
          console.warn(`[Upload] file.size 为 0 但 buffer.length 为 ${file.buffer.length} bytes，使用 buffer.length`);
          file.size = file.buffer.length;
        }

        // 使用智能上传服务
        const result = await smartUpload(file.buffer, file.originalname, {
          kind: kind as 'LOCAL' | 'PLATFORM' | 'FLOW' | undefined,
          platformId,
          calculateChecksum: true,
        });

        console.log(`[Upload] smartUpload 结果: success=${result.success}, isDuplicate=${result.isDuplicate}`);
        if (result.error) {
          console.log(`[Upload] smartUpload 错误: code=${result.error.code}, message=${result.error.message}`);
        }
        if (result.file) {
          console.log(`[Upload] smartUpload 文件: id=${result.file.id}, name=${result.file.name}, rowCount=${result.file.rowCount}`);
        }

        if (!result.success) {
          // 上传失败，返回友好的错误信息
          const errorInfo = ERROR_MESSAGES[result.error?.code || 'UPLOAD_ERROR'];
          console.log(`[Upload] 上传失败，准备返回错误: ${result.error?.message}`);
          results.push({
            id: null,
            name: file.originalname,
            success: false,
            error: {
              code: result.error?.code || 'UPLOAD_ERROR',
              title: errorInfo.title,
              message: result.error?.message || errorInfo.message,
              details: result.error?.details,
            },
            suggestions: result.suggestions,
          });
          continue;
        }

        // 保存到数据库
        const uploadedFile = await uploadFileToDb({
          id: result.file!.id,
          name: result.file!.name,
          originalName: result.file!.originalName,
          type: result.file!.type,
          size: result.file!.size,
          filePath: result.file!.filePath,
          kind: result.file!.kind,
          platformId: result.file!.platformId,
          rowCount: result.file!.rowCount,
        });

        console.log(`[Upload] 文件已保存到数据库: id=${uploadedFile.id}, rowCount=${uploadedFile.rowCount}`);
        results.push({
          id: uploadedFile.id,
          name: uploadedFile.originalName,
          success: true,
          kind: uploadedFile.kind,
          platformId: uploadedFile.platformId,
          rowCount: uploadedFile.rowCount,
          size: uploadedFile.size,
          suggestions: result.suggestions,
        });
      } catch (error) {
        console.error('File upload error:', error);
        results.push({
          id: null,
          name: file.originalname,
          success: false,
          error: {
            code: 'UPLOAD_ERROR',
            title: ERROR_MESSAGES.UPLOAD_ERROR.title,
            message: error instanceof Error ? error.message : ERROR_MESSAGES.UPLOAD_ERROR.message,
          },
        });
      }
    }

    // 统计结果
    const successCount = results.filter((r: any) => r.success).length;
    const failCount = results.length - successCount;

    console.log(`[Upload] ========== 准备返回响应 ==========`);
    console.log(`[Upload] results.length: ${results.length}, successCount: ${successCount}, failCount: ${failCount}`);
    console.log(`[Upload] response.data[0]:`, JSON.stringify(results[0], null, 2));

    res.json({
      success: true,
      data: results,
      summary: {
        total: results.length,
        success: successCount,
        failed: failCount,
      },
      message: failCount > 0
        ? `上传完成：${successCount}个成功，${failCount}个失败`
        : `成功上传 ${successCount} 个文件`,
    });

    console.log(`[Upload] ========== 响应已发送 ==========`);
  } finally {
    // 释放信号量
    uploadSemaphore.release();
  }
}

/**
 * 批量上传文件（前端分片上传使用）
 */
export async function uploadBatch(req: Request, res: Response): Promise<void> {
  await uploadSemaphore.acquire();
  
  try {
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'NO_FILES',
          message: '未选择文件',
        },
      });
      return;
    }

    // 并行处理所有文件（信号量会自动控制并发）
    const results = await Promise.all(
      files.map(async (file) => {
        const result = await smartUpload(file.buffer, file.originalname);
        
        if (!result.success) {
          return {
            name: file.originalname,
            success: false,
            error: result.error,
          };
        }

        // 保存到数据库
        const uploadedFile = await uploadFileToDb({
          id: result.file!.id,
          name: result.file!.name,
          originalName: result.file!.originalName,
          type: result.file!.type,
          size: result.file!.size,
          filePath: result.file!.filePath,
          kind: result.file!.kind,
          platformId: result.file!.platformId,
          rowCount: result.file!.rowCount,
        });

        return {
          id: uploadedFile.id,
          name: uploadedFile.originalName,
          success: true,
          kind: uploadedFile.kind,
          rowCount: uploadedFile.rowCount,
        };
      })
    );

    res.json({
      success: true,
      data: results,
    });
  } finally {
    uploadSemaphore.release();
  }
}

/**
 * 获取上传状态（并发情况、限制等）
 */
export async function getUploadStatus(_req: Request, res: Response): Promise<void> {
  res.json({
    success: true,
    data: {
      maxFileSize: CONFIG.MAX_FILE_SIZE,
      maxConcurrent: CONFIG.MAX_CONCURRENT_UPLOADS,
      allowedExtensions: CONFIG.ALLOWED_EXTENSIONS,
      largeFileThreshold: CONFIG.LARGE_FILE_THRESHOLD,
    },
  });
}

/**
 * 获取文件列表
 */
export async function getFiles(req: Request, res: Response): Promise<void> {
  try {
    const kind = req.query.kind as string | undefined;
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 50;
    const search = req.query.search as string | undefined;

    let files = await queryFiles(kind);
    
    // 搜索过滤
    if (search) {
      const searchLower = search.toLowerCase();
      files = files.filter((f: any) => 
        f.originalName?.toLowerCase().includes(searchLower) ||
        f.name?.toLowerCase().includes(searchLower)
      );
    }
    
    const total = files.length;
    const paginatedFiles = files.slice((page - 1) * pageSize, page * pageSize);

    res.json({
      success: true,
      data: paginatedFiles,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_FILES_ERROR',
        message: error instanceof Error ? error.message : '获取文件列表失败',
      },
    });
  }
}

/**
 * 获取单个文件详情
 */
export async function getFileById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const file = await queryFileById(id);

    if (!file) {
      res.status(404).json({
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: '文件不存在',
        },
      });
      return;
    }

    // 返回文件详情，包含友好的格式化信息
    res.json({
      success: true,
      data: {
        ...file,
        sizeFormatted: formatFileSize(file.size),
        createdAtFormatted: new Date(file.createdAt).toLocaleString('zh-CN'),
      },
    });
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_FILE_ERROR',
        message: error instanceof Error ? error.message : '获取文件失败',
      },
    });
  }
}

/**
 * 删除文件
 */
export async function deleteFile(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const file = await queryFileById(id);

    if (!file) {
      res.status(404).json({
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: '文件不存在',
        },
      });
      return;
    }

    // 删除数据库记录
    await deleteFileFromDb(id);

    // 删除物理文件
    try {
      await fs.unlink(file.filePath);
    } catch (unlinkError) {
      console.warn('Failed to delete physical file:', unlinkError);
      // 即使物理文件删除失败，也认为操作成功（可能是文件已被删除）
    }

    res.json({
      success: true,
      message: '文件已删除',
      data: {
        deletedFile: file.originalName,
      },
    });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_FILE_ERROR',
        message: error instanceof Error ? error.message : '删除文件失败',
      },
    });
  }
}

/**
 * 批量删除文件
 */
export async function deleteFiles(req: Request, res: Response): Promise<void> {
  try {
    const { ids } = req.body as { ids: string[] };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: '请提供要删除的文件ID列表',
        },
      });
      return;
    }

    const results = [];

    for (const id of ids) {
      try {
        const file = await queryFileById(id);
        
        if (!file) {
          results.push({ id, success: false, error: '文件不存在' });
          continue;
        }

        await deleteFileFromDb(id);

        try {
          await fs.unlink(file.filePath);
        } catch {
          // 忽略物理文件删除错误
        }

        results.push({ id, success: true, name: file.originalName });
      } catch (error) {
        results.push({ 
          id, 
          success: false, 
          error: error instanceof Error ? error.message : '删除失败' 
        });
      }
    }

    const successCount = results.filter((r: any) => r.success).length;

    res.json({
      success: true,
      data: results,
      message: `成功删除 ${successCount}/${ids.length} 个文件`,
    });
  } catch (error) {
    console.error('Delete files error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'BATCH_DELETE_ERROR',
        message: error instanceof Error ? error.message : '批量删除失败',
      },
    });
  }
}

/**
 * 验证文件（不实际上传，仅检查文件是否有效）
 */
export async function validateFile(req: Request, res: Response): Promise<void> {
  try {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'NO_FILES',
          message: '请选择文件',
        },
      });
      return;
    }

    const results = [];

    for (const file of files) {
      const result = await smartUpload(file.buffer, file.originalname, {
        calculateChecksum: false, // 验证时不需要计算哈希
      });

      results.push({
        name: file.originalname,
        size: file.size,
        sizeFormatted: formatFileSize(file.size),
        valid: result.success,
        kind: result.file?.kind,
        platformId: result.file?.platformId,
        rowCount: result.file?.rowCount,
        error: result.success ? null : result.error,
        suggestions: result.suggestions,
      });
    }

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('Validate file error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'VALIDATE_ERROR',
        message: error instanceof Error ? error.message : '验证失败',
      },
    });
  }
}
