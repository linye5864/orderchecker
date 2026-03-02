/**
 * Core Reconciliation Engine - Three-way data cross-validation
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface DeliveryOrder {
  deliveryOrderSn: string;    // Delivery Order Number
  deliveryPlatform: string;   // Delivery Platform
  deliveryStatus: string;     // Delivery Status
  deliveryChannel: number;    // Delivery Channel
  free: number;               // Deduction Amount
  deliveryTime: string;       // Delivery Time
}

export interface PlatformOrder {
  orderSn: string;            // Order Number
  orderId: string;            // Platform Order ID
  orderStatus: string;        // Order Status
  orderAmount: number;        // Order Amount
  orderTime: string;          // Order Time
  platformType: string;       // Platform Type Identifier
}

export interface TransactionOrder {
  transactionSn: string;      // Transaction Number
  transactionTime: string;    // Transaction Time
  transactionType: string;    // Transaction Type
  transactionAmount: number;  // Transaction Amount
  balance: number;            // Balance
}

export interface MatchedOrder {
  deliveryOrderSn: string;
  platformOrderSn: string;
  transactionOrderSn: string | null;
  deliveryAmount: number;
  platformAmount: number;
  transactionAmount: number;
  isAmountMatched: boolean;
}

export interface ReconciliationConfig {
  tolerance?: number;
  platformId: string;
}

export interface ReconciliationResult {
  taskId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  summary: {
    totalOrders: number;
    matchedOrders: number;
    missingOrders: number;
    amountMismatchPlatform: number;
    amountMismatchTransaction: number;
    violationOrders: number;
    balanceErrors: number;
  };
  details: MatchedOrder[];
  exceptions: Exception[];
  statistics: {
    matchRate: number;
    totalDeliveryAmount: number;
    totalPlatformAmount: number;
    totalTransactionAmount: number;
    amountDifference: number;
  };
}

export interface Exception {
  type: 'MISSING' | 'AMOUNT_MISMATCH_PLATFORM' | 'AMOUNT_MISMATCH_TRANSACTION' | 'AMOUNT_MISMATCH_ALL' | 'VIOLATION' | 'BALANCE_ERROR' | 'DATA_INVALID';
  deliveryOrderSn?: string;
  platformOrderSn?: string;
  transactionOrderSn?: string;
  reason: string;
  diffAmount?: number;
  exceptionAmount?: number;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ============================================================================
// Platform Matching Rules (From Python)
// ============================================================================

interface PlatformRule {
  platformId: string;
  platformName: string;
  matchOrderSn: (deliverySn: string, platformSn: string) => boolean;
  getActualDeduction: (order: PlatformOrder) => number;
  getOrderStatus: (order: PlatformOrder) => string;
  getOrderSn: (order: PlatformOrder) => string;
}

const platformRules: Record<string, PlatformRule> = {
  'shansong': {
    platformId: 'shansong',
    platformName: '闪送',
    matchOrderSn: (deliverySn: string, platformSn: string) => {
      return deliverySn.replace(/,/g, '') === platformSn.replace(/,/g, '');
    },
    getActualDeduction: (order: PlatformOrder) => {
      const status = order.orderStatus;
      if (status === '已完成' || status === '已取消') {
        return parseFloat(order.orderAmount.toString());
      }
      return 0;
    },
    getOrderStatus: (order: PlatformOrder) => {
      return order.orderStatus || '未知';
    },
    getOrderSn: (order: PlatformOrder) => {
      return order.orderSn;
    },
  },
  'dada': {
    platformId: 'dada',
    platformName: '达达',
    matchOrderSn: (deliverySn: string, platformSn: string) => {
      return deliverySn === platformSn;
    },
    getActualDeduction: (order: PlatformOrder) => {
      const status = order.orderStatus;
      if (status === '已完成' || status === '已取消') {
        return parseFloat(order.orderAmount.toString());
      }
      return 0;
    },
    getOrderStatus: (order: PlatformOrder) => {
      return order.orderStatus || '未知';
    },
    getOrderSn: (order: PlatformOrder) => {
      return order.orderSn;
    },
  },
  'fengniao': {
    platformId: 'fengniao',
    platformName: '蜂鸟',
    matchOrderSn: (deliverySn: string, platformSn: string) => {
      return deliverySn === platformSn;
    },
    getActualDeduction: (order: PlatformOrder) => {
      const status = order.orderStatus;
      if (status === '已送达' || status === '配送异常' || status === '商户取消') {
        return parseFloat(order.orderAmount.toString());
      }
      return 0;
    },
    getOrderStatus: (order: PlatformOrder) => {
      return order.orderStatus || '未知';
    },
    getOrderSn: (order: PlatformOrder) => {
      return order.orderSn;
    },
  },
  'xunfeng': {
    platformId: 'xunfeng',
    platformName: '顺丰同城',
    matchOrderSn: (deliverySn: string, platformSn: string) => {
      return deliverySn === platformSn;
    },
    getActualDeduction: (order: PlatformOrder) => {
      const status = order.orderStatus;
      if (status === '已完成') {
        return parseFloat(order.orderAmount.toString());
      }
      return 0;
    },
    getOrderStatus: (order: PlatformOrder) => {
      return order.orderStatus || '未知';
    },
    getOrderSn: (order: PlatformOrder) => {
      return order.orderSn;
    },
  },
  'xunfeng-c': {
    platformId: 'xunfeng-c',
    platformName: '顺丰企业C',
    matchOrderSn: (deliverySn: string, platformSn: string) => {
      return deliverySn === platformSn;
    },
    getActualDeduction: (order: PlatformOrder) => {
      const status = order.orderStatus;
      if (status === '已完成') {
        return parseFloat(order.orderAmount.toString());
      }
      return 0;
    },
    getOrderStatus: (order: PlatformOrder) => {
      return order.orderStatus || '未知';
    },
    getOrderSn: (order: PlatformOrder) => {
      return order.orderSn;
    },
  },
  'guoxiaodi': {
    platformId: 'guoxiaodi',
    platformName: '裹小递',
    matchOrderSn: (deliverySn: string, platformSn: string) => {
      return deliverySn === platformSn;
    },
    getActualDeduction: (order: PlatformOrder) => {
      const status = order.orderStatus;
      if (status === '已完成' || status === '已退款') {
        return parseFloat(order.orderAmount.toString());
      }
      return 0;
    },
    getOrderStatus: (order: PlatformOrder) => {
      return order.orderStatus || '未知';
    },
    getOrderSn: (order: PlatformOrder) => {
      return order.orderSn;
    },
  },
  'uu': {
    platformId: 'uu',
    platformName: 'UU跑腿',
    matchOrderSn: (deliverySn: string, platformSn: string) => {
      return deliverySn === platformSn;
    },
    getActualDeduction: (order: PlatformOrder) => {
      const status = order.orderStatus;
      if (status === '完成') {
        return parseFloat(order.orderAmount.toString());
      }
      return 0;
    },
    getOrderStatus: (order: PlatformOrder) => {
      return order.orderStatus || '未知';
    },
    getOrderSn: (order: PlatformOrder) => {
      return order.orderSn;
    },
  },
};

export function getAllPlatformRules(): PlatformRule[] {
  return Object.values(platformRules);
}

export function getPlatformRule(platformId: string): PlatformRule | null {
  const rules = getAllPlatformRules();
  return rules.find(rule => rule.platformId === platformId) || null;
}

// ============================================================================
// Amount Comparison Logic
// ============================================================================

export interface ComparisonResult {
  status: 'PASS' | 'FAIL';
  reason: string;
  diffAmount?: number;
  exceptionType?: Exception['type'];
}

export function compareAmounts(
  deliveryAmount: number,
  platformAmount: number,
  transactionAmount: number,
  tolerance: number = 0.01
): ComparisonResult {
  // Exact match: all three amounts equal
  if (Math.abs(deliveryAmount - platformAmount) < tolerance &&
      Math.abs(platformAmount - transactionAmount) < tolerance) {
    return {
      status: 'PASS',
      reason: '三方金额一致',
    };
  }

  // Platform amount mismatch
  if (Math.abs(deliveryAmount - platformAmount) >= tolerance) {
    return {
      status: 'FAIL',
      exceptionType: 'AMOUNT_MISMATCH_PLATFORM',
      reason: `平台扣款差异 ${Math.abs(deliveryAmount - platformAmount).toFixed(2)} 元`,
      diffAmount: Math.abs(deliveryAmount - platformAmount),
    };
  }

  // Transaction amount mismatch
  if (Math.abs(deliveryAmount - transactionAmount) >= tolerance) {
    return {
      status: 'FAIL',
      exceptionType: 'AMOUNT_MISMATCH_TRANSACTION',
      reason: `商户流水差异 ${Math.abs(deliveryAmount - transactionAmount).toFixed(2)} 元`,
      diffAmount: Math.abs(deliveryAmount - transactionAmount),
    };
  }

  // All three amounts mismatch
  return {
    status: 'FAIL',
    exceptionType: 'AMOUNT_MISMATCH_ALL',
    reason: '三方金额均不一致',
  };
}

// ============================================================================
// Exception Detection Logic
// ============================================================================

export function detectException(
  deliveryOrder: DeliveryOrder,
  platformOrder: PlatformOrder | null,
  transactionOrder: TransactionOrder | null,
  config: ReconciliationConfig
): Exception | null {
  // Missing order: platform or transaction not found
  if (!platformOrder && !transactionOrder) {
    return {
      type: 'MISSING',
      deliveryOrderSn: deliveryOrder.deliveryOrderSn,
      reason: '平台或流水订单缺失',
      severity: 'HIGH',
    };
  }

  // Platform order missing
  if (!platformOrder) {
    return {
      type: 'MISSING',
      deliveryOrderSn: deliveryOrder.deliveryOrderSn,
      reason: '平台订单缺失',
      severity: 'HIGH',
    };
  }

  // Transaction order missing
  if (!transactionOrder) {
    return {
      type: 'MISSING',
      deliveryOrderSn: deliveryOrder.deliveryOrderSn,
      reason: '流水订单缺失',
      severity: 'MEDIUM',
    };
  }

  // Check for violation order (cancelled with amount)
  if (platformOrder.orderStatus.includes('已取消') &&
      typeof platformOrder.orderAmount === 'number' &&
      platformOrder.orderAmount > 0) {
    return {
      type: 'VIOLATION',
      deliveryOrderSn: deliveryOrder.deliveryOrderSn,
      platformOrderSn: platformOrder.orderSn,
      reason: `违约订单，违约金 ${platformOrder.orderAmount} 元`,
      exceptionAmount: platformOrder.orderAmount,
      severity: 'MEDIUM',
    };
  }

  return null;
}

// ============================================================================
// Order Number Matching
// ============================================================================

export function matchOrderNumber(
  deliveryOrderSn: string,
  platformSn: string,
  platformId: string
): boolean {
  const rule = getPlatformRule(platformId);
  if (!rule) {
    console.warn(`No matching rule for platform: ${platformId}`);
    return false;
  }

  return rule.matchOrderSn(deliveryOrderSn, platformSn);
}

export function normalizeOrderNumber(sn: string): string {
  return sn.trim().toUpperCase();
}

// ============================================================================
// Helper Functions
// ============================================================================

export function getPlatformById(platformId: string): PlatformRule | null {
  return getPlatformRule(platformId);
}

export function isStatusCompleted(status: string): boolean {
  const completedStatuses = ['已完成', '完成', '已送达', '已完成', '完成'];
  return completedStatuses.includes(status);
}

export function calculateMatchRate(
  totalOrders: number,
  matchedOrders: number
): number {
  return totalOrders > 0 ? Math.round((matchedOrders / totalOrders) * 10000) / 100 : 0;
}

export function formatAmount(amount: number): string {
  return `¥${(amount / 100).toFixed(2)}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

// ============================================================================
// Reconciliation Main Engine
// ============================================================================

/**
 * Execute reconciliation with three-way data matching
 */
