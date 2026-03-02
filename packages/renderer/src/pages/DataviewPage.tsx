import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  AlertTriangle,
  RefreshCw,
  BarChart3,
  Activity,
} from "lucide-react";

type KPICardProps = {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  trend?: "up" | "down";
};

type AlertItem = {
  id: string;
  type: "error" | "warning" | "info";
  title: string;
  description: string;
  time: string;
};

type PlatformRankingItem = {
  rank: number;
  name: string;
  icon: string;
  orders: number;
  amount: number;
  matchRate: number;
  trend: "up" | "down" | "stable";
};

// Styles object
const styles = {
  page: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
  },
  pageHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '4px',
  },
  pageSubtitle: {
    color: '#6b7280',
    fontSize: '14px',
  },
  grid4: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '16px',
  },
  card: {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  cardHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid #e5e7eb',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  cardContent: {
    padding: '20px',
  },
  kpiCard: {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
    transition: 'box-shadow 0.2s',
  },
  kpiContent: {
    padding: '24px 20px',
  },
  kpiRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kpiLabel: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '8px',
  },
  kpiValue: {
    fontSize: '28px',
    fontWeight: 'bold',
    marginBottom: '8px',
  },
  kpiChange: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '14px',
  },
  kpiChangeUp: {
    color: '#22c55e',
  },
  kpiChangeDown: {
    color: '#ef4444',
  },
  kpiIconBg: {
    padding: '12px',
    borderRadius: '9999px',
    backgroundColor: '#f0fdf4',
  },
  chartCard: {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  chartContainer: {
    height: '256px',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '20px',
  },
  chartBar: {
    flex: 1,
    borderRadius: '4px 4px 0 0',
    transition: 'opacity 0.3s',
  },
  chartLabel: {
    fontSize: '12px',
    color: '#6b7280',
    textAlign: 'center' as const,
  },
  chartGroup: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '8px',
  },
  rankingCard: {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  rankingItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '12px 0',
  },
  rankBadge: {
    width: '32px',
    height: '32px',
    borderRadius: '9999px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 'bold',
    flexShrink: 0,
  },
  rank1: {
    backgroundColor: '#eab308',
    color: '#fff',
  },
  rank2: {
    backgroundColor: '#9ca3af',
    color: '#fff',
  },
  rank3: {
    backgroundColor: '#d97706',
    color: '#fff',
  },
  rankOther: {
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
  },
  rankingIcon: {
    fontSize: '24px',
  },
  rankingInfo: {
    flex: 1,
    minWidth: 0,
  },
  rankingHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '4px',
  },
  rankingName: {
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  rankingStats: {
    fontSize: '14px',
    color: '#6b7280',
  },
  rankingProgress: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '4px',
  },
  progressBar: {
    flex: 1,
    height: '8px',
    backgroundColor: '#f3f4f6',
    borderRadius: '9999px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: '9999px',
  },
  progressText: {
    fontSize: '12px',
    color: '#6b7280',
    whiteSpace: 'nowrap' as const,
  },
  alertCard: {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  alertItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '8px',
  },
  alertBgError: {
    backgroundColor: '#fef2f2',
  },
  alertBgWarning: {
    backgroundColor: '#fefce8',
  },
  alertBgInfo: {
    backgroundColor: '#eff6ff',
  },
  alertIcon: {
    width: '20px',
    height: '20px',
    marginTop: '2px',
    flexShrink: 0,
  },
  alertContent: {
    flex: 1,
    minWidth: 0,
  },
  alertTitle: {
    fontWeight: 500,
    fontSize: '14px',
    marginBottom: '2px',
  },
  alertDesc: {
    fontSize: '12px',
    color: '#6b7280',
  },
  alertTime: {
    fontSize: '12px',
    color: '#6b7280',
    whiteSpace: 'nowrap' as const,
  },
  alertColorError: {
    color: '#ef4444',
  },
  alertColorWarning: {
    color: '#eab308',
  },
  alertColorInfo: {
    color: '#3b82f6',
  },
  buttonOutline: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: 'transparent',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  spin: {
    animation: 'spin 1s linear infinite',
  },
};

