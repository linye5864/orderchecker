/**
 * 文件解析服务
 * 支持 Excel (.xlsx, .xls) 和 CSV 文件解析
 * 提供统一的解析接口和平台适配
 */

import xlsx from 'xlsx';
import Papa from 'papaparse';
import { createError } from '../utils/error.js';

// ==================== 数据模型 ====================

/**
 * 配送单订单
 */
export interface DeliveryOrder {
  deliveryOrderSn: string;      // 配送单订单号
  deliveryPlatform: string;        // 发单运力 (闪送/达达/蜂鸟等)
  deliveryStatus: string;          // 配送状态 (配送完成/配送取消等)
  deliveryChannel: number;         // 0=本地订单, 1=第三方接单
  free: number;                   // 扣款金额 (元)
  createdAt?: Date;
}

/**
 * 第三方平台订单 (闪送/达达/蜂鸟等)
 */
export interface PlatformOrder {
  thirdPartyOrderNumber: string;     // 三方订单编号
  orderNumber: string;              // 平台订单编号
  orderStatus: string;              // 订单状态
  paidAmount: number;               // 实付金额(元)
  cancelDeductionAmount: number;    // 取消单扣款金额(元)
  createdAt?: Date;
}

/**
 * 商户流水订单
 */
export interface FlowOrder {
  adminId: string;       // 商户号
  type: number;          // 1=订单扣款, 2=新客奖励, 3=充值
  method: number;         // 1=银行卡, 2=微信, 3=支付宝
  money: number;         // 金额
  deliveryOrderId?: string; // 订单号
  createdAt?: Date;
}

/**
 * 解析结果
 */
export interface ParseResult<T> {
  success: boolean;
  data: T[];
  error?: string;
  meta?: {
    rowCount: number;
    sheets?: string[];
    filename: string;
  };
}

/**
 * 文件类型
 */
export type FileType = 'EXCEL' | 'CSV';

/**
 * 数据源类型
 */
export type DataSource = 'LOCAL' | 'PLATFORM' | 'FLOW';

// ==================== 平台适配器 ====================

/**
 * 平台配置接口
 */
export interface PlatformAdapter {
  platformId: string;                    // 平台ID (shansong, dada, fengniao, xunfeng, etc.)
  platformName: string;                  // 平台显示名称
  matchFields: {
    local: string;       // 配送单订单号字段名
    thirdParty: string; // 平台订单编号字段名
  };
  /**
   * 获取订单匹配的键值
   * @param deliveryOrderSn 配送单订单号
   * @returns 用于匹配的平台订单号键
   */
  getMatchKey(deliveryOrderSn: string): string;
  /**
   * 判断订单是否有效（用于统计）
   * @param order 平台订单
   * @returns 是否为有效订单
   */
  isValidOrder(order: PlatformOrder): boolean;
  /**
   * 获取订单实际扣款金额
   * @param order 平台订单
   * @returns 实际扣款金额
   */
  getActualDeduction(order: PlatformOrder): number;
}

/**
 * 闪送平台适配器
 */
export class ShanSongAdapter implements PlatformAdapter {
  platformId = 'shansong' as const;
  platformName = '闪送';

  matchFields = {
    local: 'deliveryOrderSn',
    thirdParty: 'thirdPartyOrderNumber',
  };

  getMatchKey(deliveryOrderSn: string): string {
    // 闪送订单后面多了一个','
    return deliveryOrderSn + ',';
  }

  isValidOrder(order: PlatformOrder): boolean {
    // 闪送完成
    return order.orderStatus === '闪送完成';
  }

  getActualDeduction(order: PlatformOrder): number {
    if (this.isValidOrder(order)) {
      return order.paidAmount;
    }
    return order.cancelDeductionAmount;
  }
}

/**
 * 顺丰企业C平台适配器
 */
export class XunFengCAdapter implements PlatformAdapter {
  platformId = 'xunfeng-c' as const;
  platformName = '顺丰企业C';

  matchFields = {
    local: 'deliveryOrderSn',
    thirdParty: 'platformOrderId',  // 顺丰企业C使用 platform_order_id
  };

  getMatchKey(deliveryOrderSn: string): string {
    return deliveryOrderSn;
  }

  isValidOrder(order: PlatformOrder): boolean {
    return order.orderStatus === '已完成';
  }

  getActualDeduction(order: PlatformOrder): number {
    if (this.isValidOrder(order)) {
      return order.paidAmount;
    }
    return order.cancelDeductionAmount;
  }
}

/**
 * 裹小递平台适配器
 */
