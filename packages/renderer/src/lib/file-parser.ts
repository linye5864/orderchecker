import type { LocalOrder, PlatformOrder, Platform, FieldMapping } from '@/types';

/**
 * 文件解析结果
 */
export interface ParseResult<T> {
  success: boolean;
  data?: T[];
  error?: string;
  rowCount: number;
}

/**
 * 解析配置
 */
export interface ParseOptions {
  type: 'local' | 'platform';
  platformId?: Platform;
  fieldMappings: FieldMapping[];
}

/**
 * 解析 Excel/CSV 文件
 */
export async function parseFile(
  file: File,
  options: ParseOptions
): Promise<ParseResult<LocalOrder | PlatformOrder>> {
  const { type, platformId, fieldMappings } = options;

  try {
    // 动态导入 xlsx 库
    const XLSX = await import('xlsx');

    // 读取文件
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    // 获取第一个工作表
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return {
        success: false,
        error: '文件中没有工作表',
        rowCount: 0,
      };
    }

    const worksheet = workbook.Sheets[firstSheetName];

    // 转换为 JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (jsonData.length < 2) {
      return {
        success: false,
        error: '文件数据为空或只有表头',
        rowCount: 0,
      };
    }

    // 解析表头
    const headers = jsonData[0] as string[];
    const dataRows = jsonData.slice(1) as (string | number | undefined)[][];

    // 字段映射
    const fieldMap = createFieldMapping(headers, fieldMappings, type);

    if (!fieldMap.platformOrderId) {
      return {
        success: false,
        error: '未找到订单编号字段，请检查字段映射配置',
        rowCount: 0,
      };
    }

    // 解析数据行
    const orders: (LocalOrder | PlatformOrder)[] = [];
    const errors: string[] = [];

    dataRows.forEach((row, index) => {
      try {
        const order = parseRow(row, fieldMap, headers, type, platformId);
        if (order) {
          orders.push(order);
        }
      } catch (err) {
        errors.push(`第 ${index + 2} 行解析失败: ${err}`);
      }
    });

    if (orders.length === 0) {
      return {
        success: false,
        error: '未能解析任何有效数据行',
        rowCount: 0,
      };
    }

    return {
      success: true,
      data: orders,
      rowCount: orders.length,
    };
  } catch (err) {
    return {
      success: false,
      error: `文件解析失败: ${err instanceof Error ? err.message : '未知错误'}`,
      rowCount: 0,
    };
  }
}

/**
 * 创建字段映射
 */
function createFieldMapping(
  headers: string[],
  fieldMappings: FieldMapping[],
  type: 'local' | 'platform'
): Record<string, number> {
  const fieldMap: Record<string, number> = {};
  const headerLowerMap = new Map<string, number>();

  // 创建表头小写映射
  headers.forEach((header, index) => {
    headerLowerMap.set(header.toLowerCase().trim(), index);
  });

  // 遍历字段映射配置
  fieldMappings.forEach((mapping) => {
    // 尝试匹配本地字段名
    const headerIndex = headerLowerMap.get(mapping.localField.toLowerCase());
    if (headerIndex !== undefined) {
      fieldMap[mapping.localField] = headerIndex;
    }
  });

  return fieldMap;
}

/**
 * 解析单行数据
 */
function parseRow(
  row: (string | number | undefined)[],
  fieldMap: Record<string, number>,
  headers: string[],
  type: 'local' | 'platform',
  platformId?: Platform
): LocalOrder | PlatformOrder | null {
  const getValue = (field: string): string | number | undefined => {
    const index = fieldMap[field];
    if (index !== undefined && row[index] !== undefined) {
      const value = row[index];
      // 如果是日期格式，尝试转换
      if (typeof value === 'number') {
        // Excel 日期序列号
        if (value > 25569) { // 1970-01-01 之后的日期
          return value;
        }
        return value;
      }
      return String(value).trim();
    }
    return undefined;
  };

  const platformOrderId = getValue('platform_order_id') as string;
  if (!platformOrderId) {
    return null;
  }

  const amount = parseAmount(getValue('free') as string | number);
  const createTime = parseDate(getValue('createtime') as string | number | undefined, headers, row, fieldMap);

  if (type === 'local') {
    return {
      orderId: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      platformOrderId,
      amount,
      createTime,
      status: 'pending',
      source: 'local',
      deliveryOrderSn: getValue('delivery_order_sn') as string || platformOrderId,
      customerName: getValue('customer_name') as string | undefined,
      customerPhone: getValue('customer_phone') as string | undefined,
      address: getValue('address') as string | undefined,
    } as LocalOrder;
  } else {
    return {
      orderId: `platform_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      platformOrderId,
      amount,
      createTime,
      status: 'pending',
      source: 'platform',
      platformId: platformId || 'shansong',
      riderName: getValue('rider_name') as string | undefined,
      riderPhone: getValue('rider_phone') as string | undefined,
    } as PlatformOrder;
  }
}

/**
 * 解析金额
 */
function parseAmount(value: string | number | undefined): number {
  if (value === undefined || value === null || value === '') {
    return 0;
  }
  if (typeof value === 'number') {
    return Math.round(value * 100) / 100; // 保留两位小数
  }
  // 移除货币符号和千位分隔符
  const cleaned = String(value).replace(/[¥￥,$]/g, '').replace(/,/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
}

/**
 * 解析日期
 */
function parseDate(
  value: string | number | undefined,
  headers: string[],
  row: (string | number | undefined)[],
  fieldMap: Record<string, number>
): Date {
  if (value !== undefined) {
    // 如果是 Excel 日期序列号
    if (typeof value === 'number' && value > 25569) {
      const date = new Date(Math.round((value - 25569) * 86400 * 1000));
      return date;
    }
    // 尝试解析字符串日期
    const parsed = new Date(String(value));
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  // 尝试从其他时间字段获取
  const timeFields = ['create_time', 'created_at', 'timestamp', 'time'];
  for (const field of timeFields) {
    const index = fieldMap[field];
    if (index !== undefined && row[index] !== undefined) {
      const timeValue = row[index];
      if (typeof timeValue === 'number' && timeValue > 25569) {
        return new Date(Math.round((timeValue - 25569) * 86400 * 1000));
      }
      const parsed = new Date(String(timeValue));
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  // 默认返回当前时间
  return new Date();
}

/**
 * 验证文件格式
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  const validExtensions = ['.xlsx', '.xls', '.csv'];
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();

  if (!validExtensions.includes(extension)) {
    return {
      valid: false,
      error: `不支持的文件格式，请上传 ${validExtensions.join(' 或 ')} 格式的文件`,
    };
  }

  // 检查文件大小 (最大 10MB)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: '文件大小超过 10MB 限制',
    };
  }

  return { valid: true };
}

/**
 * 获取文件大小格式化字符串
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
