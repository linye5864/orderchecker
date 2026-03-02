/**
 * 智能文件上传页面
 * 特性：
 * - 文件大小限制和验证
 * - 重复文件检测
 * - 历史文件复用
 * - 智能文件识别
 * - 勾选冲突校验
 */

import * as React from "react";
import { useNavigate } from "react-router-dom";
import { fileApi, UploadedFile } from "../lib/api";

// ==================== 配置 ====================

const UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_FILES_PER_BATCH: 10,
  RETRY_MAX_ATTEMPTS: 3,
  RETRY_INITIAL_DELAY: 1000, 
  LARGE_FILE_THRESHOLD: 10 * 1024 * 1024, 
};

// ==================== 类型定义 ====================

type FileKind = "dispatch" | "platform" | "fund";

interface FilePoolItem {
  id: string;
  file?: File;
  name: string;
  kind: FileKind;
  size: number;
  sizeFormatted: string;
  createdAt: string;
  status: "pending" | "uploading" | "processing" | "completed" | "error" | "duplicate";
  progress: number;
  speed?: number;
  remainingTime?: number;
  error?: string;
  errorCode?: string;
  retryCount: number;
  suggestions?: string[];
  uploadedFile?: UploadedFile;
  selected?: boolean;
}

interface FileValidationResult {
  valid: boolean;
  name: string;
  size: number;
  sizeFormatted: string;
  kind?: string;
  platformId?: string;
  rowCount?: number;
  error?: {
    code: string;
    title: string;
    message: string;
    details?: any;
  };
  suggestions?: string[];
}

// ==================== 工具函数 ====================

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function formatSpeed(bytesPerSecond: number): string {
  return formatBytes(bytesPerSecond) + "/s";
}

function formatRemainingTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}秒`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}分钟`;
  return `${Math.round(seconds / 3600)}小时`;
}

function kindLabel(kind: FileKind): string {
  if (kind === "dispatch") return "配送单";
  if (kind === "platform") return "平台账单";
  return "流水账单";
}

function kindBadgeStyle(kind: FileKind): { backgroundColor: string; color: string } {
  if (kind === "dispatch") return { backgroundColor: "#dbeafe", color: "#1d4ed8" };
  if (kind === "fund") return { backgroundColor: "#fef3c7", color: "#b45309" };
  return { backgroundColor: "#dcfce7", color: "#15803d" };
}

function statusBadgeStyle(status: string): { backgroundColor: string; color: string } {
  switch (status) {
    case "completed":
      return { backgroundColor: "#dcfce7", color: "#16a34a" };
    case "uploading":
    case "processing":
      return { backgroundColor: "#dbeafe", color: "#2563eb" };
    case "error":
      return { backgroundColor: "#fee2e2", color: "#dc2626" };
    case "duplicate":
      return { backgroundColor: "#fef3c7", color: "#b45309" };
    default:
      return { backgroundColor: "#f3f4f6", color: "#6b7280" };
  }
}

// ==================== 数据映射函数 ====================

function mapRemoteKind(remoteType: string, filename: string): FileKind {
  const name = (filename || "").toLowerCase();
  
  // 优先级 1: 文件名强特征识别 (用户通常会命名文件)
  if (name.includes('配送') || name.includes('运力') || name.includes('dispatch') || name.includes('delivery')) return 'dispatch';
  if (name.includes('流水') || name.includes('明细') || name.includes('flow') || name.includes('fund') || name.includes('bank')) return 'fund';
  if (name.includes('平台') || name.includes('账单') || name.includes('platform') || name.includes('bill')) return 'platform';
  
  // 优先级 2: 后端返回的类型标识
  const type = String(remoteType || "").toLowerCase();
  if (type === 'delivery' || type === 'dispatch' || type === 'local') return 'dispatch';
  if (type === 'flow' || type === 'fund') return 'fund';
  if (type === 'platform') return 'platform';
  
  // 默认兜底
  return 'dispatch';
}

// ==================== 主组件 ====================

