import * as React from "react";
import { useEffect, useState } from "react";
import { taskApi, type Task, type PaginatedResponse } from "@/lib/api";

type ReportCardProps = {
  id: string;
  date: string;
  time: string;
  totalOrders: number;
  successCount: number;
  failCount: number;
  matchRate: number;
  status: "perfect" | "issue" | "fixed";
  platformId: string;
  onClick?: () => void;
};

/**
 * 历史记录页面
 * 查看历史对账报告
 */
export default function HistoryPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 月度统计数据
  const monthlyStats = {
    totalCount: tasks.length,
    perfectRate: tasks.length > 0
      ? (tasks.filter((t) => t.status === "completed").length / tasks.length) * 100
      : 0,
    totalAmount: tasks.reduce((sum, t) => sum + t.totalAmount, 0),
  };

  // 加载任务数据
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await taskApi.getList({ pageSize: 50 });
        const tasks = (response as unknown as { tasks: Task[] })?.tasks ?? [];
        setTasks(tasks);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载数据失败");
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
  }, []);

  // 转换任务为报告卡片数据
  const reports: ReportCardProps[] = tasks.map((task) => {
    const status =
      task.status === "completed"
        ? "perfect"
        : task.status === "failed"
        ? "issue"
        : "fixed";
    const createdAt = new Date(task.createdAt);
    return {
      id: task.id,
      date: createdAt.toLocaleDateString("zh-CN"),
      time: createdAt.toLocaleTimeString("zh-CN"),
      totalOrders: task.localOrderCount + task.platformOrderCount,
      successCount: task.matchedCount,
      failCount: task.exceptionCount,
      matchRate:
        task.localOrderCount + task.platformOrderCount > 0
          ? (task.matchedCount / (task.localOrderCount + task.platformOrderCount)) * 100
          : 0,
      status,
      platformId: task.platformId,
    };
  });

  const formatMonth = (date: Date) => {
    return `${date.getFullYear()}年${date.getMonth() + 1}月`;
  };

  const goToPrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  // 获取状态样式
  const getStatusStyle = (status: string) => {
    if (status === "perfect") {
      return { label: "完成", bg: "#dcfce7", color: "#16a34a", border: "#22c55e" };
    }
    if (status === "issue") {
      return { label: "异常", bg: "#fef2f2", color: "#dc2626", border: "#ef4444" };
    }
    return { label: "处理中", bg: "#dbeafe", color: "#2563eb", border: "#3b82f6" };
  };

  // 获取进度条颜色
  const getProgressColor = (rate: number) => {
    if (rate >= 95) return "#22c55e";
    if (rate >= 80) return "#eab308";
    return "#ef4444";
  };

  // 平台名称映射
  const platformNames: Record<string, string> = {
    shansong: "闪送",
    dada: "达达",
    fengniao: "蜂鸟",
    xunfeng: "顺丰同城",
    guoxiaodi: "裹小递",
    uu: "UU跑腿",
  };

  // 报告卡片组件
  const ReportCard = (props: ReportCardProps) => {
    const statusStyle = getStatusStyle(props.status);
    return (
      <div
        style={{
          backgroundColor: "white",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          borderLeft: `4px solid ${statusStyle.border}`,
          padding: "16px",
          cursor: "pointer",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
          e.currentTarget.style.transform = "translateY(-2px)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = "none";
          e.currentTarget.style.transform = "translateY(0)";
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px" }}>📄</span>
            <span style={{ fontSize: "16px", fontWeight: 600 }}>{props.date}</span>
          </div>
          <span
            style={{
              padding: "4px 8px",
              borderRadius: "4px",
              fontSize: "12px",
              fontWeight: 500,
              backgroundColor: statusStyle.bg,
              color: statusStyle.color,
            }}
          >
            {statusStyle.label}
          </span>
        </div>
        <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "16px" }}>
          🕐 {props.time}
        </div>

        {/* 关键指标 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "8px",
            marginBottom: "16px",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "20px", fontWeight: 700 }}>{props.totalOrders}</div>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>总订单</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#16a34a" }}>
              {props.successCount}
            </div>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>成功</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#dc2626" }}>
              {props.failCount}
            </div>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>异常</div>
          </div>
        </div>

        {/* 匹配率进度条 */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "13px",
              marginBottom: "6px",
            }}
          >
            <span style={{ color: "#6b7280" }}>匹配率</span>
            <span style={{ fontWeight: 500 }}>{props.matchRate.toFixed(1)}%</span>
          </div>
          <div
            style={{
              height: "6px",
              backgroundColor: "#f3f4f6",
              borderRadius: "3px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${props.matchRate}%`,
                backgroundColor: getProgressColor(props.matchRate),
                borderRadius: "3px",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>

        {/* 平台标签 */}
        <div style={{ marginTop: "12px" }}>
          <span
            style={{
              display: "inline-block",
              padding: "2px 8px",
              backgroundColor: "#f3f4f6",
              borderRadius: "4px",
              fontSize: "12px",
              color: "#6b7280",
            }}
          >
            {platformNames[props.platformId] || props.platformId}
          </span>
        </div>
      </div>
    );
  };

  // 加载状态
  if (loading) {
    return (
      <div
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: "#1f2937",
          padding: "24px",
          maxWidth: "1200px",
          margin: "0 auto",
          textAlign: "center",
          paddingTop: "100px",
        }}
      >
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>⏳</div>
        <div style={{ fontSize: "16px", color: "#6b7280" }}>加载中...</div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: "#1f2937",
          padding: "24px",
          maxWidth: "1200px",
          margin: "0 auto",
          textAlign: "center",
          paddingTop: "100px",
        }}
      >
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>❌</div>
        <div style={{ fontSize: "16px", color: "#dc2626", marginBottom: "8px" }}>
          {error}
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "8px 16px",
            backgroundColor: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          重新加载
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: "#1f2937",
        padding: "24px",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      {/* 页面标题 */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>历史记录</h1>
        <p style={{ fontSize: "14px", color: "#6b7280", marginTop: "4px" }}>
          查看历史对账报告
        </p>
      </div>

      {/* 月度统计卡片 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "16px",
          }}
        >
          <div style={{ fontSize: "14px", color: "#6b7280", marginBottom: "4px" }}>
            本月对账次数
          </div>
          <div style={{ fontSize: "28px", fontWeight: 700 }}>
            {monthlyStats.totalCount} 次
          </div>
          <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>
            共 {formatMonth(currentMonth)}
          </div>
        </div>
        <div
          style={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "16px",
          }}
        >
          <div style={{ fontSize: "14px", color: "#6b7280", marginBottom: "4px" }}>
            完成率
          </div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: "#16a34a" }}>
            {monthlyStats.perfectRate.toFixed(1)}%
          </div>
          <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>
            已完成任务 / 总任务
          </div>
        </div>
        <div
          style={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "16px",
          }}
        >
          <div style={{ fontSize: "14px", color: "#6b7280", marginBottom: "4px" }}>
            累计对账金额
          </div>
          <div style={{ fontSize: "28px", fontWeight: 700 }}>
            ¥{monthlyStats.totalAmount.toLocaleString()}
          </div>
          <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>
            本月累计
          </div>
        </div>
      </div>

      {/* 月份选择器 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <button
          onClick={goToPrevMonth}
          style={{
            padding: "8px 12px",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            backgroundColor: "white",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          ←
        </button>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 16px",
            backgroundColor: "#f3f4f6",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 500,
          }}
        >
          📅 {formatMonth(currentMonth)}
        </div>
        <button
          onClick={goToNextMonth}
          style={{
            padding: "8px 12px",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            backgroundColor: "white",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          →
        </button>
      </div>

      {/* 报告列表 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "16px",
        }}
      >
        {reports.map((report) => (
          <ReportCard key={report.id} {...report} />
        ))}
      </div>

      {/* 空状态 */}
      {reports.length === 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px",
            backgroundColor: "white",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            textAlign: "center",
          }}
        >
          <span style={{ fontSize: "48px", marginBottom: "12px" }}>📄</span>
          <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "4px" }}>
            暂无对账记录
          </div>
          <div style={{ fontSize: "14px", color: "#6b7280", marginBottom: "16px" }}>
            请先执行对账操作以生成报告
          </div>
          <button
            style={{
              padding: "8px 16px",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              backgroundColor: "white",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            前往对账
          </button>
        </div>
      )}
    </div>
  );
}