function KPICard({ title, value, change, icon, trend }: KPICardProps) {
  return (
    <div style={styles.kpiCard}>
      <div style={styles.kpiContent}>
        <div style={styles.kpiRow}>
          <div>
            <p style={styles.kpiLabel}>{title}</p>
            <p style={styles.kpiValue}>{value}</p>
            {change !== undefined && (
              <div style={styles.kpiChange}>
                {trend === "up" ? (
                  <TrendingUp style={{ width: '16px', height: '16px', marginRight: '4px', color: '#22c55e' }} />
                ) : (
                  <TrendingDown style={{ width: '16px', height: '16px', marginRight: '4px', color: '#ef4444' }} />
                )}
                <span style={trend === "up" ? styles.kpiChangeUp : styles.kpiChangeDown}>
                  {change > 0 ? "+" : ""}
                  {change}%
                </span>
                <span style={{ fontSize: '14px', color: '#6b7280', marginLeft: '4px' }}>较昨日</span>
              </div>
            )}
          </div>
          <div style={styles.kpiIconBg}>{icon}</div>
        </div>
      </div>
    </div>
  );
}

function AlertList({ alerts }: { alerts: AlertItem[] }) {
  const alertConfig = {
    error: { icon: AlertTriangle, color: styles.alertColorError, bg: styles.alertBgError },
    warning: { icon: AlertTriangle, color: styles.alertColorWarning, bg: styles.alertBgWarning },
    info: { icon: Activity, color: styles.alertColorInfo, bg: styles.alertBgInfo },
  };

  return (
    <div style={styles.alertCard}>
      <div style={styles.cardHeader}>
        <div style={styles.cardTitle}>
          <AlertTriangle style={{ width: '20px', height: '20px' }} />
          预警列表
        </div>
      </div>
      <div style={styles.cardContent}>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '12px' }}>
          {alerts.map((alert) => {
            const config = alertConfig[alert.type];
            return (
              <div
                key={alert.id}
                style={{
                  ...styles.alertItem,
                  ...config.bg,
                }}
              >
                {React.createElement(config.icon, {
                  style: { ...styles.alertIcon, ...config.color },
                })}
                <div style={styles.alertContent}>
                  <p style={styles.alertTitle}>{alert.title}</p>
                  <p style={styles.alertDesc}>{alert.description}</p>
                </div>
                <span style={styles.alertTime}>{alert.time}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PlatformRanking({ items }: { items: PlatformRankingItem[] }) {
  return (
    <div style={styles.rankingCard}>
      <div style={styles.cardHeader}>
        <div style={styles.cardTitle}>
          <BarChart3 style={{ width: '20px', height: '20px' }} />
          平台排名
        </div>
      </div>
      <div style={styles.cardContent}>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '16px' }}>
          {items.map((item) => {
            const rankStyle =
              item.rank === 1
                ? styles.rank1
                : item.rank === 2
                ? styles.rank2
                : item.rank === 3
                ? styles.rank3
                : styles.rankOther;

            return (
              <div key={item.rank} style={styles.rankingItem}>
                <div style={{ ...styles.rankBadge, ...rankStyle }}>{item.rank}</div>
                <span style={styles.rankingIcon}>{item.icon}</span>
                <div style={styles.rankingInfo}>
                  <div style={styles.rankingHeader}>
                    <span style={styles.rankingName}>{item.name}</span>
                    <span style={styles.rankingStats}>
                      {item.orders} 单 | ¥{(item.amount / 10000).toFixed(1)}万
                    </span>
                  </div>
                  <div style={styles.rankingProgress}>
                    <div style={styles.progressBar}>
                      <div
                        style={{
                          ...styles.progressFill,
                          width: `${(item.orders / 500) * 100}%`,
                          backgroundColor: '#22c55e',
                        }}
                      />
                    </div>
                    <span style={styles.progressText}>{item.matchRate}% 匹配率</span>
                  </div>
                </div>
                {item.trend === "up" && <TrendingUp style={{ width: '16px', height: '16px', color: '#22c55e' }} />}
                {item.trend === "down" && <TrendingDown style={{ width: '16px', height: '16px', color: '#ef4444' }} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function DataviewPage() {
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 2000);
  };

  // Mock 数据
  const kpis: KPICardProps[] = [
    {
      title: "总订单量",
      value: "12,586",
      change: 8.5,
      trend: "up",
      icon: <ShoppingCart style={{ width: '24px', height: '24px', color: '#22c55e' }} />,
    },
    {
      title: "总金额",
      value: "¥156.8万",
      change: 12.3,
      trend: "up",
      icon: <DollarSign style={{ width: '24px', height: '24px', color: '#22c55e' }} />,
    },
    {
      title: "异常订单",
      value: "156",
      change: -15.2,
      trend: "down",
      icon: <AlertTriangle style={{ width: '24px', height: '24px', color: '#ef4444' }} />,
    },
    {
      title: "匹配率",
      value: "98.7%",
      change: 0.5,
      trend: "up",
      icon: <Activity style={{ width: '24px', height: '24px', color: '#22c55e' }} />,
    },
  ];

  const alerts: AlertItem[] = [
    {
      id: "1",
      type: "error",
      title: "闪送平台金额异常",
      description: "检测到 3 笔订单金额与流水不符",
      time: "10分钟前",
    },
    {
      id: "2",
      type: "warning",
      title: "达达平台响应缓慢",
      description: "API 响应时间超过 3 秒",
      time: "25分钟前",
    },
    {
      id: "3",
      type: "info",
      title: "顺丰同步完成",
      description: "顺丰同城账单数据同步完成，共 256 条",
      time: "1小时前",
    },
  ];

  const platformRanking: PlatformRankingItem[] = [
    { rank: 1, name: "闪送", icon: "📦", orders: 456, amount: 45600, matchRate: 99.2, trend: "up" },
    { rank: 2, name: "达达", icon: "🚴", orders: 398, amount: 38900, matchRate: 97.8, trend: "stable" },
    { rank: 3, name: "蜂鸟", icon: "🐦", orders: 312, amount: 29800, matchRate: 96.5, trend: "down" },
    { rank: 4, name: "顺丰同城", icon: "✈️", orders: 245, amount: 26700, matchRate: 98.9, trend: "up" },
    { rank: 5, name: "UU跑腿", icon: "🏃", orders: 156, amount: 14200, matchRate: 95.3, trend: "stable" },
  ];

  const orderTrendData = [
    { day: "周一", orders: 120, color: '#22c55e' },
    { day: "周二", orders: 145, color: '#22c55e' },
    { day: "周三", orders: 132, color: '#22c55e' },
    { day: "周四", orders: 158, color: '#22c55e' },
    { day: "周五", orders: 186, color: '#22c55e' },
    { day: "周六", orders: 165, color: '#22c55e' },
    { day: "周日", orders: 142, color: '#22c55e' },
  ];

  const amountTrendData = [
    { day: "周一", amount: 1.2, color: '#22c55e' },
    { day: "周二", amount: 1.5, color: '#22c55e' },
    { day: "周三", amount: 1.4, color: '#22c55e' },
    { day: "周四", amount: 1.8, color: '#22c55e' },
    { day: "周五", amount: 2.1, color: '#22c55e' },
    { day: "周六", amount: 1.9, color: '#22c55e' },
    { day: "周日", amount: 1.6, color: '#22c55e' },
  ];

  return (
    <div style={styles.page}>
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.pageTitle}>数据大屏</h1>
          <p style={styles.pageSubtitle}>实时数据监控与分析</p>
        </div>
        <button
          style={styles.buttonOutline}
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw
            style={{
              width: '16px',
              height: '16px',
              ...(isRefreshing ? styles.spin : {}),
            }}
          />
          刷新数据
        </button>
      </div>

      {/* KPI 卡片 */}
      <div style={styles.grid4}>
        {kpis.map((kpi) => (
          <KPICard key={kpi.title} {...kpi} />
        ))}
      </div>

      {/* 趋势图表区域 */}
      <div style={styles.grid2}>
        {/* 订单趋势 */}
        <div style={styles.chartCard}>
          <div style={styles.cardHeader}>
            <div style={styles.cardTitle}>
              <BarChart3 style={{ width: '20px', height: '20px' }} />
              订单趋势 (近7天)
            </div>
          </div>
          <div style={styles.chartContainer}>
            {orderTrendData.map((item) => (
              <div key={item.day} style={styles.chartGroup}>
                <div
                  style={{
                    ...styles.chartBar,
                    backgroundColor: item.color,
                    height: `${(item.orders / 200) * 100}%`,
                    minHeight: '20px',
                  }}
                />
                <span style={styles.chartLabel}>{item.day}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 金额趋势 */}
        <div style={styles.chartCard}>
          <div style={styles.cardHeader}>
            <div style={styles.cardTitle}>
              <DollarSign style={{ width: '20px', height: '20px' }} />
              金额趋势 (近7天)
            </div>
          </div>
          <div style={styles.chartContainer}>
            {amountTrendData.map((item) => (
              <div key={item.day} style={styles.chartGroup}>
                <div
                  style={{
                    ...styles.chartBar,
                    backgroundColor: item.color,
                    height: `${(item.amount / 2.5) * 100}%`,
                    minHeight: '20px',
                  }}
                />
                <span style={styles.chartLabel}>{item.day}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 底部区域 */}
      <div style={styles.grid2}>
        <PlatformRanking items={platformRanking} />
        <AlertList alerts={alerts} />
      </div>
    </div>
  );
}