export class GuoxiaodiAdapter implements PlatformAdapter {
  platformId = 'guoxiaodi' as const;
  platformName = '裹小递';

  matchFields = {
    local: 'deliveryOrderSn',
    thirdParty: 'platformOrderId',
  };

  getMatchKey(deliveryOrderSn: string): string {
    return deliveryOrderSn;
  }

  isValidOrder(order: PlatformOrder): boolean {
    return order.orderStatus === '已完成';
  }

  getActualDeduction(order: PlatformOrder): number {
    if (this.isValidOrder(order)) {
      return order.paidAmount;
    }
    return order.cancelDeductionAmount;
  }
}

/**
 * 默认平台适配器（达达、蜂鸟、UU跑腿等）
 */
export class DefaultPlatformAdapter implements PlatformAdapter {
  constructor(
    public platformId: string,
    public platformName: string
  ) {}

  matchFields = {
    local: 'deliveryOrderSn',
    thirdParty: 'thirdPartyOrderNumber',
  };

  getMatchKey(deliveryOrderSn: string): string {
    return deliveryOrderSn;
  }

  isValidOrder(order: PlatformOrder): boolean {
    return ['已完成', '闪送完成', '配送完成'].includes(order.orderStatus);
  }

  getActualDeduction(order: PlatformOrder): number {
    if (this.isValidOrder(order)) {
      return order.paidAmount;
    }
    return order.cancelDeductionAmount || 0;
  }
}

// ==================== 平台适配器工厂 ====================

const platformAdapters: Record<string, PlatformAdapter> = {
  'shansong': new ShanSongAdapter(),
  'xunfeng-c': new XunFengCAdapter(),
  'guoxiaodi': new GuoxiaodiAdapter(),
  'dada': new DefaultPlatformAdapter('dada', '达达'),
  'fengniao': new DefaultPlatformAdapter('fengniao', '蜂鸟'),
  'xunfeng': new DefaultPlatformAdapter('xunfeng', '顺丰同城'),
  'uu': new DefaultPlatformAdapter('uu', 'UU跑腿'),
};

export function getPlatformAdapter(platformId: string): PlatformAdapter {
  return platformAdapters[platformId] || new DefaultPlatformAdapter(platformId, platformId);
}

// ==================== Excel 解析 ====================

/**
 * 解析 Excel 文件
 */
