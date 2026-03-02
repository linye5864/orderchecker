/**
 * 对账核心逻辑调试脚本
 * 直接使用文件路径进行对账，输出详细日志
 * 
 * 使用方法: cd packages/server && npx tsx scripts/debug-reconciliation.ts
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件所在目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 导入文件解析服务
import {
  parseExcel,
  parseAmount,
  cleanOrderNumber,
  getPlatformAdapter,
  type DeliveryOrder,
  type PlatformOrder,
} from '../src/services/file-parser.service.js';

// 导入对账服务
import {
  setTaskCancellation,
  isTaskCancelled,
  type ReconciliationSummary,
} from '../src/services/reconciliation.service.js';

// ==================== 配置 ====================

// 上传目录路径
const UPLOADS_DIR = path.resolve(__dirname, '../uploads');

// 调试任务ID
const TASK_ID = `DEBUG-${Date.now()}`;

// 平台ID (根据实际文件调整)
const PLATFORM_ID = 'shansong';

// 容差 (元)
const TOLERANCE = 0.01;

// ==================== 工具函数 ====================

function formatMoney(cents: number): string {
  if (cents === undefined || cents === null) return '-';
  return (cents / 100).toFixed(2);
}

function formatDate(date: Date | undefined): string {
  if (!date) return '-';
  return date.toLocaleString('zh-CN');
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(80));
  console.log(`  ${title}`);
  console.log('='.repeat(80));
}

function logSubsection(title: string) {
  console.log('\n--- ' + title + ' ---');
}

// ==================== 解析函数 (从 reconciliation.service.ts 复制) ====================

/**
 * 解析配送单文件 (带无表头支持)
 */
async function parseDeliveryOrders(
  filePath: string,
  taskId: string,
  onProgress?: (progress: number, message: string) => void
): Promise<DeliveryOrder[]> {
  console.log(`[DEBUG] parseDeliveryOrders: 读取文件 ${filePath}`);

  // 检查是否已取消
  if (isTaskCancelled(taskId)) {
    throw new Error('任务已取消');
  }

  const buffer = await fs.readFile(filePath);
  
  // 首先尝试用 headerRow: 1 解析
  let result = parseExcel<any>(buffer, { headerRow: 1 });
  
  // 如果解析失败或列名是数字，尝试不用 header
  if (!result.success || !result.data || result.data.length === 0) {
    result = parseExcel<any>(buffer, {});
  }
  
  console.log(`[DEBUG] parseDeliveryOrders: parseExcel success=${result.success}, data.length=${result.data?.length || 0}`);

  if (!result.success || !result.data) {
    return [];
  }

  // 显示前几行的列名
  if (result.data.length > 0) {
    const columns = Object.keys(result.data[0]);
    console.log(`[DEBUG] parseDeliveryOrders: 列名=${columns.slice(0, 10).join(', ')}`);
    
    // 检测是否为数字列名（无表头情况）
    const isNumericColumns = columns.every(col => /^\d+$/.test(col));
    console.log(`[DEBUG] parseDeliveryOrders: isNumericColumns=${isNumericColumns}`);
    
    if (isNumericColumns) {
      // 无表头情况：根据位置映射字段
      // 假设列顺序为：配送单订单号, 发单运力, 配送状态, delivery_channel, free, 下单时间
      return result.data
        .map((row: any) => {
          const values = Object.values(row);
          const deliveryOrderSn = String(values[0] || '');
          const freeValue = values[4];
          
          // 只保留有订单号和金额的行
          if (!deliveryOrderSn || freeValue === undefined || freeValue === null || freeValue === '') {
            return null;
          }
          
          // 处理时间字段
          let createdAt: Date | undefined;
          if (values[5]) {
            try {
              const dateVal = values[5];
              if (typeof dateVal === 'string' || typeof dateVal === 'number') {
                createdAt = new Date(dateVal);
              } else if (dateVal instanceof Date) {
                createdAt = dateVal;
              }
            } catch {
              // 忽略无效日期
            }
          }
          
          return {
            deliveryOrderSn: cleanOrderNumber(deliveryOrderSn),
            deliveryPlatform: String(values[1] || ''),
            deliveryStatus: String(values[2] || ''),
            deliveryChannel: parseInt(String(values[3] || 0)),
            free: parseAmount(freeValue),
            createdAt,
          };
        })
        .filter((order: DeliveryOrder | null) => order !== null && order.deliveryOrderSn);
    }
  }

  // 正常情况：有表头
  const filtered = result.data
    .filter((row) => row['配送单订单号'] && row['free'] !== undefined);

  console.log(`[DEBUG] parseDeliveryOrders: 过滤后数量=${filtered.length}`);

  return filtered
    .map((row) => ({
      deliveryOrderSn: cleanOrderNumber(row['配送单订单号'] || ''),
      deliveryPlatform: row['发单运力'] || '',
      deliveryStatus: row['配送状态'] || '',
      deliveryChannel: parseInt(row['delivery_channel'] || 0),
      free: parseAmount(row['free']),
      createdAt: row['下单时间'] ? new Date(row['下单时间']) : undefined,
    }));
}