export async function executeReconciliation(
  deliveryOrders: DeliveryOrder[],
  platformOrders: Record<string, PlatformOrder[]>,
  transactionOrders: TransactionOrder[],
  config: ReconciliationConfig
): Promise<ReconciliationResult> {
  const matchedOrders: MatchedOrder[] = [];
  const exceptions: Exception[] = [];

  // Create lookup maps for efficient access
  const platformOrderMap = new Map<string, PlatformOrder[]>();
  for (const [pid, orders] of Object.entries(platformOrders)) {
    platformOrderMap.set(pid, orders);
  }

  const transactionOrderMap = new Map<string, TransactionOrder>();
  for (const to of transactionOrders) {
    transactionOrderMap.set(to.transactionSn, to);
  }

  // Process each delivery order
  for (const delivery of deliveryOrders) {
    const deliveryOrderSn = normalizeOrderNumber(delivery.deliveryOrderSn);

    // 1. Find matching platform order
    const platformOrder = platformOrderMap.get(delivery.deliveryPlatform)?.find(po =>
      normalizeOrderNumber(po.orderSn) === deliveryOrderSn
    );

    // 2. Find matching transaction order
    const transactionOrder = transactionOrderMap.get(deliveryOrderSn);

    // 3. Compare amounts
    const comparison = compareAmounts(
      delivery.free,
      platformOrder ? parseFloat(platformOrder.orderAmount.toString()) : 0,
      transactionOrder ? parseFloat(transactionOrder.transactionAmount.toString()) : 0,
      config.tolerance || 0.01
    );

    if (comparison.status === 'PASS') {
      // Matched order
      matchedOrders.push({
        deliveryOrderSn: deliveryOrderSn,
        platformOrderSn: platformOrder?.orderSn || '',
        transactionOrderSn: transactionOrder?.transactionSn || '',
        deliveryAmount: delivery.free,
        platformAmount: platformOrder ? parseFloat(platformOrder.orderAmount.toString()) : 0,
        transactionAmount: transactionOrder ? parseFloat(transactionOrder.transactionAmount.toString()) : 0,
        isAmountMatched: true,
      });
    } else {
      // Check exception type
      const exception = detectException(
        delivery,
        platformOrder || null,
        transactionOrder || null,
        config
      );

      if (exception) {
        exceptions.push(exception);
      }

      // Add to matched with exception info
      matchedOrders.push({
        deliveryOrderSn: deliveryOrderSn,
        platformOrderSn: platformOrder?.orderSn || '',
        transactionOrderSn: transactionOrder?.transactionSn || '',
        deliveryAmount: delivery.free,
        platformAmount: platformOrder ? parseFloat(platformOrder.orderAmount.toString()) : 0,
        transactionAmount: transactionOrder ? parseFloat(transactionOrder.transactionAmount.toString()) : 0,
        isAmountMatched: false,
      });
    }
  }

  // Calculate statistics
  const totalOrders = deliveryOrders.length;
  const matchedCount = matchedOrders.length;
  const missingCount = exceptions.filter(e => e.type === 'MISSING').length;
  const totalDeliveryAmount = deliveryOrders.reduce((sum, d) => sum + parseFloat(d.free.toString()), 0);
  const totalPlatformAmount = Object.values(platformOrders).reduce((sum, orders) => {
    const total = orders.reduce((acc, order) => acc + (parseFloat(order.orderAmount.toString()) || 0), 0);
    return sum + total;
  }, 0);
  const totalTransactionAmount = transactionOrders.reduce((sum, t) => sum + (parseFloat(t.transactionAmount.toString()) || 0), 0);

  const matchRate = calculateMatchRate(totalOrders, matchedCount);
  const amountDifference = Math.abs(totalDeliveryAmount - totalPlatformAmount);

  // Generate task ID
  const taskId = `REC-${Date.now()}`;

  const result: ReconciliationResult = {
    taskId,
    status: 'COMPLETED',
    summary: {
      totalOrders,
      matchedOrders: matchedCount,
      missingOrders: missingCount,
      amountMismatchPlatform: exceptions.filter(e => e.type === 'AMOUNT_MISMATCH_PLATFORM').length,
      amountMismatchTransaction: exceptions.filter(e => e.type === 'AMOUNT_MISMATCH_TRANSACTION').length,
      violationOrders: exceptions.filter(e => e.type === 'VIOLATION').length,
      balanceErrors: exceptions.filter(e => e.type === 'BALANCE_ERROR').length,
    },
    details: matchedOrders,
    exceptions,
    statistics: {
      matchRate,
      totalDeliveryAmount,
      totalPlatformAmount,
      totalTransactionAmount,
      amountDifference,
    },
  };

  return result;
}
