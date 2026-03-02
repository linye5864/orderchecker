import * as React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { reconciliationApi, type UploadedFile, get } from "../lib/api";
import { exportReconciliationResults } from "../lib/export";

type ResultsLocationState = {
  taskId?: string;
  files?: UploadedFile[];
};

type Row = {
  id: string;
  orderNo: string;
  occurredAt: string;
  status: "matched" | "exception" | "missing";
  amounts: { dispatch: number; platform: number; fund: number };
  diffs: { localVsFlow: number; flowVsPlatform: number; localVsPlatform: number };
  reason?: string;
  carrier?: string;
  merchantId?: string;
  deliveryStatus?: string;
  platformOrderStatus?: string;
};

type MerchantSummaryRow = {
  merchantId: string;
  adminId?: string;
  orderCount: number;
  deductionAmount: number;
  rechargeAmount: number;
  initialBalance: number;
  finalBalance: number;
  rewardAmount: number;
};

// 图表颜色配置
const COLORS = {
  matched: "#22c55e",
  exception: "#ef4444",
  missing: "#f59e0b",
  dispatch: "#3b82f6",
  platform: "#8b5cf6",
};

function formatMoney(amount: number | undefined): string {
  if (amount === undefined || amount === null) return "0.00";
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ResultsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as ResultsLocationState | null) ?? null;

  const [loading, setLoading] = React.useState(true);
  const [result, setResult] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<"all" | "matched" | "exception" | "missing">("all");

  // 状态变量
  const [selectedOrder, setSelectedOrder] = React.useState<Row | null>(null);
  const [showDetailModal, setShowDetailModal] = React.useState(false);
  const [selectedMerchantId, setSelectedMerchantId] = React.useState<string | null>(null);
  const [showMerchantModal, setShowMerchantModal] = React.useState(false);

  // 从 API 加载结果
  React.useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const taskId = locationState?.taskId || queryParams.get("taskId");
    
    if (!taskId) {
      console.error("未找到任务 ID (State 或 Query)");
      setLoading(false);
      return;
    }

    setLoading(true);
    console.log(`[审计看板] 正在请求任务数据: ${taskId}`);
    
    reconciliationApi.getResultReal(taskId)
      .then((data) => {
        console.log("[审计看板] 数据载入成功:", data);
        setResult(data);
        setError(null);
      })
      .catch((err) => {
        console.error("[审计看板] 数据请求失败:", err);
        setError(err.message);
        setResult(null);
      })
      .finally(() => setLoading(false));
  }, [locationState?.taskId, location.search]);

  // 解析订单数据
  const rows: Row[] = React.useMemo(() => {
    // 深度防御：支持 backend 多层嵌套或平铺格式
    let rawData = result?.data || result;
    
    // 如果 result 本地就是 data 字段的内容 (常见于 api.ts 的 unwrapper)
    // 优先寻找 orders 数组
    let orders: any[] = [];
    if (Array.isArray(rawData?.results?.orders)) {
      orders = rawData.results.orders;
    } else if (Array.isArray(rawData?.orders)) {
      orders = rawData.orders;
    } else if (Array.isArray(rawData)) { // 兼容直接返回数组
      orders = rawData;
    }
    
    if (orders.length === 0) {
      console.warn("[审计看板] 解析订单数组为空. rawData:", rawData);
      return [];
    }

    console.log(`[审计看板] 开始转换 ${orders.length} 条原始订单...`);

    return orders.map((order: any, index: number) => {
      // 字段归一化 (兼容 TripartiteReconciliation 原始模型名)
      const orderNo = order.delivery_order_sn || order.orderNumber || order.orderNo || `REC-${index}`;
      
      // 状态归一化
      let status: "matched" | "exception" | "missing" = "exception";
      const s = String(order.status || "").toUpperCase();
      if (s === 'MATCHED') status = 'matched';
      else if (s === 'MISSING' || s === 'MISSING_DATA') status = 'missing';
      
      // 金额归一化 (SQLite 读出的 Float 可能是 null)
      const dSafe = (v: any) => v && typeof v === 'number' ? v : 0;

      return {
        id: order.id || `row-${index}`,
        orderNo,
        occurredAt: order.order_time ? new Date(order.order_time).toLocaleString('zh-CN') : 
                   (order.createdAt ? new Date(order.createdAt).toLocaleString('zh-CN') : '-'),
        status,
        amounts: {
          dispatch: dSafe(order.delivery_amount || order.localAmount),
          platform: dSafe(order.platform_amount || order.platformAmount),
          fund: dSafe(order.flow_amount || order.fundAmount),
        },
        diffs: {
          localVsFlow: dSafe(order.diff_delivery_vs_flow || order.diffDeliveryVsFlow),
          flowVsPlatform: dSafe(order.diff_flow_vs_platform || (order.flow_amount - order.platform_amount)),
          localVsPlatform: dSafe(order.diff_delivery_vs_platform || order.amountDiff),
        },
        reason: order.discrepancy_reason || order.reason || order.raw_discrepancy_reason,
        carrier: order.carrier || order.carrier_name,
        merchantId: order.merchant_id || order.admin_id,
        deliveryStatus: order.delivery_status || order.deliveryStatus,
        platformOrderStatus: order.platform_order_status || order.platformOrderStatus,
      };
    });
  }, [result]);

  // 实时汇总统计 (深度兜底)
  const stats = React.useMemo(() => {
    const totalLocal = rows.reduce((sum, r) => sum + r.amounts.dispatch, 0);
    const totalFund = rows.reduce((sum, r) => sum + r.amounts.fund, 0);
    const totalPlatform = rows.reduce((sum, r) => sum + r.amounts.platform, 0);
    const matchedCount = rows.filter(r => r.status === 'matched').length;
    
    // 优先使用后端计算好的汇总，如果没有则使用前端实时算的
    const summary = result?.task || result?.data?.task || {};
    
    return {
      orderCount: summary.localOrderCount || rows.length,
      matchedCount: summary.matchedCount || matchedCount,
      totalLocalAmount: (result?.results || result?.data?.results)?.totalLocalAmount || totalLocal,
      totalFundAmount: (result?.results || result?.data?.results)?.totalFundAmount || totalFund,
      totalPlatformAmount: (result?.results || result?.data?.results)?.totalPlatformAmount || totalPlatform,
      matchRate: summary.match_rate || (rows.length > 0 ? (matchedCount / rows.length * 100).toFixed(1) : "0.0"),
    };
  }, [rows, result]);

  // 1. 核心能力：操作异常追踪 (单后消、已取消但扣款等)
  const anomalyOrders = React.useMemo(() => {
    return rows.filter(r => {
        // 异常场景1：状态是取消，但流水实扣 > 0
        const isCancelledWithCharge = (r.deliveryStatus?.includes('取消') || r.platformOrderStatus?.includes('取消')) && r.amounts.fund > 0;
        // 异常场景2：未配送完成，但有三方扣款
        const isUnfinishedWithCharge = r.deliveryStatus !== '配送完成' && r.amounts.platform > 0;
        // 异常场景3：系统应扣为0，但实际流水扣了钱
        const isPhantomCharge = r.amounts.dispatch === 0 && r.amounts.fund > 0;
        
        return isCancelledWithCharge || isUnfinishedWithCharge || isPhantomCharge;
    });
  }, [rows]);

  // 过滤订单
  const filtered = React.useMemo(() => {
    return rows.filter((r) => {
      const matchesQuery = query.trim() === "" ||
        r.orderNo.toLowerCase().includes(query.trim().toLowerCase());
      const matchesStatus = status === "all" || r.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [rows, query, status]);

  // 加载商户统计
  const [merchants, setMerchants] = React.useState<MerchantSummaryRow[]>([]);
  React.useEffect(() => {
    const taskId = locationState?.taskId;
    if (!taskId) return;
    
    get(`/reconciliation/results/${taskId}/by-merchant`)
      .then((res: any) => {
        if (res?.data?.data?.merchants) {
          setMerchants(res.data.data.merchants.map((m: any) => ({
            merchantId: m.merchant_id,
            adminId: m.admin_id,
            orderCount: m.unique_orders,
            deductionAmount: m.total_flow_amount,
            rechargeAmount: m.total_recharge_amount || 0,
            initialBalance: m.balance_before || 0,
            finalBalance: m.balance_after || 0,
            rewardAmount: m.new_customer_reward || 0,
          })));
        }
      });
  }, [locationState?.taskId]);

  // 页签状态
  const [activeTab, setActiveTab] = React.useState<'orders' | 'platforms' | 'merchants' | 'anomalies'>('orders');

  // 处理函数
  const handleOrderClick = (order: Row) => {
    setSelectedOrder(order);
    setShowDetailModal(true);
  };

  const handleMerchantClick = (mId: string) => {
    setSelectedMerchantId(mId);
    setShowMerchantModal(true);
  };

  // 状态检查
  if (loading) return <div style={{ padding: "100px", textAlign: "center", color: "#6b7280" }}>正在深度审计账单明细...</div>;
  if (!locationState?.taskId) return <div style={{ padding: "100px", textAlign: "center" }}>任务不存在</div>;

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: "#1f2937", padding: "24px", maxWidth: "1400px", margin: "0 auto" }}>
      {/* 头部标题区 */}
      <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>核心审计看板</h1>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "4px" }}>
            <span style={{ fontSize: "14px", color: "#6b7280" }}>{result?.task?.name}</span>
            <span style={{ padding: "2px 8px", backgroundColor: "#f3f4f6", borderRadius: "10px", fontSize: "12px", color: "#374151" }}>V2 智能引擎</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button onClick={() => navigate("/reconciliation")} style={{ padding: "8px 16px", border: "1px solid #d1d5db", borderRadius: "8px", backgroundColor: "white", cursor: "pointer", fontSize: "14px" }}>← 任务列表</button>
          <button style={{ padding: "8px 20px", backgroundColor: "#2563eb", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: 600 }}>同步至电子表格</button>
        </div>
      </div>

      {/* 核心财务指标 (基于有效订单) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px", marginBottom: "32px" }}>
        {[
          { label: "有效单量(去重)", value: stats.orderCount, unit: "单", color: "#111827" },
          { label: "配送应扣(预估)", value: stats.totalLocalAmount, prefix: "¥", color: "#3b82f6" },
          { label: "流水实扣(账单)", value: stats.totalFundAmount, prefix: "¥", color: "#10b981" },
          { label: "三方实收(成本)", value: stats.totalPlatformAmount, prefix: "¥", color: "#8b5cf6" },
          { label: "财务对齐率", value: stats.matchRate, unit: "%", color: "#2563eb" },
        ].map((item, idx) => (
          <div key={idx} style={{ backgroundColor: "white", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "10px" }}>{item.label}</div>
            <div style={{ fontSize: "24px", fontWeight: 800, color: item.color, fontFamily: "monospace" }}>
              {item.prefix}{item.value !== undefined ? (typeof item.value === 'number' ? item.value.toLocaleString(undefined, {minimumFractionDigits: 2}) : item.value) : '0'}
              <span style={{ fontSize: "14px", fontWeight: 400, marginLeft: "4px", color: "#9ca3af" }}>{item.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 审计功能切换 */}
      <div style={{ display: "flex", gap: "2px", marginBottom: "24px", borderBottom: "1px solid #e5e7eb" }}>
        {[
          { id: 'orders', label: '逐单穿透', icon: '🔍' },
          { id: 'merchants', label: '商户追踪', icon: '👤' },
          { id: 'anomalies', label: '操作异常分析', icon: '⚠️', count: anomalyOrders.length },
          { id: 'platforms', label: '各平台损益', icon: '📊' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: "16px 24px", fontSize: "15px", fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? "#2563eb" : "#616e7c", border: "none",
              borderBottom: activeTab === tab.id ? "3px solid #2563eb" : "3px solid transparent",
              backgroundColor: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px"
            }}
          >
            <span>{tab.icon}</span>
            {tab.label}
            {tab.count !== undefined && <span style={{ backgroundColor: tab.count > 0 ? "#ef4444" : "#e5e7eb", color: "white", padding: "1px 6px", borderRadius: "10px", fontSize: "11px" }}>{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* 视图内容 */}
      {activeTab === 'orders' && (
        <div style={{ backgroundColor: "white", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
            <h3 style={{ margin: 0, fontSize: "16px" }}>三方金额对比明细</h3>
            <div style={{ display: "flex", gap: "10px" }}>
               <input type="text" placeholder="搜索单号..." value={query} onChange={e => setQuery(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "14px" }} />
               <select value={status} onChange={e => setStatus(e.target.value as any)} style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px" }}>
                  <option value="all">所有审计状态</option>
                  <option value="exception">金额差异订单</option>
               </select>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
              <thead style={{ backgroundColor: "#f9fafb" }}>
                <tr>
                  <th style={{ textAlign: "left", padding: "12px" }}>订单号</th>
                  <th style={{ textAlign: "right", padding: "12px" }}>系统应扣</th>
                  <th style={{ textAlign: "right", padding: "12px" }}>流水实扣</th>
                  <th style={{ textAlign: "right", padding: "12px" }}>平台成本</th>
                  <th style={{ textAlign: "right", padding: "12px" }}>毛损益/差异</th>
                  <th style={{ textAlign: "center", padding: "12px" }}>审计意见</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "60px", textAlign: "center" }}>
                      {rows.length === 0 && ((result?.task || result?.data?.task)?.localOrderCount > 0) ? (
                        <div style={{ backgroundColor: "#fff7ed", border: "1px solid #ffedd5", padding: "20px", borderRadius: "12px", color: "#9a3412" }}>
                          <h4 style={{ margin: "0 0 10px 0" }}>⚠️ 对账结果为空 (匹配失败)</h4>
                          <p style={{ fontSize: "13px", margin: 0 }}>系统已解析到数据，但在比对过程中<b>未能自动匹配</b>到任何订单。这通常是因为【配送单】与【流水单】中没有相同的单号列，或者列名非标准。</p>
                          <p style={{ fontSize: "12px", marginTop: "8px", color: "#c2410c" }}>请检查 Excel 中是否包含「配送单号」或「订单编号」等列。</p>
                        </div>
                      ) : (
                        <span style={{ color: "#9ca3af" }}>未找到符合筛选条件的订单明细</span>
                      )}
                    </td>
                  </tr>
                ) : (
                  filtered.slice(0, 100).map(r => (
                    <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }} onClick={() => handleOrderClick(r)}>
                      <td style={{ padding: "14px 12px", fontFamily: "monospace" }}>{r.orderNo}</td>
                      <td style={{ padding: "14px 12px", textAlign: "right" }}>¥{formatMoney(r.amounts.dispatch)}</td>
                      <td style={{ padding: "14px 12px", textAlign: "right" }}>¥{formatMoney(r.amounts.fund)}</td>
                      <td style={{ padding: "14px 12px", textAlign: "right" }}>¥{formatMoney(r.amounts.platform)}</td>
                      <td style={{ padding: "14px 12px", textAlign: "right", fontWeight: 700, color: r.diffs.localVsPlatform !== 0 ? "#dc2626" : "#16a34a" }}>
                         {r.diffs.localVsPlatform > 0 ? '+' : ''}{formatMoney(r.diffs.localVsPlatform)}
                      </td>
                      <td style={{ padding: "14px 12px", textAlign: "center" }}>
                          <span style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "12px", backgroundColor: r.status === 'matched' ? "#dcfce7" : "#fee2e2", color: r.status === 'matched' ? "#16a34a" : "#dc2626" }}>
                              {r.status === 'matched' ? '通过' : '复核'}
                          </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'anomalies' && (
        <div style={{ backgroundColor: "#fff5f5", border: "1px solid #feb2b2", borderRadius: "12px", padding: "24px" }}>
            <div style={{ marginBottom: "20px" }}>
                <h3 style={{ margin: 0, color: "#c53030" }}>⚠️ 操作异常审计 (潜在资损点)</h3>
                <p style={{ fontSize: "14px", color: "#742a2a", marginTop: "4px" }}>追踪已取消或未完成，但仍有流水扣款、三方成本支出的订单</p>
            </div>
            {anomalyOrders.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: "#9b2c2c" }}>未发现操作异常订单，系统稳定性良好 ✅</div>
            ) : (
                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", backgroundColor: "white", borderCollapse: "collapse", fontSize: "14px", borderRadius: "8px", overflow: "hidden" }}>
                        <thead style={{ backgroundColor: "#fee2e2" }}>
                            <tr>
                                <th style={{ textAlign: "left", padding: "12px" }}>异常订单号</th>
                                <th style={{ textAlign: "left", padding: "12px" }}>配送状态</th>
                                <th style={{ textAlign: "right", padding: "12px" }}>流水扣除</th>
                                <th style={{ textAlign: "right", padding: "12px" }}>三方扣款</th>
                                <th style={{ textAlign: "left", padding: "12px" }}>特征识别</th>
                            </tr>
                        </thead>
                        <tbody>
                            {anomalyOrders.map(r => (
                                <tr key={r.id} style={{ borderBottom: "1px solid #fed7d7" }}>
                                    <td style={{ padding: "14px 12px", fontFamily: "monospace" }}>{r.orderNo}</td>
                                    <td style={{ padding: "14px 12px" }}>
                                        <span style={{ color: "#e53e3e", fontWeight: 600 }}>{r.deliveryStatus || '未知'}</span>
                                    </td>
                                    <td style={{ padding: "14px 12px", textAlign: "right", fontWeight: 600 }}>¥{formatMoney(r.amounts.fund)}</td>
                                    <td style={{ padding: "14px 12px", textAlign: "right", fontWeight: 600 }}>¥{formatMoney(r.amounts.platform)}</td>
                                    <td style={{ padding: "14px 12px", color: "#9b2c2c" }}>
                                        {r.amounts.fund > 0 && r.deliveryStatus?.includes('取消') ? '已取消仍扣费' : '未完成产生外部成本'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
      )}

      {activeTab === 'merchants' && (
        <div style={{ backgroundColor: "white", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "24px" }}>
            <div style={{ marginBottom: "20px" }}>
                <h3 style={{ margin: 0 }}>商户资金一致性追踪</h3>
                <p style={{ fontSize: "14px", color: "#6b7280", marginTop: "4px" }}>审计逻辑：期初 + 收入(充值/奖励) - 扣款 == 期末余额</p>
            </div>
            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                    <thead style={{ backgroundColor: "#f9fafb" }}>
                        <tr>
                            <th style={{ textAlign: "left", padding: "12px" }}>商户ID (admin_id)</th>
                            <th style={{ textAlign: "right", padding: "12px" }}>有效单量</th>
                            <th style={{ textAlign: "right", padding: "12px" }}>累计支出</th>
                            <th style={{ textAlign: "right", padding: "12px" }}>充值/获赠</th>
                            <th style={{ textAlign: "right", padding: "12px" }}>余额状态 (期初 → 期末)</th>
                            <th style={{ textAlign: "center", padding: "12px" }}>审计状态</th>
                        </tr>
                    </thead>
                    <tbody>
                        {merchants.map(m => {
                            const check = Math.abs((m.initialBalance + m.rechargeAmount + m.rewardAmount - m.deductionAmount) - m.finalBalance) < 0.1;
                            return (
                                <tr key={m.merchantId} style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }} onClick={() => handleMerchantClick(m.merchantId)}>
                                    <td style={{ padding: "16px 12px", fontWeight: 700 }}>{m.adminId || m.merchantId}</td>
                                    <td style={{ padding: "16px 12px", textAlign: "right" }}>{m.orderCount} 单</td>
                                    <td style={{ padding: "16px 12px", textAlign: "right" }}>¥{m.deductionAmount.toLocaleString()}</td>
                                    <td style={{ padding: "16px 12px", textAlign: "right", color: "#10b981" }}>¥{m.rechargeAmount + m.rewardAmount}</td>
                                    <td style={{ padding: "16px 12px", textAlign: "right", fontFamily: "monospace" }}>
                                        ¥{m.initialBalance.toLocaleString()} → <span style={{ fontWeight: 700 }}>¥{m.finalBalance.toLocaleString()}</span>
                                    </td>
                                    <td style={{ padding: "16px 12px", textAlign: "center" }}>
                                        <span style={{ padding: "4px 12px", borderRadius: "12px", fontSize: "12px", fontWeight: 600, backgroundColor: check ? "#dcfce7" : "#fee2e2", color: check ? "#16a34a" : "#dc2626" }}>
                                            {check ? "🟢 资金平衡" : "🔴 账目偏差"}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {/* 弹窗组件 */}
      {showDetailModal && selectedOrder && (
        <OrderDetailModal order={selectedOrder} onClose={() => setShowDetailModal(false)} />
      )}
      
      {showMerchantModal && selectedMerchantId && (
          <MerchantTrackerModal 
            merchantId={selectedMerchantId} 
            taskId={locationState?.taskId!} 
            onClose={() => setShowMerchantModal(false)} 
          />
      )}
    </div>
  );
}

/**
 * 订单详情深度审计弹窗
 */
function OrderDetailModal({ order, onClose }: { order: Row; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div style={{ backgroundColor: "white", borderRadius: "16px", padding: "32px", maxWidth: "600px", width: "95%", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
            <div>
                <h2 style={{ margin: 0, fontSize: "20px" }}>逐单穿透审计详情</h2>
                <div style={{ fontFamily: "monospace", color: "#6b7280", marginTop: "4px" }}>SN: {order.orderNo}</div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "24px", cursor: "pointer", color: "#9ca3af" }}>×</button>
        </div>

        <div style={{ display: "grid", gap: "20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div style={{ padding: "12px", backgroundColor: "#f9fafb", borderRadius: "8px" }}>
                    <div style={{ fontSize: "12px", color: "#6b7280" }}>配送平台</div>
                    <div style={{ fontWeight: 600 }}>{order.carrier}</div>
                </div>
                <div style={{ padding: "12px", backgroundColor: "#f9fafb", borderRadius: "8px" }}>
                    <div style={{ fontSize: "12px", color: "#6b7280" }}>交付状态</div>
                    <div style={{ fontWeight: 600, color: order.deliveryStatus === '配送完成' ? "#16a34a" : "#dc2626" }}>{order.deliveryStatus}</div>
                </div>
            </div>

            <div style={{ padding: "20px", border: "1px solid #e5e7eb", borderRadius: "12px" }}>
                 <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                    <span style={{ color: "#6b7280" }}>1. 系统逻辑(应该扣):</span>
                    <span style={{ fontWeight: 600 }}>¥{formatMoney(order.amounts.dispatch)}</span>
                 </div>
                 <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                    <span style={{ color: "#6b7280" }}>2. 聚合流水(实际扣):</span>
                    <span style={{ fontWeight: 600, color: "#10b981" }}>¥{formatMoney(order.amounts.fund)}</span>
                 </div>
                 <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "12px", borderBottom: "1px dashed #e5e7eb" }}>
                    <span style={{ color: "#6b7280" }}>3. 三方账单(支付平台):</span>
                    <span style={{ fontWeight: 600, color: "#8b5cf6" }}>¥{formatMoney(order.amounts.platform)}</span>
                 </div>
                 <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "12px" }}>
                    <span style={{ fontWeight: 700, fontSize: "16px" }}>审计差异 (1 vs 3):</span>
                    <span style={{ fontSize: "20px", fontWeight: 800, color: order.diffs.localVsPlatform !== 0 ? "#dc2626" : "#16a34a" }}>
                        ¥{formatMoney(order.diffs.localVsPlatform)}
                    </span>
                 </div>
            </div>
            
            {order.reason && (
                <div style={{ padding: "16px", backgroundColor: "#fffbeb", borderLeft: "4px solid #f59e0b", borderRadius: "4px", fontSize: "14px" }}>
                    <b style={{ color: "#92400e" }}>审计备注:</b> {order.reason}
                </div>
            )}
        </div>
        <button onClick={onClose} style={{ marginTop: "32px", width: "100%", padding: "14px", backgroundColor: "#2563eb", color: "white", border: "none", borderRadius: "10px", fontWeight: 700, cursor: "pointer" }}>完成审计确认</button>
      </div>
    </div>
  );
}

/**
 * 商户追踪明细弹窗
 */
function MerchantTrackerModal({ merchantId, taskId, onClose }: { merchantId: string; taskId: string; onClose: () => void }) {
    const [orders, setOrders] = React.useState<any[]>([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        get(`/reconciliation/results/${taskId}/orders`, { merchant_id: merchantId })
            .then((res: any) => {
                const data = res?.data?.data || res?.data || [];
                setOrders(Array.isArray(data) ? data : []);
            })
            .finally(() => setLoading(false));
    }, [merchantId, taskId]);

    return (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
            <div style={{ backgroundColor: "white", borderRadius: "16px", padding: "32px", maxWidth: "900px", width: "95%", height: "80vh", overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "24px" }}>
                    <div>
                        <h2 style={{ margin: 0 }}>商户全链路追踪 - {merchantId}</h2>
                        <span style={{ fontSize: "14px", color: "#6b7280" }}>查看该商户在本次对账周期内的所有交易明细</span>
                    </div>
                    <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "24px", cursor: "pointer" }}>×</button>
                </div>
                
                <div style={{ flex: 1, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                    {loading ? <div style={{ padding: "40px", textAlign: "center" }}>正在加载商户流水...</div> : (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                            <thead style={{ backgroundColor: "#f9fafb", position: "sticky", top: 0 }}>
                                <tr>
                                    <th style={{ textAlign: "left", padding: "12px" }}>时间</th>
                                    <th style={{ textAlign: "left", padding: "12px" }}>订单号</th>
                                    <th style={{ textAlign: "right", padding: "12px" }}>配送扣款</th>
                                    <th style={{ textAlign: "left", padding: "12px" }}>状态</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map(o => (
                                    <tr key={o.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                        <td style={{ padding: "12px" }}>{new Date(o.createdAt).toLocaleString()}</td>
                                        <td style={{ padding: "12px", fontFamily: "monospace" }}>{o.orderNumber}</td>
                                        <td style={{ padding: "12px", textAlign: "right", fontWeight: 600 }}>¥{o.fundAmount?.toFixed(2)}</td>
                                        <td style={{ padding: "12px" }}>{o.deliveryStatus}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                <button onClick={onClose} style={{ marginTop: "20px", padding: "12px", backgroundColor: "#f3f4f6", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>关闭</button>
            </div>
        </div>
    );
}

// 模拟 apiClient (内部 get 已经导出)
const apiClient = { get };