/**
 * 解析平台订单文件 (带无表头支持)
 */
async function parsePlatformOrders(
  filePath: string,
  platformId: string,
  taskId: string,
  onProgress?: (progress: number, message: string) => void
): Promise<PlatformOrder[]> {
  console.log(`[DEBUG] parsePlatformOrders: 读取文件 ${filePath}, platformId=${platformId}`);

  // 检查是否已取消
  if (isTaskCancelled(taskId)) {
    throw new Error('任务已取消');
  }

  const buffer = await fs.readFile(filePath);

  // 根据平台获取解析选项
  const adapter = getPlatformAdapter(platformId);
  console.log(`[DEBUG] parsePlatformOrders: adapter.platformId=${adapter.platformId}`);

  // 首先尝试指定 sheet 的解析
  let result;
  let parseOptions;
  
  if (adapter.platformId === 'shansong') {
    // 闪送平台：尝试"订单明细" sheet
    parseOptions = { sheetName: '订单明细' };
    result = parseExcel<any>(buffer, parseOptions);
    
    // 如果失败，回退到第一个 sheet
    if (!result.success || !result.data || result.data.length === 0) {
      console.log(`[DEBUG] parsePlatformOrders: "订单明细" sheet 不存在或为空，尝试第一个 sheet`);
      parseOptions = {};
      result = parseExcel<any>(buffer, parseOptions);
    }
  } else {
    parseOptions = {};
    result = parseExcel<any>(buffer, parseOptions);
  }

  console.log(`[DEBUG] parsePlatformOrders: parseExcel success=${result.success}, data.length=${result.data?.length || 0}`);

  if (!result.success || !result.data) {
    return [];
  }

  // 显示前几行的列名
  if (result.data.length > 0) {
    const columns = Object.keys(result.data[0]);
    console.log(`[DEBUG] parsePlatformOrders: 列名=${columns.slice(0, 10).join(', ')}`);
    
    // 检测是否为数字列名（无表头情况）
    const isNumericColumns = columns.every(col => /^\d+$/.test(col));
    console.log(`[DEBUG] parsePlatformOrders: isNumericColumns=${isNumericColumns}`);
    
    if (isNumericColumns) {
      // 无表头情况：根据位置映射字段
      // 闪送平台列顺序：三方订单编号, 订单编号, 订单状态, 实付金额(元), 取消单扣款金额(元)
      return result.data
        .map((row: any) => {
          const values = Object.values(row);
          const orderNumber = String(values[1] || '');
          
          if (!orderNumber) {
            return null;
          }
          
          return {
            thirdPartyOrderNumber: cleanOrderNumber(String(values[0] || '')),
            orderNumber: orderNumber,
            orderStatus: String(values[2] || ''),
            paidAmount: parseAmount(values[3]),
            cancelDeductionAmount: parseAmount(values[4]),
            createdAt: undefined,
          };
        })
        .filter((order: PlatformOrder | null) => order !== null && order.orderNumber);
    }
  }

  // 正常情况：有表头
  // 根据平台使用不同的字段名
  const fieldMap = adapter.platformId === 'shansong' ? {
    thirdPartyOrderNumber: '三方订单编号',
    orderNumber: '订单编号',
    orderStatus: '订单状态',
    paidAmount: '实付金额(元)',
    cancelDeductionAmount: '取消单扣款金额(元)',
  } : adapter.platformId === 'xunfeng-c' ? {
    thirdPartyOrderNumber: '同城运单号',
    orderNumber: '订单号',
    orderStatus: '订单状态',
    paidAmount: '支付金额',
    cancelDeductionAmount: '取消单扣费',
  } : {
    thirdPartyOrderNumber: '三方订单编号',
    orderNumber: '订单编号',
    orderStatus: '订单状态',
    paidAmount: '实付金额(元)',
    cancelDeductionAmount: '取消单扣款金额(元)',
  };

  const filtered = result.data
    .filter((row) => row[fieldMap.orderNumber]);

  console.log(`[DEBUG] parsePlatformOrders: fieldMap=${JSON.stringify(fieldMap)}, 过滤后数量=${filtered.length}`);

  return filtered
    .map((row) => ({
      thirdPartyOrderNumber: cleanOrderNumber(row[fieldMap.thirdPartyOrderNumber] || ''),
      orderNumber: row[fieldMap.orderNumber] || '',
      orderStatus: row[fieldMap.orderStatus] || '',
      paidAmount: parseAmount(row[fieldMap.paidAmount]),
      cancelDeductionAmount: parseAmount(row[fieldMap.cancelDeductionAmount]),
      createdAt: row['下单时间'] ? new Date(row['下单时间']) : undefined,
    }));
}

