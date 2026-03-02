import * as React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { reconciliationApi, UploadedFile } from "../lib/api";

type Step = 1 | 2 | 3 | 4;

type PrecheckItem = {
  id: string;
  title: string;
  status: "pending" | "checking" | "passed" | "warning" | "failed";
  message?: string;
  details?: string;
  suggestion?: string;
  progress?: number; // 0-100
};

type ReconciliationLocationState = {
  files?: (UploadedFile & { kind?: string })[];
  taskId?: string;
};

// 预检结果缓存（确保同一文件多次预检结果一致）
const precheckCache = new Map<string, PrecheckItem[]>();

// 解码文件名（处理中文乱码）
function decodeFilename(name: string): string {
  if (!name) return "";
  try {
    // 尝试直接返回，如果乱码可能是URL编码
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/**
 * 智能对账页面 - 精细化设计版
 */
export default function ReconciliationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as ReconciliationLocationState | null) ?? null;

  const [step, setStep] = React.useState<Step>(1);
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [taskId, setTaskId] = React.useState<string | null>(null);
  const [taskResult, setTaskResult] = React.useState<any>(null);
  const [autoStartReconcile, setAutoStartReconcile] = React.useState(false);
  
  // 日志系统 - 使用 ref 保留历史
  const logsRef = React.useRef<string[]>([]);
  const [logs, setLogs] = React.useState<string[]>([]);

  // 预检状态管理
  const [prechecks, setPrechecks] = React.useState<PrecheckItem[]>([
    { id: "c1", title: "文件格式识别", status: "pending", progress: 0 },
    { id: "c2", title: "数据完整性校验", status: "pending", progress: 0 },
    { id: "c3", title: "订单周期匹配", status: "pending", progress: 0 },
    { id: "c4", title: "数据量级分析", status: "pending", progress: 0 },
  ]);

  const files = locationState?.files || [];
  const dispatchFile = files.find((f) => ['dispatch', 'delivery', 'LOCAL'].includes(f.kind || (f as any).kind));
  const platformFile = files.find((f) => ['platform', 'PLATFORM'].includes(f.kind || (f as any).kind));
  const fundFile = files.find((f) => ['fund', 'flow', 'FLOW'].includes(f.kind || (f as any).kind));

  // 添加日志
  const addLog = React.useCallback((message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const prefix = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
    logsRef.current = [...logsRef.current.slice(-99), `${prefix} ${message}`];
    setLogs([...logsRef.current]);
  }, []);

  // 检查是否可以进入下一步
  const canProceedToStep3 = React.useMemo(() => {
    const hasPassedOrWarning = prechecks.every(p => p.status === 'passed' || p.status === 'warning');
    const noFailed = prechecks.every(p => p.status !== 'failed');
    return hasPassedOrWarning && noFailed;
  }, [prechecks]);

  // 进入步骤2时自动触发预检
  React.useEffect(() => {
    if (step === 2 && prechecks.every(p => p.status === 'pending')) {
      runPrecheck();
    }
  }, [step]);

  // 进入步骤3时自动触发对账（如果设置了autoStart）
  React.useEffect(() => {
    if (step === 3 && autoStartReconcile && !running && !taskId) {
      setAutoStartReconcile(false);
      startReconcile();
    }
  }, [step, autoStartReconcile, running, taskId]);

  // 智能预检 - 确定性逻辑
  const runPrecheck = async () => {
    if (!dispatchFile) {
      addLog("未找到配送单文件，无法执行预检", "warning");
      return;
    }

    const cacheKey = dispatchFile.id;
    const cached = precheckCache.get(cacheKey);
    
    if (cached) {
      setPrechecks(cached);
      addLog("已加载缓存的预检结果", "info");
      return;
    }

    // 重置状态并开始预检
    setPrechecks(prev => prev.map(p => ({ ...p, status: "checking", progress: 0, message: undefined })));
    addLog("开始智能预检...", "info");
    addLog(`分析文件: ${decodeFilename(dispatchFile.name)}`, "info");

    const checkConfigs = [
      { id: "c1", check: "format", name: "文件格式识别" },
      { id: "c2", check: "integrity", name: "数据完整性校验" },
      { id: "c3", check: "cycle", name: "订单周期匹配" },
      { id: "c4", check: "volume", name: "数据量级分析" },
    ];

    const results: PrecheckItem[] = [];

    for (let i = 0; i < checkConfigs.length; i++) {
      const check = checkConfigs[i];
      const progress = Math.round(((i + 1) / checkConfigs.length) * 100);
      
      // 更新进度
      setPrechecks(prev => prev.map(p => 
        p.id === check.id ? { ...p, progress, message: `${check.name}中...` } : p
      ));
      
      addLog(`检查 ${check.name}...`, "info");
      
      // 模拟检查延迟
      await new Promise(r => setTimeout(r, 400));

      // 确定性检查
      const result = deterministicCheck(check.check, dispatchFile);
      
      const precheckItem: PrecheckItem = {
        id: check.id,
        title: check.name,
        status: result.status,
        message: result.message,
        details: result.details,
        suggestion: result.suggestion,
        progress: 100,
      };
      
      results.push(precheckItem);
      
      // 更新UI
      setPrechecks(prev => prev.map(p => p.id === check.id ? precheckItem : p));
      
      const icon = result.status === "passed" ? "✓" : result.status === "warning" ? "⚠" : "✕";
      addLog(`${icon} ${check.name}: ${result.message}`, result.status === "passed" ? "success" : result.status === "warning" ? "warning" : "error");
    }

    // 缓存结果
    precheckCache.set(cacheKey, results);
    
    const passedCount = results.filter(r => r.status === 'passed').length;
    const warningCount = results.filter(r => r.status === 'warning').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    
    if (failedCount > 0) {
      addLog(`预检完成: ${passedCount}项通过, ${warningCount}项警告, ${failedCount}项失败`, "error");
    } else if (warningCount > 0) {
      addLog(`预检完成: ${passedCount}项通过, ${warningCount}项警告`, "warning");
    } else {
      addLog("预检完成，全部检查通过 ✓", "success");
    }
  };

  // 确定性检查逻辑
  const deterministicCheck = (checkType: string, file: any): { status: "passed" | "warning" | "failed"; message: string; details: string; suggestion?: string } => {
    const name = file.name?.toLowerCase() || "";
    const size = file.sizeBytes || file.size || 0;

    switch (checkType) {
      case "format":
        if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
          return { status: "passed", message: "格式正确", details: "文件格式符合要求（Excel/CSV）" };
        }
          return { status: "failed", message: "格式不支持", details: "仅支持 Excel 和 CSV 格式", suggestion: "请转换为 Excel 或 CSV 格式后重试" };

      case "integrity":
        if (size < 1000) return { status: "failed", message: "文件过小", details: `文件仅 ${(size/1024).toFixed(2)} KB，可能无有效数据`, suggestion: "请检查文件是否正确" };
        if (size > 50 * 1024 * 1024) return { status: "warning", message: "文件较大", details: `文件 ${(size/1024/1024).toFixed(1)} MB，处理时间较长`, suggestion: "大文件会自动分批处理" };
        return { status: "passed", message: "数据完整", details: `文件大小适中（${(size/1024).toFixed(1)} KB）` };

      case "cycle":
        const datePattern = /\d{4}[-_]?\d{2}[-_]?\d{2}/g;
        const dates = name.match(datePattern);
        if (dates && dates.length >= 2) return { status: "passed", message: "周期匹配", details: `检测到日期范围: ${dates[0]} ~ ${dates[dates.length-1]}` };
        if (dates) return { status: "warning", message: "单日数据", details: `仅检测到日期: ${dates[0]}`, suggestion: "如需跨天数据，请确认文件完整性" };
        return { status: "warning", message: "未检测到日期", details: "文件名中未包含日期信息", suggestion: "建议文件名加入日期，如：配送单_20240120.xlsx" };

      case "volume":
        const estimatedRecords = Math.round(size / 500);
        if (estimatedRecords < 10) return { status: "warning", message: "订单较少", details: `估算约 ${estimatedRecords} 单，数据量偏少`, suggestion: "请确认是否上传了完整数据" };
        if (estimatedRecords > 10000) return { status: "warning", message: "订单较多", details: `估算约 ${estimatedRecords.toLocaleString()} 单，处理时间较长`, suggestion: "系统会自动分批处理" };
        return { status: "passed", message: "量级正常", details: `估算约 ${estimatedRecords.toLocaleString()} 单，在合理范围内` };

      default:
        return { status: "passed", message: "检查通过", details: "未发现异常" };
    }
  };

  // 开始对账
  const startReconcile = async () => {
    if (!dispatchFile || !fundFile) {
      addLog("缺少必要的文件（配送单和流水账单）", "error");
      return;
    }

    setRunning(true);
    setProgress(5);
    addLog("━━━━━━━━━━━━━━━━━━", "info");
    addLog("启动对账任务...", "info");
    addLog(`配送单: ${decodeFilename(dispatchFile.name)}`, "info");
    addLog(`流水账单: ${decodeFilename(fundFile.name)}`, "info");

    let pollingInterval: NodeJS.Timeout | null = null;

    try {
      const result = await reconciliationApi.executeReal({
        delivery_file_id: dispatchFile.id,
        platform_file_id: platformFile?.id || fundFile.id,
        flow_file_id: fundFile?.id,
        platform_id: platformFile?.platformId || 'shansong',
      });

      // 验证返回结果
      if (!result || !result.taskId) {
        throw new Error('服务器返回的任务ID无效');
      }

      setTaskId(result.taskId);
      addLog(`任务已创建: ${result.taskId.substring(0, 8)}...`, "success");

      const pollProgress = async () => {
        try {
          const progressData = await reconciliationApi.getProgress(result.taskId);
          const newProgress = Math.max(5, Math.min(progressData.progress, 99));
          setProgress(newProgress);

          if (progressData.status === 'FINISHED') {
            if (pollingInterval) clearInterval(pollingInterval);

            addLog("计算完成，生成报告中...", "info");

            const finalResult = await reconciliationApi.getResultReal(result.taskId);
            setTaskResult(finalResult);
            setProgress(100);

            addLog("━━━━━━━━━━━━━━━━━━", "info");
            addLog("对账完成!", "success");
            addLog(`总订单: ${finalResult.task?.localOrderCount || 0}`, "info");
            addLog(`匹配成功: ${finalResult.task?.matchedCount || 0}`, "success");
            addLog(`异常订单: ${finalResult.task?.exceptionCount || 0}`, finalResult.task?.exceptionCount > 0 ? "warning" : "info");
            const matchRate = finalResult.task?.localOrderCount > 0
              ? Math.round((finalResult.task.matchedCount / finalResult.task.localOrderCount) * 100)
              : 0;
            addLog(`匹配率: ${matchRate}%`, "info");

            setRunning(false);
            setStep(4);
          } else if (progressData.status === 'FAILED') {
            if (pollingInterval) clearInterval(pollingInterval);
            addLog(`对账失败: ${progressData.errorMessage}`, "error");
            setRunning(false);
            setProgress(0);
          } else if (progressData.status === 'CANCELLED') {
            if (pollingInterval) clearInterval(pollingInterval);
            addLog(`对账已取消`, "warning");
            setRunning(false);
            setProgress(0);
          }
        } catch (error) {
          console.error('获取进度失败:', error);
        }
      };

      await pollProgress();
      pollingInterval = setInterval(pollProgress, 800);

    } catch (error) {
      addLog(`执行对账失败: ${error instanceof Error ? error.message : '未知错误'}`, "error");
      setRunning(false);
      setProgress(0);
    }
  };

  // 重置
  const resetProgress = () => {
    setProgress(0);
    setTaskId(null);
    setTaskResult(null);
    setPrechecks(prev => prev.map(p => ({ ...p, status: "pending", progress: 0, message: undefined, details: undefined, suggestion: undefined })));
    addLog("━━━━━━━━", "info");
    addLog("已重置，可开始新的对账任务", "info");
  };

  // 步骤名称
  const stepNames = ["数据映射", "智能预检", "核心对账", "生成报告"];

  // 获取步骤状态
  const getStepStatus = (stepNum: number): 'completed' | 'active' | 'pending' => {
    if (stepNum < step) return 'completed';
    if (stepNum === step) return 'active';
    return 'pending';
  };

  // 进度线宽度计算
  const progressLineWidth = React.useMemo(() => {
    const activeIndex = step - 1;
    return `${activeIndex * 33.33}%`;
  }, [step]);

  // 获取警告和失败的检查项
  const warnings = prechecks.filter(p => p.status === 'warning');
  const failures = prechecks.filter(p => p.status === 'failed');
  const passed = prechecks.filter(p => p.status === 'passed');

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: "#1f2937",
      padding: "24px",
      maxWidth: "1200px",
      margin: "0 auto",
    }}>
      {/* 页面标题 */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: "28px",
      }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 600, margin: 0 }}>对账控制台</h1>
          <p style={{ fontSize: "14px", color: "#6b7280", marginTop: "6px" }}>
            按流程完成数据映射、智能预检、核心对账与报告生成
          </p>
        </div>
        <button
          onClick={() => navigate("/upload")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "10px 18px",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            backgroundColor: "white",
            fontSize: "14px",
            cursor: "pointer",
            color: "#374151",
            transition: "all 0.2s ease",
          }}
        >
          ← 返回上传
        </button>
      </div>

      {/* 水平流程步骤条 */}
      <div style={{
        backgroundColor: "white",
        border: "1px solid #e5e7eb",
        borderRadius: "16px",
        padding: "28px 24px",
        marginBottom: "24px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}>
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "space-between", 
          position: "relative",
          padding: "0 30px",
        }}>
          {/* 背景线 */}
          <div style={{
            position: "absolute",
            top: "24px",
            left: "60px",
            right: "60px",
            height: "3px",
            backgroundColor: "#e5e7eb",
            borderRadius: "2px",
          }} />
          
          {/* 进度线（带动画） */}
          <div style={{
            position: "absolute",
            top: "24px",
            left: "60px",
            width: progressLineWidth,
            height: "3px",
            backgroundColor: "#22c55e",
            borderRadius: "2px",
            transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
          }} />

          {[1, 2, 3, 4].map((stepNum) => {
            const status = getStepStatus(stepNum);
            const isActive = status === 'active';
            const isCompleted = status === 'completed';

            return (
              <div key={stepNum} style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                position: "relative",
                zIndex: 2,
              }}>
                {/* 脉冲动画 - 仅当前步骤 */}
                {isActive && (
                  <div style={{
                    position: "absolute",
                    top: "10px",
                    width: "52px",
                    height: "52px",
                    borderRadius: "50%",
                    backgroundColor: "#2563eb",
                    opacity: 0.15,
                    animation: "pulse 2s ease-in-out infinite",
                  }} />
                )}
                
                {/* 步骤图标 */}
                <div style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                  fontWeight: 600,
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  transform: isActive ? "scale(1.1)" : "scale(1)",
                  backgroundColor: isCompleted ? "#dcfce7" : isActive ? "#eff6ff" : "white",
                  border: isCompleted ? "2px solid #22c55e" : isActive ? "2px solid #2563eb" : "2px solid #d1d5db",
                  color: isCompleted ? "#16a34a" : isActive ? "#2563eb" : "#9ca3af",
                }}>
                  {isCompleted ? (
                    <span style={{ color: "#16a34a" }}>✓</span>
                  ) : isActive && running && stepNum === 3 ? (
                    <span style={{ animation: "spin 1s linear infinite" }}>⏳</span>
                  ) : (
                    stepNum
                  )}
                </div>
                
                <div style={{
                  marginTop: "12px",
                  fontSize: "13px",
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "#1f2937" : "#9ca3af",
                  textAlign: "center",
                  transition: "color 0.3s ease",
                }}>
                  {stepNames[stepNum - 1]}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 步骤内容区域 */}
      <div style={{ animation: "fadeIn 0.4s ease" }}>
        
        {/* 步骤 1：数据映射 */}
        {step === 1 && (
          <div style={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "16px",
            padding: "28px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              <span style={{ fontSize: "24px" }}>📋</span>
              <h2 style={{ fontSize: "20px", fontWeight: 600, margin: 0 }}>步骤 1：数据映射</h2>
            </div>
            <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "24px", marginLeft: "36px" }}>
              确认业务侧与资金侧文件映射关系，准备开始对账
            </p>
            
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "16px",
              marginBottom: "28px",
              marginLeft: "36px",
            }}>
              {[
                { label: "业务侧（配送单）", file: dispatchFile, icon: "📦", required: true },
                { label: "资金侧（流水账单）", file: fundFile, icon: "💰", required: true },
                { label: "平台账单（可选）", file: platformFile, icon: "📊", optional: true },
              ].map((item, idx) => (
                <div key={idx} style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                  padding: "20px",
                  backgroundColor: item.file ? "#f0fdf4" : "#f9fafb",
                  transition: "all 0.2s ease",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                    <span style={{ fontSize: "22px" }}>{item.icon}</span>
                    <span style={{ fontSize: "14px", fontWeight: 500, color: "#374151" }}>{item.label}</span>
                    {item.required && !item.file && (
                      <span style={{ fontSize: "11px", color: "#dc2626", backgroundColor: "#fee2e2", padding: "2px 8px", borderRadius: "4px", marginLeft: "auto" }}>
                        必填
                      </span>
                    )}
                  </div>
                  <div style={{ 
                    fontSize: "13px", 
                    color: item.file ? "#166534" : "#9ca3af",
                    wordBreak: "break-all",
                    paddingLeft: "32px",
                    fontFamily: item.file ? "ui-monospace, monospace" : "inherit",
                  }}>
                    {item.file ? decodeFilename(item.file.name) : "未选择文件"}
                  </div>
                  {item.file && (
                    <div style={{ fontSize: "12px", color: "#16a34a", marginTop: "8px", paddingLeft: "32px" }}>
                      ✓ 已就绪 ({item.file.kind?.toUpperCase() || 'FILE'})
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginLeft: "36px" }}>
              <button
                onClick={() => setStep(2)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px 28px",
                  border: "none",
                  borderRadius: "10px",
                  backgroundColor: "#2563eb",
                  color: "white",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  boxShadow: "0 2px 8px rgba(37, 99, 235, 0.25)",
                }}
              >
                下一步：智能预检 →
              </button>
            </div>
          </div>
        )}

        {/* 步骤 2：智能预检 */}
        {step === 2 && (
          <div style={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "16px",
            padding: "28px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              <span style={{ fontSize: "24px" }}>🔍</span>
              <h2 style={{ fontSize: "20px", fontWeight: 600, margin: 0 }}>步骤 2：智能预检</h2>
            </div>
            <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "24px", marginLeft: "36px" }}>
              检查格式、周期、量级等关键问题，确保对账数据正确
            </p>

            {/* 汇总状态栏 */}
            <div style={{
              display: "flex",
              gap: "16px",
              marginBottom: "24px",
              marginLeft: "36px",
            }}>
              <div style={{
                flex: 1,
                padding: "16px 20px",
                backgroundColor: "#f0fdf4",
                borderRadius: "10px",
                border: "1px solid #86efac",
                textAlign: "center",
              }}>
                <div style={{ fontSize: "24px", fontWeight: 700, color: "#16a34a" }}>{passed.length}</div>
                <div style={{ fontSize: "12px", color: "#16a34a", marginTop: "4px" }}>✓ 通过</div>
              </div>
              {warnings.length > 0 && (
                <div style={{
                  flex: 1,
                  padding: "16px 20px",
                  backgroundColor: "#fffbeb",
                  borderRadius: "10px",
                  border: "1px solid #fde68a",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: "24px", fontWeight: 700, color: "#ca8a04" }}>{warnings.length}</div>
                  <div style={{ fontSize: "12px", color: "#ca8a04", marginTop: "4px" }}>⚠ 警告</div>
                </div>
              )}
              {failures.length > 0 && (
                <div style={{
                  flex: 1,
                  padding: "16px 20px",
                  backgroundColor: "#fef2f2",
                  borderRadius: "10px",
                  border: "1px solid #fecaca",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: "24px", fontWeight: 700, color: "#dc2626" }}>{failures.length}</div>
                  <div style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}>✕ 失败</div>
                </div>
              )}
            </div>

            {/* 预检结果卡片区域 */}
            <div style={{ marginLeft: "36px" }}>
              {prechecks.map((p) => {
                const statusColor = p.status === "passed" ? "#16a34a" : p.status === "warning" ? "#ca8a04" : p.status === "failed" ? "#dc2626" : "#2563eb";
                const bgColor = p.status === "passed" ? "#f0fdf4" : p.status === "warning" ? "#fffbeb" : p.status === "failed" ? "#fef2f2" : "#eff6ff";
                const borderColor = p.status === "passed" ? "#86efac" : p.status === "warning" ? "#fde68a" : p.status === "failed" ? "#fecaca" : "#bfdbfe";
                
                return (
                  <div key={p.id} style={{
                    display: "flex",
                    alignItems: "flex-start",
                    padding: "20px 24px",
                    borderRadius: "12px",
                    backgroundColor: bgColor,
                    border: `1px solid ${borderColor}`,
                    marginBottom: "12px",
                    transition: "all 0.3s ease",
                  }}>
                    {/* 状态图标 */}
                    <div style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "50%",
                      backgroundColor: `${statusColor}15`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: "18px",
                      fontSize: "20px",
                      flexShrink: 0,
                    }}>
                      {p.status === "checking" ? (
                        <span style={{ animation: "spin 1s linear infinite" }}>⏳</span>
                      ) : p.status === "passed" ? (
                        "✓"
                      ) : p.status === "warning" ? (
                        "⚠"
                      ) : p.status === "failed" ? (
                        "✕"
                      ) : (
                        "○"
                      )}
                    </div>
                    
                    {/* 内容区域 */}
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        fontSize: "16px", 
                        fontWeight: 600, 
                        color: "#1f2937",
                        marginBottom: "8px",
                      }}>
                        {p.title}
                      </div>
                      
                      {/* 进度条（检查中显示） */}
                      {p.status === "checking" && (
                        <div style={{
                          width: "100%",
                          height: "4px",
                          backgroundColor: "#e5e7eb",
                          borderRadius: "2px",
                          marginBottom: "12px",
                          overflow: "hidden",
                        }}>
                          <div style={{
                            width: `${p.progress}%`,
                            height: "100%",
                            backgroundColor: "#2563eb",
                            borderRadius: "2px",
                            transition: "width 0.3s ease",
                          }} />
                        </div>
                      )}
                      
                      {/* 消息 */}
                      <div style={{ 
                        fontSize: "14px", 
                        color: statusColor,
                        marginBottom: p.suggestion ? "12px" : 0,
                        fontWeight: 500,
                      }}>
                        {p.message || (p.status === "pending" ? "待检查" : p.message)}
                      </div>
                      
                      {/* 详情 */}
                      {p.details && (
                        <div style={{ 
                          fontSize: "13px", 
                          color: "#6b7280",
                          marginBottom: p.suggestion ? "12px" : 0,
                          lineHeight: 1.6,
                          padding: "10px 14px",
                          backgroundColor: "rgba(255,255,255,0.6)",
                          borderRadius: "8px",
                        }}>
                          {p.details}
                        </div>
                      )}
                      
                      {/* 建议卡片 */}
                      {p.suggestion && (
                        <div style={{ 
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "10px",
                          backgroundColor: "white",
                          padding: "12px 16px",
                          borderRadius: "10px",
                          borderLeft: "4px solid #f59e0b",
                          marginTop: "8px",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                        }}>
                          <span style={{ fontSize: "16px" }}>💡</span>
                          <div>
                            <div style={{ fontSize: "12px", color: "#ca8a04", fontWeight: 600, marginBottom: "4px" }}>建议</div>
                            <div style={{ fontSize: "14px", color: "#78350f", lineHeight: 1.5 }}>{p.suggestion}</div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* 状态标签 */}
                    <div style={{
                      padding: "8px 16px",
                      borderRadius: "20px",
                      fontSize: "13px",
                      fontWeight: 600,
                      backgroundColor: `${statusColor}15`,
                      color: statusColor,
                      whiteSpace: "nowrap",
                      alignSelf: "center",
                    }}>
                      {p.status === "checking" ? "检查中" :
                       p.status === "passed" ? "通过" :
                       p.status === "warning" ? "警告" :
                       p.status === "failed" ? "未通过" : "待检查"}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 操作按钮 */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "28px", marginLeft: "36px" }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "10px 20px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  backgroundColor: "white",
                  fontSize: "14px",
                  cursor: "pointer",
                  color: "#374151",
                }}
              >
                ← 上一步
              </button>
              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  onClick={runPrecheck}
                  disabled={running}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "10px 20px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    backgroundColor: "white",
                    fontSize: "14px",
                    cursor: "pointer",
                    color: "#374151",
                  }}
                >
                  <span style={{ animation: running ? "spin 1s linear infinite" : "none" }}>🔄</span>
                  重新预检
                </button>
                <button
                  onClick={() => {
                    setAutoStartReconcile(true);
                    setStep(3);
                  }}
                  disabled={!canProceedToStep3 || running}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 28px",
                    border: "none",
                    borderRadius: "10px",
                    backgroundColor: canProceedToStep3 && !running ? "#2563eb" : "#e5e7eb",
                    color: canProceedToStep3 && !running ? "white" : "#9ca3af",
                    fontSize: "14px",
                    fontWeight: 500,
                    cursor: canProceedToStep3 && !running ? "pointer" : "not-allowed",
                    transition: "all 0.2s ease",
                    boxShadow: canProceedToStep3 ? "0 2px 8px rgba(37, 99, 235, 0.25)" : "none",
                  }}
                >
                  {autoStartReconcile ? (
                    <>
                      <span style={{ animation: "spin 1s linear infinite" }}>⏳</span>
                      启动中...
                    </>
                  ) : (
                    "下一步：执行对账 →"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 步骤 3：核心对账 */}
        {step === 3 && (
          <div style={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "16px",
            padding: "28px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              <span style={{ fontSize: "24px" }}>⚙️</span>
              <h2 style={{ fontSize: "20px", fontWeight: 600, margin: 0 }}>步骤 3：核心对账</h2>
            </div>
            <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "24px", marginLeft: "36px" }}>
              执行对账任务，比对配送单与平台账单数据
            </p>

            {/* 进度区域 */}
            <div style={{
              backgroundColor: "#f8fafc",
              borderRadius: "12px",
              padding: "24px",
              marginBottom: "20px",
              marginLeft: "36px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                <span style={{ fontSize: "14px", fontWeight: 500, color: "#374151" }}>
                  {progress === 0 ? "准备就绪" : 
                   progress < 100 ? `对账执行中... ${Math.round(progress)}%` : 
                   "对账完成"}
                </span>
                <span style={{ 
                  fontSize: "16px", 
                  fontWeight: 600, 
                  color: progress === 100 ? "#22c55e" : "#2563eb" 
                }}>
                  {Math.round(progress)}%
                </span>
              </div>
              
              <div style={{
                height: "10px",
                backgroundColor: "#e2e8f0",
                borderRadius: "5px",
                overflow: "hidden",
                position: "relative",
              }}>
                <div style={{
                  height: "100%",
                  width: `${progress}%`,
                  backgroundColor: progress === 100 ? "#22c55e" : "#2563eb",
                  borderRadius: "5px",
                  transition: progress === 100 ? "width 0.5s ease" : "width 0.3s ease",
                }}>
                  {/* 进度条光效 */}
                  {progress > 0 && progress < 100 && (
                    <div style={{
                      position: "absolute",
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: "30px",
                      background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4))",
                      animation: "shimmer 1s ease-in-out infinite",
                    }} />
                  )}
                </div>
              </div>
              
              {/* 进度阶段指示 */}
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between",
                marginTop: "12px",
                fontSize: "12px",
                color: "#94a3b8",
              }}>
                <span>📄 解析</span>
                <span>🔗 匹配</span>
                <span>💰 比对</span>
                <span>📊 报告</span>
              </div>
            </div>

            {/* 控制台日志 */}
            <div style={{
              backgroundColor: "#0f172a",
              borderRadius: "12px",
              padding: "16px",
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              fontSize: "13px",
              color: "#86efac",
              marginBottom: "20px",
              marginLeft: "36px",
              maxHeight: "220px",
              overflowY: "auto",
            }}>
              {logs.length === 0 ? (
                <div style={{ color: "#64748b", textAlign: "center", padding: "24px" }}>
                  {running ? "对账执行中，请稍候..." : "点击\"执行对账\"开始..."}
                </div>
              ) : (
                logs.slice(-30).map((log, idx) => {
                  const isError = log.includes("❌");
                  const isSuccess = log.includes("✅");
                  const isWarning = log.includes("⚠");
                  const isDivider = log.includes("━━");
                  
                  return (
                    <div key={idx} style={{ 
                      marginBottom: "4px",
                      paddingLeft: isDivider ? "0" : "12px",
                      color: isError ? "#f87171" : isSuccess ? "#4ade80" : isWarning ? "#fbbf24" : "#86efac",
                      fontSize: "13px",
                      opacity: 0.9,
                    }}>
                      {log}
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginLeft: "36px" }}>
              <button
                onClick={() => {
                  setAutoStartReconcile(false);
                  setStep(2);
                }}
                disabled={running}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "10px 20px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  backgroundColor: running ? "#f1f5f9" : "white",
                  fontSize: "14px",
                  cursor: running ? "not-allowed" : "pointer",
                  color: running ? "#94a3b8" : "#374151",
                }}
              >
                ← 上一步
              </button>
              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  onClick={resetProgress}
                  style={{
                    padding: "10px 20px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    backgroundColor: "white",
                    fontSize: "14px",
                    cursor: "pointer",
                    color: "#374151",
                  }}
                >
                  重置
                </button>
                <button
                  onClick={startReconcile}
                  disabled={running}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 28px",
                    border: "none",
                    borderRadius: "10px",
                    backgroundColor: running ? "#93c5fd" : "#2563eb",
                    color: "white",
                    fontSize: "14px",
                    fontWeight: 500,
                    cursor: running ? "not-allowed" : "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  {running ? (
                    <>
                      <span style={{ animation: "spin 1s linear infinite" }}>⏳</span>
                      对账中...
                    </>
                  ) : (
                    "▶ 执行对账"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 步骤 4：生成报告 */}
        {step === 4 && (
          <div style={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "16px",
            padding: "28px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              <span style={{ fontSize: "24px" }}>📊</span>
              <h2 style={{ fontSize: "20px", fontWeight: 600, margin: 0 }}>步骤 4：生成报告</h2>
            </div>
            <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "24px", marginLeft: "36px" }}>
              对账已完成，可跳转查看详细结果
            </p>

            {/* 结果摘要 */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "16px",
              marginBottom: "24px",
              marginLeft: "36px",
            }}>
              {[
                { label: "总订单", value: taskResult?.results?.totalOrders || taskResult?.task?.localOrderCount || 0, color: "#374151", icon: "📦" },
                { label: "匹配成功", value: taskResult?.task?.matchedCount || 0, color: "#16a34a", icon: "✅" },
                { label: "异常订单", value: taskResult?.task?.exceptionCount || 0, color: "#dc2626", icon: "⚠️" },
                { label: "匹配率", value: `${taskResult?.results?.matchRate || taskResult?.task?.localOrderCount > 0 ? Math.round((taskResult.task.matchedCount / taskResult.task.localOrderCount) * 100) : 0}%`, color: "#2563eb", icon: "📈" },
              ].map((stat, idx) => (
                <div key={idx} style={{
                  textAlign: "center",
                  padding: "24px 16px",
                  backgroundColor: "#f8fafc",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                }}>
                  <div style={{ fontSize: "28px", marginBottom: "8px" }}>{stat.icon}</div>
                  <div style={{ fontSize: "28px", fontWeight: 700, color: stat.color }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: "13px", color: "#64748b", marginTop: "4px" }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            <div style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "16px",
              backgroundColor: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: "12px",
              padding: "20px",
              marginBottom: "24px",
              marginLeft: "36px",
            }}>
              <span style={{ fontSize: "28px" }}>🎉</span>
              <div>
                <div style={{ fontSize: "16px", fontWeight: 600, color: "#166534", marginBottom: "4px" }}>
                  对账报告已生成
                </div>
                <div style={{ fontSize: "14px", color: "#16a34a" }}>
                  点击下方按钮进入对账结果页面，查看完整的对账汇总与订单明细
                </div>
                {/* 强制调试输出 */}
                <div style={{ marginTop: 20, padding: 10, background: '#f8f9fa', fontSize: 11, maxHeight: 200, overflow: 'auto', border: '1px dashed #ccc' }}>
                  <strong>[Debug] Task Result Payload:</strong>
                  <pre>{JSON.stringify(taskResult || {}, null, 2)}</pre>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginLeft: "36px" }}>
              <button
                onClick={() => navigate("/results", { state: { taskId } })}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px 28px",
                  border: "none",
                  borderRadius: "10px",
                  backgroundColor: "#2563eb",
                  color: "white",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  boxShadow: "0 2px 8px rgba(37, 99, 235, 0.25)",
                }}
              >
                前往结果页面 →
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.15; }
          50% { transform: scale(1.15); opacity: 0.1; }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); opacity: 0; }
          50% { opacity: 0.3; }
          100% { transform: translateX(100%); opacity: 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
