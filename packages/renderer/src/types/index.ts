// 订单对账系统类型定义

// 平台枚举
export type Platform = 'shansong' | 'dada' | 'fengniao' | 'xunfeng' | 'xunfeng-c' | 'guoxiaodi' | 'uu';

// 平台信息
export interface PlatformInfo {
  id: Platform;
  name: string;
  icon: string;
  enabled: boolean;
  lastSync?: string;
  orderCount: number;
  matchRate: number;
}

// 订单状态
export type OrderStatus = 'pending' | 'matched' | 'exception' | 'fixed';

// 订单来源
export type OrderSource = 'local' | 'platform';

// 基础订单接口
export interface BaseOrder {
  orderId: string;
  platformOrderId: string;
  amount: number;
  createTime: Date;
  status: OrderStatus;
  source: OrderSource;
}

// 本地订单
export interface LocalOrder extends BaseOrder {
  source: 'local';
  deliveryOrderSn: string;
  customerName?: string;
  customerPhone?: string;
  address?: string;
}

// 平台订单
export interface PlatformOrder extends BaseOrder {
  source: 'platform';
  platformId: Platform;
  riderName?: string;
  riderPhone?: string;
}

// 联合订单（匹配后）
export interface MatchedOrder {
  localOrder: LocalOrder;
  platformOrder: PlatformOrder;
  matchStatus: 'perfect' | 'tolerance' | 'exception';
  amountDiff: number;
  amountDiffPercent: number;
}

// 对账任务
export interface ReconciliationTask {
  id: string;
  name: string;
  platformId: Platform;
  startDate: Date;
  endDate: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  localOrderCount: number;
  platformOrderCount: number;
  matchedCount: number;
  exceptionCount: number;
  totalAmount: number;
  matchedAmount: number;
  createdAt: Date;
  completedAt?: Date;
}

// 对账结果汇总
export interface ReconciliationResult {
  taskId: string;
  platformId: Platform;
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
  orders: MatchedOrder[];
}

// 文件上传
export interface UploadedFile {
  id: string;
  name: string;
  type: 'local' | 'platform';
  platformId?: Platform;
  size: number;
  rowCount: number;
  uploadedAt: Date;
  status: 'uploading' | 'completed' | 'failed';
  error?: string;
}

// 平台配置
export interface PlatformConfig {
  platformId: Platform;
  fieldMappings: FieldMapping[];
  tolerance: number;
  autoSync: boolean;
  syncInterval: number;
}

// 字段映射
export interface FieldMapping {
  localField: string;
  platformField: string;
  required: boolean;
}

// 对账规则
export interface ReconciliationRule {
  id: string;
  name: string;
  platformId?: Platform;
  tolerance: number;
  autoFix: boolean;
  ignoreAmountThreshold: number;
}

// 系统设置
export interface SystemSettings {
  language: string;
  timezone: string;
  theme: 'light' | 'dark';
  defaultReconciliationPeriod: number;
  sessionTimeout: number;
  loginNotifications: boolean;
  notificationPreferences: NotificationPreference[];
}

// 通知偏好
export interface NotificationPreference {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

// 对账汇总统计（历史页面用）
export interface MonthlyStats {
  month: string;
  totalOrders: number;
  matchedOrders: number;
  exceptionOrders: number;
  fixedOrders: number;
  matchRate: number;
  totalAmount: number;
}

// 预警信息
export interface Alert {
  id: string;
  type: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  time: string;
  platformId?: Platform;
  taskId?: string;
}