// ==================== 主程序 ====================

async function main() {
  console.log('\n');
  console.log('█'.repeat(80));
  console.log('█                                                                    █');
  console.log('█           对账核心逻辑调试脚本 - Direct Reconciliation Debug        █');
  console.log('█                                                                    █');
  console.log('█'.repeat(80));
  
  logSection('1. 环境信息');
  console.log(`任务ID: ${TASK_ID}`);
  console.log(`平台ID: ${PLATFORM_ID}`);
  console.log(`容差: ${TOLERANCE}元`);
  console.log(`上传目录: ${UPLOADS_DIR}`);
  console.log(`当前时间: ${new Date().toLocaleString('zh-CN')}`);

  // ==================== Step 1: 查找文件 ====================
  logSection('2. 查找待对账文件');

  const files = await fs.readdir(UPLOADS_DIR);
  const xlsxFiles = files.filter(f => f.endsWith('.xlsx'));
  
  console.log(`\n目录中的文件数量: ${files.length}`);
  console.log(`Excel文件数量: ${xlsxFiles.length}`);
  
  if (xlsxFiles.length < 2) {
    console.error('❌ 错误: 需要至少2个Excel文件 (配送单和平台账单)');
    process.exit(1);
  }

  // 显示所有文件信息
  console.log('\n文件列表:');
  for (const file of xlsxFiles) {
    const filePath = path.join(UPLOADS_DIR, file);
    const stats = await fs.stat(filePath);
    console.log(`  📄 ${file}`);
    console.log(`     大小: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`     修改时间: ${stats.mtime.toLocaleString('zh-CN')}`);
    console.log(`     路径: ${filePath}`);
  }

  // ==================== Step 2: 识别并选择文件 ====================
  logSection('3. 选择对账文件');

  // 尝试自动识别文件类型
  const fileInfos = [];
  
  for (const file of xlsxFiles) {
    const filePath = path.join(UPLOADS_DIR, file);
    const buffer = await fs.readFile(filePath);
    
    // 解析Excel获取列名
    const result = parseExcel<any>(buffer, { headerRow: 1 });
    
    let fileType = '未知';
    let columns: string[] = [];
    
    if (result.success && result.data.length > 0) {
      columns = Object.keys(result.data[0]);
      
      // 根据列名判断文件类型
      const hasDispatchFields = ['配送单订单号', '发单运力', '配送状态', 'free'].some(f => columns.includes(f));
      const hasPlatformFields = ['订单编号', '三方订单编号', '订单状态', '实付金额'].some(f => columns.includes(f));
      const hasFlowFields = ['admin_id', 'type', 'money', 'delivery_order_id'].some(f => columns.includes(f));
      
      if (hasDispatchFields) fileType = '配送单 (LOCAL)';
      else if (hasPlatformFields) fileType = '平台账单 (PLATFORM)';
      else if (hasFlowFields) fileType = '流水账单 (FLOW)';
      else {
        // 检查是否为数字列名 (无表头)
        const isNumericColumns = columns.every(col => /^\d+$/.test(col));
        if (isNumericColumns) {
          fileType = '无表头文件 (需要手动指定)';
        }
      }
    }
    
    fileInfos.push({
      filename: file,
      filePath,
      type: fileType,
      columns,
      rowCount: result.data?.length || 0
    });
    
    console.log(`\n📄 ${file}:`);
    console.log(`   类型: ${fileType}`);
    console.log(`   数据行数: ${result.data?.length || 0}`);
    console.log(`   列名: ${columns.slice(0, 8).join(', ')}${columns.length > 8 ? '...' : ''}`);
  }

  // 尝试自动识别
  let localFile = fileInfos.find(f => f.type === '配送单 (LOCAL)');
  let platformFile = fileInfos.find(f => f.type === '平台账单 (PLATFORM)');
  let flowFile = fileInfos.find(f => f.type === '流水账单 (FLOW)');

  // 如果无法自动识别，尝试根据文件大小判断
  if (!localFile || !platformFile) {
    console.log('\n⚠️  自动识别失败，尝试根据大小判断...');
    
    // 通常配送单文件较小，平台账单文件较大
    const sortedBySize = [...fileInfos].sort((a, b) => a.rowCount - b.rowCount);
    
    if (!localFile && sortedBySize.length >= 1) {
      localFile = sortedBySize[0];
      console.log(`   选择 ${localFile.filename} 作为配送单 (根据行数较少)`);
    }
    if (!platformFile && sortedBySize.length >= 1) {
      platformFile = sortedBySize[sortedBySize.length - 1];
      console.log(`   选择 ${platformFile.filename} 作为平台账单 (根据行数最多)`);
    }
  }

  // 如果仍然无法识别，让用户手动指定
  if (!localFile && !platformFile) {
    console.log('\n⚠️  无法自动识别，使用手动选择:');
    localFile = fileInfos[0];
    platformFile = fileInfos[1];
    console.log(`   配送单: ${localFile.filename}`);
    console.log(`   平台账单: ${platformFile.filename}`);
  }

  if (!localFile) {
    console.error('\n❌ 错误: 无法识别配送单文件');
    process.exit(1);
  }
  if (!platformFile) {
    console.error('\n❌ 错误: 无法识别平台账单文件');
    process.exit(1);
  }

  console.log('\n✅ 已选择对账文件:');
  console.log(`   配送单: ${localFile.filename} (${localFile.rowCount}行)`);
  console.log(`   平台账单: ${platformFile.filename} (${platformFile.rowCount}行)`);
  if (flowFile) {
    console.log(`   流水账单: ${flowFile.filename}`);
  }

  // ==================== Step 3: 解析配送单 ====================
  logSection('4. 解析配送单文件');
  console.log(`\n文件: ${localFile.filename}`);
  console.log(`路径: ${localFile.filePath}`);

  const localOrders = await parseDeliveryOrders(
    localFile.filePath,
    TASK_ID,
    (progress, message) => {
      console.log(`   [进度 ${progress.toFixed(0)}%] ${message}`);
    }
  );

  console.log(`\n📊 配送单解析结果:`);
  console.log(`   有效订单数: ${localOrders.length}`);

  if (localOrders.length > 0) {
    console.log('\n   前5条订单数据:');
    console.log('   ' + '-'.repeat(76));
    console.log(`   | 序号 | 配送单号         | 发单运力 | 配送状态 | 金额(元) |`);
    console.log('   ' + '-'.repeat(76));
    
    localOrders.slice(0, 5).forEach((order, idx) => {
      console.log(`   | ${String(idx + 1).padEnd(4)} | ${order.deliveryOrderSn.substring(0, 14).padEnd(14)} | ${(order.deliveryPlatform || '-').substring(0, 6).padEnd(6)} | ${(order.deliveryStatus || '-').substring(0, 6).padEnd(6)} | ${formatMoney(order.free * 100).padEnd(10)} |`);
    });
    
    if (localOrders.length > 5) {
      console.log(`   ... 共 ${localOrders.length} 条`);
    }
    console.log('   ' + '-'.repeat(76));

    // 统计信息
    const statusCount: Record<string, number> = {};
    const platformCount: Record<string, number> = {};
    let totalAmount = 0;
    
    for (const order of localOrders) {
      statusCount[order.deliveryStatus] = (statusCount[order.deliveryStatus] || 0) + 1;
      platformCount[order.deliveryPlatform] = (platformCount[order.deliveryPlatform] || 0) + 1;
      totalAmount += order.free;
    }

    console.log('\n   📈 统计信息:');
    console.log(`     总订单数: ${localOrders.length}`);
    console.log(`     总金额: ¥${totalAmount.toFixed(2)}`);
    console.log(`     配送状态分布:`);
    for (const [status, count] of Object.entries(statusCount)) {
      console.log(`      - ${status || '未知'}: ${count} 单`);
    }
    console.log(`     运力分布:`);
    for (const [platform, count] of Object.entries(platformCount)) {
      console.log(`      - ${platform || '未知'}: ${count} 单`);
    }
  } else {
    console.log('\n   ⚠️  警告: 没有解析到有效的配送单数据!');
    console.log('   可能原因:');
    console.log('   - 文件没有表头行');
    console.log('   - 列名不匹配 (期望: 配送单订单号, 发单运力, 配送状态, free, 下单时间)');
    console.log('   - 所有订单都被过滤');
  }

  // ==================== Step 4: 解析平台账单 ====================
  logSection('5. 解析平台账单文件');
  console.log(`\n文件: ${platformFile.filename}`);
  console.log(`路径: ${platformFile.filePath}`);
  console.log(`平台ID: ${PLATFORM_ID}`);

  const platformOrders = await parsePlatformOrders(
    platformFile.filePath,
    PLATFORM_ID,
    TASK_ID,
    (progress, message) => {
      console.log(`   [进度 ${progress.toFixed(0)}%] ${message}`);
    }
  );

  console.log(`\n📊 平台账单解析结果:`);
  console.log(`   有效订单数: ${platformOrders.length}`);

  if (platformOrders.length > 0) {
    console.log('\n   前5条订单数据:');
    console.log('   ' + '-'.repeat(100));
    console.log(`   | 序号 | 三方订单号        | 平台订单号       | 订单状态 | 实付金额 | 取消扣款 |`);
    console.log('   ' + '-'.repeat(100));
    
    platformOrders.slice(0, 5).forEach((order, idx) => {
      console.log(`   | ${String(idx + 1).padEnd(4)} | ${order.thirdPartyOrderNumber.substring(0, 16).padEnd(16)} | ${order.orderNumber.substring(0, 15).padEnd(15)} | ${(order.orderStatus || '-').substring(0, 6).padEnd(6)} | ${formatMoney(order.paidAmount * 100).padEnd(10)} | ${formatMoney(order.cancelDeductionAmount * 100).padEnd(10)} |`);
    });
    
    if (platformOrders.length > 5) {
      console.log(`   ... 共 ${platformOrders.length} 条`);
    }
    console.log('   ' + '-'.repeat(100));

    // 统计信息
    const statusCount: Record<string, number> = {};
    let totalPaid = 0;
    let totalCancel = 0;
    
    for (const order of platformOrders) {
      statusCount[order.orderStatus] = (statusCount[order.orderStatus] || 0) + 1;
      totalPaid += order.paidAmount;
      totalCancel += order.cancelDeductionAmount;
    }

    console.log('\n   📈 统计信息:');
    console.log(`   总订单数: ${platformOrders.length}`);
    console.log(`   实付总额: ¥${totalPaid.toFixed(2)}`);
    console.log(`   取消扣款总额: ¥${totalCancel.toFixed(2)}`);
    console.log(`   订单状态分布:`);
    for (const [status, count] of Object.entries(statusCount)) {
      console.log(`      - ${status || '未知'}: ${count} 单`);
    }
  } else {
    console.log('\n   ⚠️  警告: 没有解析到有效的平台账单数据!');
  }

  // ==================== Step 5: 构建索引 ====================
  logSection('6. 构建平台订单索引');

  const adapter = getPlatformAdapter(PLATFORM_ID);
  console.log(`\n平台适配器: ${adapter.platformName} (${adapter.platformId})`);
  console.log(`匹配键生成规则: getMatchKey('TEST123') = '${adapter.getMatchKey('TEST123')}'`);

  const platformOrderMap = new Map<string, PlatformOrder>();
  let duplicateKeys = 0;

  for (const order of platformOrders) {
    const key = cleanOrderNumber(order.thirdPartyOrderNumber);
    if (platformOrderMap.has(key)) {
      duplicateKeys++;
    }
    platformOrderMap.set(key, order);
  }

  console.log(`\n📊 索引构建结果:`);
  console.log(`   平台订单总数: ${platformOrders.length}`);
  console.log(`   索引条目数: ${platformOrderMap.size}`);
  console.log(`   重复键数量: ${duplicateKeys}`);
  console.log(`   唯一键数量: ${platformOrderMap.size - duplicateKeys}`);

  // 显示一些示例索引
  console.log('\n   索引示例 (前5个):');
  let idx = 0;
  for (const [key, order] of platformOrderMap) {
    if (idx >= 5) break;
    console.log(`   [${key}] -> ${order.orderNumber} (${order.orderStatus}, ¥${order.paidAmount.toFixed(2)})`);
    idx++;
  }

  // ==================== Step 6: 核心对账 ====================
  logSection('7. 核心对账逻辑');

  if (localOrders.length === 0) {
    console.error('\n❌ 错误: 配送单数据为空，无法进行对账');
    process.exit(1);
  }
  if (platformOrders.length === 0) {
    console.error('\n❌ 错误: 平台账单数据为空，无法进行对账');
    process.exit(1);
  }

  console.log(`\n对账参数:`);
  console.log(`   配送单总数: ${localOrders.length}`);
  console.log(`   平台订单总数: ${platformOrders.length}`);
  console.log(`   平台ID: ${PLATFORM_ID}`);
  console.log(`   容差: ${TOLERANCE}元`);

  // 过滤有效订单 (配送完成 + 本地订单)
  const validLocalOrders = localOrders.filter(
    (o) => o.deliveryStatus === '配送完成' && o.deliveryChannel === 0
  );

  console.log(`\n有效订单筛选 (配送完成 且 deliveryChannel=0):`);
  console.log(`   原始订单数: ${localOrders.length}`);
  console.log(`   有效订单数: ${validLocalOrders.length}`);
  console.log(`   过滤掉的订单: ${localOrders.length - validLocalOrders.length}`);

  // 统计被过滤的原因
  const filteredByStatus: Record<string, number> = {};
  const filteredByChannel: Record<number, number> = {};
  
  for (const order of localOrders) {
    if (order.deliveryStatus !== '配送完成') {
      filteredByStatus[order.deliveryStatus] = (filteredByStatus[order.deliveryStatus] || 0) + 1;
    }
    if (order.deliveryChannel !== 0) {
      filteredByChannel[order.deliveryChannel] = (filteredByChannel[order.deliveryChannel] || 0) + 1;
    }
  }

  if (Object.keys(filteredByStatus).length > 0) {
    console.log('   按状态过滤:');
    for (const [status, count] of Object.entries(filteredByStatus)) {
      console.log(`      - ${status || '未知'}: ${count} 单`);
    }
  }
  if (Object.keys(filteredByChannel).length > 0) {
    console.log('   按渠道过滤:');
    for (const [channel, count] of Object.entries(filteredByChannel)) {
      console.log(`      - delivery_channel=${channel}: ${count} 单`);
    }
  }

  // 执行对账
  console.log('\n开始遍历对账...');

  const details: Array<{
    orderNumber: string;
    platformOrderNumber: string;
    status: string;
    localAmount: number;
    platformAmount: number;
    amountDiff: number;
    localStatus: string;
    platformStatus: string;
    reason?: string;
  }> = [];

  let matchedCount = 0;
  let exceptionCount = 0;
  let missingCount = 0;
  let perfectMatches = 0;
  let toleranceMatches = 0;
  let totalMatchedAmount = 0;
  let totalDiff = 0;

  const total = validLocalOrders.length;
  let processed = 0;

  for (const localOrder of validLocalOrders) {
    processed++;

    // 每处理10%输出一次进度
    if (processed % Math.max(1, Math.floor(total / 10)) === 0 || processed === total) {
      const progress = Math.round((processed / total) * 100);
      console.log(`   [${progress}%] 已处理 ${processed}/${total} 单`);
    }

    // 生成匹配键
    const matchKey = adapter.getMatchKey(localOrder.deliveryOrderSn);
    
    // 查找平台订单
    const platformOrder = platformOrderMap.get(matchKey);

    if (!platformOrder) {
      // 缺失
      missingCount++;
      details.push({
        orderNumber: localOrder.deliveryOrderSn,
        platformOrderNumber: '',
        status: 'MISSING',
        localAmount: localOrder.free,
        platformAmount: 0,
        amountDiff: -localOrder.free,
        localStatus: localOrder.deliveryStatus,
        platformStatus: '',
        reason: '平台账单中未找到该订单',
      });
      continue;
    }

    // 计算金额
    const platformActualAmount = adapter.getActualDeduction(platformOrder);
    const amountDiff = platformActualAmount - localOrder.free;
    const absDiff = Math.abs(amountDiff);

    if (absDiff < 0.01) {
      // 完全匹配
      matchedCount++;
      perfectMatches++;
      toleranceMatches++;
      totalMatchedAmount += localOrder.free;
      details.push({
        orderNumber: localOrder.deliveryOrderSn,
        platformOrderNumber: platformOrder.orderNumber,
        status: 'MATCHED',
        localAmount: localOrder.free,
        platformAmount: platformActualAmount,
        amountDiff: 0,
        localStatus: localOrder.deliveryStatus,
        platformStatus: platformOrder.orderStatus,
      });
    } else if (absDiff <= TOLERANCE) {
      // 容差匹配
      matchedCount++;
      toleranceMatches++;
      totalMatchedAmount += localOrder.free;
      totalDiff += amountDiff;
      details.push({
        orderNumber: localOrder.deliveryOrderSn,
        platformOrderNumber: platformOrder.orderNumber,
        status: 'MATCHED',
        localAmount: localOrder.free,
        platformAmount: platformActualAmount,
        amountDiff,
        localStatus: localOrder.deliveryStatus,
        platformStatus: platformOrder.orderStatus,
        reason: `金额差异 ${amountDiff.toFixed(2)} 元（容差内）`,
      });
    } else {
      // 金额异常
      exceptionCount++;
      totalDiff += amountDiff;
      const reason = amountDiff > 0
        ? `平台多扣款 ${amountDiff.toFixed(2)} 元`
        : `平台少扣款 ${Math.abs(amountDiff).toFixed(2)} 元`;
      
      details.push({
        orderNumber: localOrder.deliveryOrderSn,
        platformOrderNumber: platformOrder.orderNumber,
        status: 'EXCEPTION',
        localAmount: localOrder.free,
        platformAmount: platformActualAmount,
        amountDiff,
        localStatus: localOrder.deliveryStatus,
        platformStatus: platformOrder.orderStatus,
        reason,
      });
    }
  }

  // ==================== Step 7: 汇总统计 ====================
  logSection('8. 对账汇总结果');

  const totalLocalAmount = validLocalOrders.reduce((sum, o) => sum + o.free, 0);
  const totalPlatformAmount = platformOrders.reduce((sum, o) => {
    return sum + adapter.getActualDeduction(o);
  }, 0);

  const matchRate = total > 0 ? Math.round((matchedCount / total) * 10000) / 100 : 0;

  console.log('\n┌' + '─'.repeat(78) + '┐');
  console.log('│' + ' '.repeat(25) + '对账结果汇总' + ' '.repeat(28) + '│');
  console.log('├' + '─'.repeat(78) + '┤');
  console.log(`│  总订单数        │ ${String(total).padEnd(10)} │ 匹配成功    │ ${String(matchedCount).padEnd(10)} │`.padEnd(80) + '│');
  console.log(`│  匹配成功        │ ${String(matchedCount).padEnd(10)} │ 金额异常    │ ${String(exceptionCount).padEnd(10)} │`.padEnd(80) + '│');
  console.log(`│  金额异常        │ ${String(exceptionCount).padEnd(10)} │ 订单缺失    │ ${String(missingCount).padEnd(10)} │`.padEnd(80) + '│');
  console.log(`│  订单缺失        │ ${String(missingCount).padEnd(10)} │ 匹配率      │ ${String(matchRate + '%').padEnd(10)} │`.padEnd(80) + '│');
  console.log('├' + '─'.repeat(78) + '┤');
  console.log(`│  配送单总金额    │ ¥${String(totalLocalAmount.toFixed(2)).padEnd(13)} │`.padEnd(80) + '│');
  console.log(`│  平台账单总金额  │ ¥${String(totalPlatformAmount.toFixed(2)).padEnd(13)} │`.padEnd(80) + '│');
  console.log(`│  金额差异        │ ¥${String(totalDiff.toFixed(2)).padEnd(13)} │  (平台-配送)  │`.padEnd(80) + '│');
  console.log('├' + '─'.repeat(78) + '┤');
  console.log(`│  完全匹配        │ ${String(perfectMatches).padEnd(10)} │ 容差匹配    │ ${String(toleranceMatches).padEnd(10)} │`.padEnd(80) + '│');
  console.log('└' + '─'.repeat(78) + '┘');

  // ==================== Step 8: 异常订单详情 ====================
  logSection('9. 异常订单详情 (金额差异 > 0.01元)');

  const exceptions = details.filter(d => d.status === 'EXCEPTION');
  
  if (exceptions.length > 0) {
    console.log(`\n异常订单数量: ${exceptions.length}`);
    
    console.log('\n   前10条异常订单:');
    console.log('   ' + '-'.repeat(110));
    console.log(`   | 序号 | 配送单号         | 配送金额 | 平台金额 | 差异   | 原因                          |`);
    console.log('   ' + '-'.repeat(110));
    
    exceptions.slice(0, 10).forEach((order, idx) => {
      const diffStr = order.amountDiff > 0 
        ? `+${order.amountDiff.toFixed(2)}` 
        : order.amountDiff.toFixed(2);
      const reason = (order.reason || '').substring(0, 20);
      console.log(`   | ${String(idx + 1).padEnd(4)} | ${order.orderNumber.substring(0, 14).padEnd(14)} | ${String(order.localAmount.toFixed(2)).padEnd(8)} | ${String(order.platformAmount.toFixed(2)).padEnd(8)} | ${diffStr.padEnd(7)} | ${reason.padEnd(26)} |`);
    });
    
    if (exceptions.length > 10) {
      console.log(`   ... 共 ${exceptions.length} 条异常订单`);
    }
    console.log('   ' + '-'.repeat(110));

    // 异常原因统计
    console.log('\n   异常原因统计:');
    const reasonCount: Record<string, number> = {};
    for (const e of exceptions) {
      const r = e.reason || '未知原因';
      reasonCount[r] = (reasonCount[r] || 0) + 1;
    }
    for (const [reason, count] of Object.entries(reasonCount).sort((a, b) => b[1] - a[1])) {
      console.log(`      - ${reason}: ${count} 单`);
    }
  } else {
    console.log('\n✅ 无异常订单!');
  }

  // ==================== Step 9: 缺失订单详情 ====================
  logSection('10. 缺失订单详情 (平台账单中未找到)');

  const missing = details.filter(d => d.status === 'MISSING');
  
  if (missing.length > 0) {
    console.log(`\n缺失订单数量: ${missing.length}`);
    
    console.log('\n   前10条缺失订单:');
    console.log('   ' + '-'.repeat(50));
    console.log(`   | 序号 | 配送单号                  | 配送金额 | 配送状态 |`);
    console.log('   ' + '-'.repeat(50));
    
    missing.slice(0, 10).forEach((order, idx) => {
      console.log(`   | ${String(idx + 1).padEnd(4)} | ${order.orderNumber.substring(0, 24).padEnd(24)} | ¥${String(order.localAmount.toFixed(2)).padEnd(8)} | ${(order.localStatus || '-').substring(0, 6).padEnd(6)} |`);
    });
    
    if (missing.length > 10) {
      console.log(`   ... 共 ${missing.length} 条缺失订单`);
    }
    console.log('   ' + '-'.repeat(50));
  } else {
    console.log('\n✅ 无缺失订单!');
  }

  // ==================== Step 10: 匹配订单抽样 ====================
  logSection('11. 匹配成功订单抽样');

  const matched = details.filter(d => d.status === 'MATCHED');
  
  if (matched.length > 0) {
    console.log(`\n匹配成功订单数量: ${matched.length}`);
    
    console.log('\n   前5条匹配订单:');
    console.log('   ' + '-'.repeat(80));
    console.log(`   | 序号 | 配送单号         | 配送金额 | 平台金额 | 差异   | 状态  |`);
    console.log('   ' + '-'.repeat(80));
    
    matched.slice(0, 5).forEach((order, idx) => {
      const diffStr = order.amountDiff === 0 ? '0.00' : 
                      order.amountDiff > 0 ? `+${order.amountDiff.toFixed(2)}` : 
                      order.amountDiff.toFixed(2);
      const statusIcon = order.amountDiff === 0 ? '✓' : '容差';
      console.log(`   | ${String(idx + 1).padEnd(4)} | ${order.orderNumber.substring(0, 14).padEnd(14)} | ${String(order.localAmount.toFixed(2)).padEnd(8)} | ${String(order.platformAmount.toFixed(2)).padEnd(8)} | ${diffStr.padEnd(7)} | ${statusIcon}    |`);
    });
    console.log('   ' + '-'.repeat(80));
  } else {
    console.log('\n⚠️  无匹配成功的订单!');
  }

  // ==================== 完成 ====================
  logSection('12. 对账完成');

  console.log('\n✅ 对账调试完成!');
  console.log(`   总耗时: ${Date.now() - parseInt(TASK_ID.split('-')[1] || Date.now().toString())}ms`);
  console.log('\n对账结果概要:');
  console.log(`   总有效订单: ${total}`);
  console.log(`   匹配成功: ${matchedCount} (${total > 0 ? ((matchedCount/total)*100).toFixed(1) : 0}%)`);
  console.log(`   金额异常: ${exceptionCount} (${total > 0 ? ((exceptionCount/total)*100).toFixed(1) : 0}%)`);
  console.log(`   订单缺失: ${missingCount} (${total > 0 ? ((missingCount/total)*100).toFixed(1) : 0}%)`);
  console.log(`   金额差异: ¥${totalDiff.toFixed(2)}`);
  console.log('');
}

// 运行主程序
main().catch(console.error);