export function parseExcel<T>(
  buffer: Buffer,
  options: {
    sheetName?: string;
    headerRow?: number;
    dateFormat?: string;
  } = {}
): ParseResult<T> {
  try {
    const workbook = xlsx.read(buffer, {
      type: 'buffer',
      cellDates: true,
      cellNF: false,
    });

    const sheetName = options.sheetName || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" not found`);
    }

    const jsonData = xlsx.utils.sheet_to_json<T>(sheet, {
      header: options.headerRow ?? 1,
      raw: false,
      defval: null as any,
    });

    return {
      success: true,
      data: jsonData,
      meta: {
        rowCount: jsonData.length,
        sheets: workbook.SheetNames,
        filename: '',
      },
    };
  } catch (error) {
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 检测 Excel 文件类型 (配送单/平台账单/流水账单)
 */
export function detectExcelType(
  buffer: Buffer,
  filename: string
): DataSource {
  try {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames.join(', ');

    // 根据文件名和 sheet 名称推断
    if (filename.includes('配送单')) {
      return 'LOCAL';
    }
    if (filename.includes('流水')) {
      return 'FLOW';
    }

    // 根据 sheet 名称推断平台
    if (sheetNames.includes('汇总信息') && sheetNames.includes('订单明细')) {
      return 'PLATFORM';
    }
    if (sheetNames.includes('订单明细')) {
      return 'PLATFORM';
    }

    return 'LOCAL';
  } catch {
    return 'LOCAL';
  }
}

// ==================== CSV 解析 ====================

/**
 * 解析 CSV 文件
 */
export async function parseCSV<T>(
  buffer: Buffer,
  options: {
    encoding?: string;
    header?: boolean;
    skipEmptyLines?: boolean;
  } = {}
): Promise<ParseResult<T>> {
  try {
    // 尝试使用指定编码读取，回退到 utf-8
    let content: string;
    try {
      const encoding = options.encoding === 'gbk' ? 'gbk' : 'utf-8';
      content = buffer.toString(encoding as BufferEncoding);
    } catch {
      content = buffer.toString('utf-8');
    }

    return new Promise((resolve) => {
      Papa.parse<T>(content, {
        header: options.header !== false,
        skipEmptyLines: options.skipEmptyLines !== false,
        complete: (results) => {
          resolve({
            success: true,
            data: Array.isArray(results.data) ? results.data : [],
            meta: {
              rowCount: Array.isArray(results.data) ? results.data.length : 0,
              filename: '',
            },
          });
        },
        error: (error) => {
          resolve({
            success: false,
            data: [],
            error: error?.message || 'Parse error',
          });
        },
      });
    });
  } catch (error) {
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ==================== 字段映射 ====================

/**
 * 配送单字段映射 (配送单.xlsx)
 */
export const DELIVERY_ORDER_FIELD_MAP: Record<string, string> = {
  '配送单订单号': 'deliveryOrderSn',
  '发单运力': 'deliveryPlatform',
  '配送状态': 'deliveryStatus',
  'delivery_channel': 'deliveryChannel',
  'free': 'free',
  '下单时间': 'createdAt',
};

/**
 * 闪送字段映射
 */
export const SHANSONG_FIELD_MAP: Record<string, string> = {
  '三方订单编号': 'thirdPartyOrderNumber',
  '订单编号': 'orderNumber',
  '订单状态': 'orderStatus',
  '实付金额(元)': 'paidAmount',
  '取消单扣款金额(元)': 'cancelDeductionAmount',
};

/**
 * 商户流水字段映射
 */
export const FLOW_FIELD_MAP: Record<string, string> = {
  'admin_id': 'adminId',
  'type': 'type',
  'method': 'method',
  'money': 'money',
  'delivery_order_id': 'deliveryOrderId',
};

/**
 * 通用字段映射
 */
export const COMMON_FIELD_MAP: Record<string, string> = {
  '订单号': 'orderNumber',
  '订单编号': 'orderNumber',
  '三方订单编号': 'thirdPartyOrderNumber',
  '订单状态': 'orderStatus',
  '金额': 'amount',
};

// ==================== 数据验证 ====================

/**
 * 验证配送单数据
 */
export function validateDeliveryOrders(orders: any[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!orders || orders.length === 0) {
    return { valid: false, errors: ['文件为空'] };
  }

  // 检查必填字段
  const requiredFields = ['配送单订单号', '发单运力', 'free'];
  requiredFields.forEach((field) => {
    if (!orders[0].hasOwnProperty(field)) {
      errors.push(`缺少必填字段: ${field}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 验证平台订单数据
 */
export function validatePlatformOrders(orders: any[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!orders || orders.length === 0) {
    return { valid: false, errors: ['文件为空'] };
  }

  // 检查必填字段
  const hasOrderNumber = orders[0].hasOwnProperty('订单编号') ||
                          orders[0].hasOwnProperty('三方订单编号');

  if (!hasOrderNumber) {
    errors.push('缺少订单编号字段');
  }
  if (!orders[0].hasOwnProperty('订单状态')) {
    errors.push('缺少订单状态字段');
  }
  if (!orders[0].hasOwnProperty('实付金额(元)') && !orders[0].hasOwnProperty('支付金额')) {
    errors.push('缺少金额字段');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 验证流水数据
 */
export function validateFlowData(data: any[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!data || data.length === 0) {
    return { valid: false, errors: ['文件为空'] };
  }

  const requiredFields = ['admin_id', 'type', 'method', 'money'];
  requiredFields.forEach((field) => {
    if (!data[0].hasOwnProperty(field)) {
      errors.push(`缺少必填字段: ${field}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ==================== 工具函数 ====================

/**
 * 根据文件扩展名获取文件类型
 */
export function getFileType(filename: string): FileType {
  const ext = filename.toLowerCase().split('.').pop();
  if (['xlsx', 'xls'].includes(ext || '')) {
    return 'EXCEL';
  }
  if (['csv'].includes(ext || '')) {
    return 'CSV';
  }
  return 'EXCEL'; // 默认为 Excel
}

/**
 * 清理订单号（去除空格和特殊字符）
 */
export function cleanOrderNumber(orderNumber: string): string {
  return orderNumber.trim().replace(/\s+/g, '');
}

/**
 * 格式化金额（字符串转数字）
 */
export function parseAmount(amount: any): number {
  if (typeof amount === 'number') {
    return Math.round(amount * 100) / 100;
  }
  if (typeof amount === 'string') {
    // 去除逗号、空格、货币符号
    const cleaned = amount.replace(/[,，\s元￥\$]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
  }
  return 0;
}

/**
 * 计算匹配率
 */
export function calculateMatchRate(matched: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((matched / total) * 10000) / 100;
}