export default function UploadPage() {
  const navigate = useNavigate();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [files, setFiles] = React.useState<FilePoolItem[]>([]);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<'table' | 'grid'>('grid');
  const [uploadStats, setUploadStats] = React.useState({
    total: 0,
    completed: 0,
    failed: 0,
    totalSize: 0,
    uploadedSize: 0,
  });

  // 计算文件统计与就绪状态
  React.useEffect(() => {
    const completed = files.filter(f => f.status === "completed").length;
    const failed = files.filter(f => f.status === "error" || f.status === "duplicate").length;
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const uploadedSize = files
      .filter(f => f.status === "completed")
      .reduce((sum, f) => sum + f.size, 0);

    setUploadStats({
      total: files.length,
      completed,
      failed,
      totalSize,
      uploadedSize,
    });
  }, [files]);

  // 检测勾选状态
  const selectedFiles = files.filter(f => f.selected && f.status === "completed");
  const selectedDispatch = selectedFiles.filter(f => f.kind === "dispatch");
  const selectedFund = selectedFiles.filter(f => f.kind === "fund");
  const selectedPlatform = selectedFiles.filter(f => f.kind === "platform");

  const selectionError = React.useMemo(() => {
    if (selectedDispatch.length > 1) return "只能选择一个配送单文件";
    if (selectedFund.length > 1) return "只能选择一个流水账单文件";
    if (selectedPlatform.length > 1) return "暂不支持同时选择多个平台账单";
    return "";
  }, [selectedDispatch, selectedFund, selectedPlatform]);

  const canProceed = selectedDispatch.length === 1 && selectedFund.length === 1 && !selectionError;

  // 加载历史文件
  React.useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fileApi.getList({ pageSize: 50 });
        const historyFiles = (response as any).data || response;
        
        if (Array.isArray(historyFiles)) {
          const mappedFiles: FilePoolItem[] = historyFiles.map(f => {
            const fileName = f.filename || f.originalName || f.original_filename || f.name;
            const mappedKind = mapRemoteKind(f.file_type || f.type, fileName);
            return {
              id: f.id,
              name: fileName,
              kind: mappedKind,
              size: f.file_size || 0,
              sizeFormatted: f.size || (f.file_size ? formatBytes(f.file_size) : "Unknown"),
              createdAt: f.created_at || f.createdAt ? new Date(f.created_at || f.createdAt).toLocaleString("zh-CN") : "未知时间",
              status: "completed",
              progress: 100,
              retryCount: 0,
              selected: false,
              uploadedFile: {
                ...f,
                name: fileName,
                originalName: fileName,
                kind: mappedKind as any,
              }
            };
          });
          
          setFiles(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newHistory = mappedFiles.filter(m => !existingIds.has(m.id));
            return [...prev, ...newHistory];
          });
        }
      } catch (error) {
        console.error("加载历史文件失败:", error);
      }
    };
    
    fetchHistory();
  }, []);

  // ==================== 文件验证与处理 ====================

  const validateFile = async (file: File): Promise<FileValidationResult> => {
    const result: FileValidationResult = {
      valid: true,
      name: file.name,
      size: file.size,
      sizeFormatted: formatBytes(file.size),
    };

    if (file.size === 0) {
      result.valid = false;
      result.error = { code: "FILE_EMPTY", title: "文件为空", message: "文件内容为空" };
      return result;
    }

    if (file.size > UPLOAD_CONFIG.MAX_FILE_SIZE) {
      result.valid = false;
      result.error = { code: "FILE_TOO_LARGE", title: "文件过大", message: `超过限制（${formatBytes(UPLOAD_CONFIG.MAX_FILE_SIZE)}）` };
    }

    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!['.xlsx', '.xls', '.csv'].includes(ext)) {
      result.valid = false;
      result.error = { code: "INVALID_EXTENSION", title: "格式错误", message: "仅支持 Excel 和 CSV" };
    }

    return result;
  };

  const detectFileKind = (fileName: string): FileKind => {
    const name = fileName.toLowerCase();
    if (name.includes('流水') || name.includes('fund') || name.includes('bank')) return 'fund';
    if (name.includes('平台') || name.includes('账单') || name.includes('platform') || name.includes('bill')) return 'platform';
    return 'dispatch';
  };

  const addFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const newFiles: FilePoolItem[] = [];

    for (const file of Array.from(fileList)) {
      const validation = await validateFile(file);
      
      const newFile: FilePoolItem = {
        id: `file-${Date.now()}-${Math.random()}`,
        file,
        name: file.name,
        kind: detectFileKind(file.name),
        size: file.size,
        sizeFormatted: validation.sizeFormatted,
        createdAt: new Date().toLocaleString("zh-CN"),
        status: validation.valid ? "pending" : "error",
        progress: 0,
        retryCount: 0,
        error: validation.error?.message,
      };

      newFiles.push(newFile);
    }

    setFiles(prev => [...newFiles, ...prev]);
    const pendingFiles = newFiles.filter(f => f.status === "pending");
    if (pendingFiles.length > 0) {
      uploadFiles(pendingFiles);
    }
  };

  // ==================== 上传逻辑 ====================

  const uploadFiles = async (filesToUpload: FilePoolItem[]) => {
    for (const item of filesToUpload) {
      if (item.status !== "pending") continue;
      await uploadWithRetry(item);
    }
  };

  const updateFileStatus = (id: string, updates: Partial<FilePoolItem>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const uploadWithRetry = async (item: FilePoolItem, attempt: number = 1): Promise<void> => {
    updateFileStatus(item.id, { status: "uploading", retryCount: attempt, progress: 0 });
    const startTime = Date.now();
    let lastLoaded = 0;
    let lastTime = startTime;

    try {
      if (!item.file) throw new Error("本地文件丢失");
      
      const uploadedFile = await fileApi.uploadWithProgress(
        item.file,
        item.kind,
        (progressEvent) => {
          const { loaded, total } = progressEvent;
          const now = Date.now();
          const elapsed = (now - startTime) / 1000;

          let speed = 0;
          let remainingTime = 0;
          if (elapsed > 1 && lastLoaded > 0) {
            const bytesDelta = loaded - lastLoaded;
            const timeDelta = (now - lastTime) / 1000;
            if (timeDelta > 0) {
              speed = bytesDelta / timeDelta;
              if (speed > 0 && loaded < total) remainingTime = (total - loaded) / speed;
            }
          }
          lastLoaded = loaded;
          lastTime = now;

          const progress = total > 0 ? (loaded / total) * 100 : 0;
          updateFileStatus(item.id, { progress, speed, remainingTime });
        }
      );

      updateFileStatus(item.id, {
        status: "completed",
        progress: 100,
        uploadedFile,
        selected: true,
        error: undefined,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "上传失败";
      if (attempt < UPLOAD_CONFIG.RETRY_MAX_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await uploadWithRetry(item, attempt + 1);
      } else {
        updateFileStatus(item.id, { status: "error", error: errorMessage });
      }
    }
  };

  // ==================== 操作 ====================

  const onRemove = async (id: string) => {
    const file = files.find(f => f.id === id);
    if (file?.uploadedFile?.id) {
      try { await fileApi.delete(file.uploadedFile.id); } catch (e) {}
    }
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const onClearAll = async () => {
    if (!window.confirm("确定要清空列表并物理删除所有历史记录吗？")) return;
    
    // 找出所有已上传的文件 ID
    const idsToDelete = files
      .filter(f => f.uploadedFile?.id)
      .map(f => f.uploadedFile!.id);

    if (idsToDelete.length > 0) {
      try {
        await fileApi.deleteMany(idsToDelete);
      } catch (e) {
        console.error("批量删除失败:", e);
        // 如果批量删除报错，尝试循环删除
        for (const id of idsToDelete) {
          try { await fileApi.delete(id); } catch(err) {}
        }
      }
    }
    setFiles([]);
  };

  const onToggleSelect = (id: string) => {
    const file = files.find(f => f.id === id);
    if (file && file.status === "completed") {
      updateFileStatus(id, { selected: !file.selected });
    }
  };

  const onEnterReconciliation = () => {
    const validFiles = selectedFiles.map(f => ({
      id: f.uploadedFile!.id,
      name: f.uploadedFile!.originalName || f.uploadedFile!.name,
      path: (f.uploadedFile as any).path,
      kind: f.kind,
      size: f.uploadedFile!.size,
      sizeBytes: f.uploadedFile!.size,
    }));
    navigate("/reconciliation", { state: { files: validFiles } });
  };

  // ==================== 子组件 ====================

  const ProgressBar = ({ progress, speed, remainingTime, status }: any) => {
    const isUploading = status === "uploading";
    return (
      <div style={{ marginTop: "8px" }}>
        <div style={{ width: "100%", height: "4px", backgroundColor: "#e5e7eb", borderRadius: "2px", overflow: "hidden" }}>
          <div style={{ 
            width: `${Math.min(progress, 100)}%`, 
            height: "100%", 
            backgroundColor: status === "error" ? "#ef4444" : "#2563eb",
            transition: "width 0.2s ease"
          }} />
        </div>
        {isUploading && (
          <div style={{ display: "flex", gap: "10px", marginTop: "4px", fontSize: "11px", color: "#6b7280" }}>
            {speed > 0 && <span>{formatSpeed(speed)}</span>}
            {remainingTime > 0 && <span>约 {formatRemainingTime(remainingTime)}</span>}
          </div>
        )}
      </div>
    );
  };

  const smallButtonStyle = {
    padding: "4px 8px",
    fontSize: "12px",
    border: "1px solid #d1d5db",
    borderRadius: "4px",
    backgroundColor: "white",
    cursor: "pointer",
  };

  // ==================== 渲染 ====================

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto", color: "#374151" }}>
      <header style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 600, margin: 0 }}>数据导入仓库</h1>
        <p style={{ fontSize: "14px", color: "#6b7280" }}>复用历史文件或上传新文件进行对账任务</p>
      </header>

      {/* 上传区 */}
      <div 
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragOver(false); addFiles(e.dataTransfer.files); }}
        style={{
          border: `2px dashed ${isDragOver ? "#2563eb" : "#d1d5db"}`,
          borderRadius: "12px", padding: "40px", textAlign: "center",
          backgroundColor: isDragOver ? "#eff6ff" : "#f9fafb", transition: "all 0.2s"
        }}
      >
        <span style={{ fontSize: "40px", display: "block", marginBottom: "12px" }}>📤</span>
        <button onClick={() => fileInputRef.current?.click()} style={{
          padding: "10px 24px", backgroundColor: "white", border: "1px solid #d1d5db",
          borderRadius: "8px", fontWeight: 500, cursor: "pointer"
        }}>
          选择本地文件
        </button>
        <input ref={fileInputRef} type="file" multiple onChange={(e) => addFiles(e.target.files)} style={{ display: "none" }} />
      </div>

      {/* 列表控制 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "32px", marginBottom: "16px" }}>
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>文件管理台</h2>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", marginTop: "4px" }}>
            <span style={{ fontSize: "13px", color: "#6b7280" }}>请勾选 1个配送单 + 1个流水账单</span>
            <div style={{ display: "flex", backgroundColor: "#f3f4f6", padding: "3px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
              <button onClick={() => setViewMode('table')} style={{ padding: "4px 10px", fontSize: "12px", border: "none", borderRadius: "6px", backgroundColor: viewMode === 'table' ? "white" : "transparent", boxShadow: viewMode === 'table' ? "0 1px 2px rgba(0,0,0,0.1)" : "none", cursor: "pointer" }}>列表</button>
              <button onClick={() => setViewMode('grid')} style={{ padding: "4px 10px", fontSize: "12px", border: "none", borderRadius: "6px", backgroundColor: viewMode === 'grid' ? "white" : "transparent", boxShadow: viewMode === 'grid' ? "0 1px 2px rgba(0,0,0,0.1)" : "none", cursor: "pointer" }}>卡片</button>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          {selectionError && <div style={{ color: "#ef4444", fontSize: "12px", marginBottom: "8px" }}>⚠️ {selectionError}</div>}
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={onClearAll} style={smallButtonStyle}>清空所有历史</button>
            <button 
              disabled={!canProceed} 
              onClick={onEnterReconciliation}
              style={{
                padding: "10px 24px", border: "none", borderRadius: "8px",
                backgroundColor: canProceed ? "#2563eb" : "#94a3b8",
                color: "white", fontWeight: 600, cursor: canProceed ? "pointer" : "not-allowed",
                boxShadow: canProceed ? "0 4px 12px rgba(37, 99, 235, 0.2)" : "none"
              }}
            >
              启动智能对账 →
            </button>
          </div>
        </div>
      </div>

      {/* 视图内容 */}
      {viewMode === 'grid' ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
          {files.length === 0 ? (
             <div style={{ gridColumn: "1/-1", padding: "60px", textAlign: "center", color: "#9ca3af", backgroundColor: "#f9fafb", borderRadius: "12px", border: "2px dashed #e5e7eb" }}>暂无文件</div>
          ) : files.map(f => (
            <div 
              key={f.id} 
              onClick={() => onToggleSelect(f.id)}
              style={{
                padding: "16px", borderRadius: "12px", border: `2px solid ${f.selected ? "#2563eb" : "#e5e7eb"}`,
                backgroundColor: f.selected ? "#eff6ff" : "white", cursor: "pointer",
                transition: "all 0.2s", position: "relative"
              }}
            >
              <div style={{ position: "absolute", top: "12px", right: "12px" }}>
                <input type="checkbox" checked={!!f.selected} readOnly style={{ cursor: "pointer", width: "16px", height: "16px" }} />
              </div>
              <div style={{ marginBottom: "12px" }}>
                <span style={{ padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, ...kindBadgeStyle(f.kind) }}>{kindLabel(f.kind)}</span>
              </div>
              <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.name}>{f.name}</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#6b7280" }}>
                <span>{f.sizeFormatted}</span>
                <span>{f.createdAt.split(' ')[0]}</span>
              </div>
              {f.status !== "completed" && <ProgressBar progress={f.progress} status={f.status} />}
              <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end" }}>
                 <button onClick={(e) => { e.stopPropagation(); onRemove(f.id); }} style={{ color: "#ef4444", fontSize: "12px", background: "none", border: "none", cursor: "pointer" }}>删除</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* 表格模式保留但优化 */
        <div style={{ backgroundColor: "white", border: "1px solid #e5e7eb", borderRadius: "8px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: "10px 12px", width: "40px", textAlign: "center" }}>选</th>
                <th style={{ padding: "10px 12px" }}>文件名</th>
                <th style={{ padding: "10px 12px", width: "80px" }}>类型</th>
                <th style={{ padding: "10px 12px", width: "80px" }}>大小</th>
                <th style={{ padding: "10px 12px", width: "150px" }}>时间</th>
                <th style={{ padding: "10px 12px", width: "80px", textAlign: "center" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {files.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: "60px", textAlign: "center", color: "#9ca3af" }}>暂无文件</td></tr>
              ) : files.map(f => (
                <tr key={f.id} onClick={() => onToggleSelect(f.id)} style={{ borderBottom: "1px solid #f3f4f6", backgroundColor: f.selected ? "#f0f9ff" : "white", cursor: "pointer" }}>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}><input type="checkbox" checked={!!f.selected} readOnly style={{ width: "16px", height: "16px" }} /></td>
                  <td style={{ padding: "8px 12px" }}><div style={{ maxWidth: "400px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div></td>
                  <td style={{ padding: "8px 12px" }}><span style={{ padding: "1px 6px", borderRadius: "10px", fontSize: "11px", ...kindBadgeStyle(f.kind) }}>{kindLabel(f.kind)}</span></td>
                  <td style={{ padding: "8px 12px", color: "#6b7280" }}>{f.sizeFormatted}</td>
                  <td style={{ padding: "8px 12px", color: "#6b7280" }}>{f.createdAt}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                    <button onClick={(e) => { e.stopPropagation(); onRemove(f.id); }} style={{ color: "#ef4444", background: "none", border: "none", cursor: "pointer" }}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 底部悬浮已选摘要 */}
      {selectedFiles.length > 0 && (
        <div style={{
          position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
          backgroundColor: "#1e293b", color: "white", padding: "12px 24px",
          borderRadius: "16px", display: "flex", alignItems: "center", gap: "20px",
          boxShadow: "0 10px 25px rgba(0,0,0,0.3)", zIndex: 100
        }}>
          <div style={{ display: "flex", gap: "10px" }}>
            {selectedDispatch.length > 0 && <span style={{ backgroundColor: "#3b82f6", padding: "2px 8px", borderRadius: "6px", fontSize: "12px" }}>✅ 配送单已就绪</span>}
            {selectedFund.length > 0 && <span style={{ backgroundColor: "#f59e0b", padding: "2px 8px", borderRadius: "6px", fontSize: "12px" }}>✅ 流水账单已就绪</span>}
          </div>
          <div style={{ height: "20px", width: "1px", backgroundColor: "#475569" }} />
          <div style={{ fontSize: "14px" }}>已选 {selectedFiles.length} 个文件</div>
          <button 
            disabled={!canProceed} 
            onClick={onEnterReconciliation}
            style={{ 
              backgroundColor: canProceed ? "#2563eb" : "#475569", color: "white", border: "none",
              padding: "6px 16px", borderRadius: "8px", fontWeight: 600, cursor: canProceed ? "pointer" : "not-allowed"
            }}
          >启动对账</button>
        </div>
      )}
    </div>
  );
}
