import * as React from "react";
import { useEffect, useState } from "react";
import { taskApi, platformApi, type TaskStats, type Platform, type ApiResponse, type Task } from "@/lib/api";

interface PlatformStats {
  name: string;
  count: number;
  percent: number;
  color: string;
}

interface TaskItem {
  id: string;
  title: string;
  priority: "high" | "medium" | "low";
  time: string;
  status: string;
}

interface DashboardData {
  taskStats: TaskStats;
  platformStats: PlatformStats[];
  recentTasks: TaskItem[];
}

/**
 * 仪表盘页面 - 订单对账系统首页
 * 使用真实 API 数据
 */
export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 加载数据
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // 并行获取数据
        const [taskStatsRes, platformsRes, tasksRes] = await Promise.all([
          taskApi.getStats().catch(() => null),
          platformApi.getList().catch(() => null),
          taskApi.getList({ pageSize: 5 }).catch(() => null),
        ]);

        const taskStats = (taskStatsRes as TaskStats | null) || {
          total: 0,
          pending: 0,
          processing: 0,
          completed: 0,
          failed: 0,
        };

        const platformsResponse = platformsRes as ApiResponse<Platform[]> | null;
        const platforms = (platformsResponse?.data || []) as Platform[];

        // 计算平台统计数据
        const totalOrders = platforms.reduce((sum, p) => {
          const orderCount = (p as unknown as { orderCount?: number }).orderCount || 0;
          return sum + orderCount;
        }, 0);
        const platformColors: Record<string, string> = {
          shansong: "#3b82f6",
          dada: "#22c55e",
          fengniao: "#eab308",
          xunfeng: "#a855f7",
          guoxiaodi: "#ec4899",
          uu: "#f97316",
        };
        const platformNames: Record<string, string> = {
          shansong: "闪送",
          dada: "达达",
          fengniao: "蜂鸟",
          xunfeng: "顺丰同城",
          guoxiaodi: "裹小递",
          uu: "UU跑腿",
        };

        const platformStats: PlatformStats[] = platforms
          .filter((p) => p.enabled)
          .map((p) => {
            const orderCount = (p as unknown as { orderCount?: number }).orderCount || 0;
            return {
              name: platformNames[p.platformId] || p.name,
              count: orderCount,
              percent: totalOrders > 0 ? (orderCount / totalOrders) * 100 : 0,
              color: platformColors[p.platformId] || "#6b7280",
            };
          })
          .sort((a, b) => b.count - a.count);

        // 转换任务列表
        const tasksResponse = tasksRes as { data?: Task[] } | null;
        const recentTasks: TaskItem[] = (tasksResponse?.data || []).map((task) => ({
          id: task.id,
          title: task.name,
          priority: task.status === "failed" ? "high" : task.status === "processing" ? "medium" : "low",
          time: new Date(task.createdAt).toLocaleString("zh-CN"),
          status: task.status,
        }));

        setData({
          taskStats,
          platformStats,
          recentTasks,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载数据失败");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // 计算统计数据
  const stats = data
    ? [
        {
          title: "总任务",
          value: String(data.taskStats.total || 0),
          change: data.taskStats.completed > 0 ? `已完成 ${data.taskStats.completed}` : "暂无任务",
          icon: "📋",
          color: "#2563eb",
        },
        {
          title: "进行中",
          value: String(data.taskStats.processing || 0),
          change: data.taskStats.pending > 0 ? `待处理 ${data.taskStats.pending}` : "全部完成",
          icon: "⚙️",
          color: "#f59e0b",
        },
        {
          title: "已完成",
          value: String(data.taskStats.completed || 0),
          change: data.taskStats.failed > 0 ? `失败 ${data.taskStats.failed}` : "无失败",
          icon: "✓",
          color: "#16a34a",
        },
        {
          title: "平台数量",
          value: String(data.platformStats.length || 0),
          change: "已配置",
          icon: "🌐",
          color: "#8b5cf6",
        },
      ]
    : [];

  // 趋势数据（模拟）
  const trendData = [
    { day: "一", value: 120 },
    { day: "二", value: 145 },
    { day: "三", value: 132 },
    { day: "四", value: 158 },
    { day: "五", value: 156 },
    { day: "六", value: 142 },
    { day: "日", value: 138 },
  ];
  const maxValue = Math.max(...trendData.map((d) => d.value));

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "high":
        return { backgroundColor: "#fef2f2", color: "#dc2626", label: "紧急" };
      case "medium":
        return { backgroundColor: "#fefce8", color: "#ca8a04", label: "普通" };
      case "low":
        return { backgroundColor: "#eff6ff", color: "#2563eb", label: "一般" };
      default:
        return { backgroundColor: "#f3f4f6", color: "#6b7280", label: "未知" };
    }
  };

  const getBarHeight = (value: number) => {
    return (value / maxValue) * 100;
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "completed":
        return { backgroundColor: "#dcfce7", color: "#16a34a", label: "已完成" };
      case "processing":
        return { backgroundColor: "#fef3c7", color: "#d97706", label: "进行中" };
      case "failed":
        return { backgroundColor: "#fef2f2", color: "#dc2626", label: "失败" };
      default:
        return { backgroundColor: "#f3f4f6", color: "#6b7280", label: "待处理" };
    }
  };

  // 加载状态
  if (loading) {
    return (
      <div
        style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: "#1f2937",
          padding: "24px",
          maxWidth: "1200px",
          margin: "0 auto",
          textAlign: "center",
          paddingTop: "100px",
        }}
      >
        <div
          style={{
            fontSize: "48px",
            marginBottom: "16px",
          }}
        >
          ⏳
        </div>
        <div style={{ fontSize: "16px", color: "#6b7280" }}>加载中...</div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div
        style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: "#1f2937",
          padding: "24px",
          maxWidth: "1200px",
          margin: "0 auto",
          textAlign: "center",
          paddingTop: "100px",
        }}
      >
        <div
          style={{
            fontSize: "48px",
            marginBottom: "16px",
          }}
        >
          ❌
        </div>
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
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: "#1f2937",
        padding: "24px",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      {/* 页面标题 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>仪表盘</h1>
          <p style={{ fontSize: "14px", color: "#6b7280", marginTop: "4px" }}>
            订单对账总览与关键指标
          </p>
        </div>
        <button
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 16px",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            backgroundColor: "white",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          查看详情 →
        </button>
      </div>

      {/* 统计卡片 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        {stats.map((stat) => (
          <div
            key={stat.title}
            style={{
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              padding: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <span style={{ fontSize: "14px", color: "#6b7280" }}>{stat.title}</span>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "14px",
                  backgroundColor: "#eff6ff",
                  color: stat.color,
                }}
              >
                {stat.icon}
              </div>
            </div>
            <div style={{ fontSize: "28px", fontWeight: 700 }}>{stat.value}</div>
            <div
              style={{
                fontSize: "12px",
                color: "#6b7280",
                marginTop: "8px",
              }}
            >
              {stat.change}
            </div>
          </div>
        ))}
      </div>

      {/* 图表区域 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        {/* 平台订单分布 */}
        <div
          style={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "20px",
          }}
        >
          <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px" }}>
            📊 平台订单分布
          </div>
          {data?.platformStats.length ? (
            data.platformStats.map((platform) => (
              <div key={platform.name} style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "6px",
                    fontSize: "14px",
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{platform.name}</span>
                  <span style={{ color: "#6b7280" }}>
                    {platform.count} 单 ({platform.percent.toFixed(1)}%)
                  </span>
                </div>
                <div
                  style={{
                    height: "8px",
                    backgroundColor: "#f3f4f6",
                    borderRadius: "4px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${platform.percent}%`,
                      backgroundColor: platform.color,
                      borderRadius: "4px",
                    }}
                  />
                </div>
              </div>
            ))
          ) : (
            <div
              style={{
                color: "#9ca3af",
                fontSize: "14px",
                textAlign: "center",
                padding: "20px",
              }}
            >
              暂无平台数据
            </div>
          )}
        </div>

        {/* 待处理任务 */}
        <div
          style={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "20px",
          }}
        >
          <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px" }}>
            🔔 最近任务
          </div>
          {data?.recentTasks.length ? (
            data.recentTasks.map((task) => {
              const badge = getPriorityBadge(task.priority);
              const statusBadge = getStatusLabel(task.status);
              return (
                <div
                  key={task.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    padding: "12px",
                    border: "1px solid #f3f4f6",
                    borderRadius: "8px",
                    marginBottom: "12px",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 500 }}>{task.title}</div>
                    <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>
                      {task.time}
                    </div>
                  </div>
                  <span
                    style={{
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      fontWeight: 500,
                      backgroundColor: statusBadge.backgroundColor,
                      color: statusBadge.color,
                    }}
                  >
                    {statusBadge.label}
                  </span>
                </div>
              );
            })
          ) : (
            <div
              style={{
                color: "#9ca3af",
                fontSize: "14px",
                textAlign: "center",
                padding: "20px",
              }}
            >
              暂无任务
            </div>
          )}
        </div>
      </div>

      {/* 趋势图 */}
      <div
        style={{
          backgroundColor: "white",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          padding: "20px",
        }}
      >
        <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "20px" }}>
          📈 近 7 天对账趋势
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            height: "192px",
            gap: "12px",
          }}
        >
          {trendData.map((item) => (
            <div
              key={item.day}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                flex: 1,
              }}
            >
              <div
                style={{
                  width: "100%",
                  backgroundColor: "#3b82f6",
                  borderRadius: "4px 4px 0 0",
                  minHeight: "4px",
                  height: `${getBarHeight(item.value)}%`,
                }}
                title={`${item.day}: ${item.value} 单`}
              />
              <span style={{ fontSize: "12px", color: "#9ca3af", marginTop: "8px" }}>
                {item.day}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
