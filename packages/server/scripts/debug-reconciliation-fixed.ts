/**
 * 对账核心逻辑调试脚本 - 修正版
 * 使用正确的列映射来处理实际文件格式
 *
 * 文件结构分析:
 * - fa69...xlsx: 内部配送订单表 (order_sn, delivery_order_sn, free, 发单运力, 配送状态)
 * - fb5b...xlsx: 外部平台订单 (第三方订单ID, 达达订单ID, 订单状态, 应付金额)
 *
 * 对账逻辑:
 * 1. 用 internal.delivery_order_sn 与 external.达达订单ID 匹配
 * 2. 比较 internal.free 与 external.应付金额
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.resolve(__dirname, '../uploads');
const TASK_ID = `DEBUG-${Date.now()}`;
const PLATFORM_ID = 'shansong';
const TOLERANCE = 0.01;

interface InternalOrder {
  id: string;
  orderSn: string;
  deliveryOrderSn: string;
  status: string;
  statusText: string;
  platform: string;
  free: number;
  createTime?: Date;
}

interface ExternalOrder {
  thirdPartyOrderId: string;
  dadaOrderId: string;
  orderStatus: string;
  payableAmount: number;
  deliveryFee: number;
  sendTime?: Date;
  finishTime?: Date;
}

interface MatchResult {
  orderSn: string;
  deliveryOrderSn: string;
  status: 'MATCHED' | 'EXCEPTION' | 'MISSING';
  localAmount: number;
  platformAmount: number;
  amountDiff: number;
  reason?: string;
}

function formatMoney(cents: number): string {
  if (cents === undefined || cents === null || isNaN(cents)) return '-';
  return cents.toFixed(2);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(80));
  console.log(`  ${title}`);
  console.log('='.repeat(80));
}

async function parseExcel(buffer: Buffer, options: { headerRow?: number; sheetName?: string } = {}) {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = options.sheetName || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      return { success: false, error: 'Sheet not found', data: null };
    }

    const data = XLSX.utils.sheet_to_json<any[]>(sheet, {
      header: options.headerRow === 1 ? 1 : 1,
      defval: undefined,
    });

    return { success: true, data, sheetName };
  } catch (error: any) {
    return { success: false, error: error.message, data: null };
  }
}

async function parseInternalOrders(filePath: string): Promise<InternalOrder[]> {
  console.log(`[解析] 读取内部配送订单表: ${path.basename(filePath)}`);

  const buffer = await fs.readFile(filePath);
  const result = await parseExcel(buffer, { headerRow: 1 });

  if (!result.success || !result.data) {
    console.error('[错误] 解析失败:', result.error);
    return [];
  }

  console.log(`[解析] 原始数据行数: ${result.data.length}`);

  // 显示列名
  const firstRow = result.data[0] || {};
  const columns = Object.keys(firstRow);
  console.log(`[解析] 列名: ${columns.slice(0, 10).join(', ')}`);

  // 查找关键列的索引
  const colMap: Record<string, string> = {};
  const lowerColumns = columns.map(c => c.toLowerCase());

  // 查找 order_sn / 订单号
  const orderSnCol = columns.find(c => /order_sn|订单号/i.test(c)) || columns[1];
  // 查找 delivery_order_sn / 配送单号
  const deliveryOrderSnCol = columns.find(c => /delivery_order_sn|配送单号|达达订单/i.test(c)) || columns[3];
  // 查找 status / 状态
  const statusCol = columns.find(c => /status|状态/i.test(c)) || columns[5];
  // 查找 free / 金额 / 配送费
  const freeCol = columns.find(c => /\bfree\b|金额|配送费|应付金额/i.test(c)) || columns[9];
  // 查找发单运力 / 平台
  const platformCol = columns.find(c => /发单运力|平台/i.test(c)) || columns.find(c => /美团|达达|闪送|蜂鸟|饿了么/i.test(c)) || columns[columns.length - 2];
  // 查找 配送状态
  const deliveryStatusCol = columns.find(c => /配送状态/i.test(c)) || columns[columns.length - 1];
  // 查找 create_time / 下单时间
  const createTimeCol = columns.find(c => /create_time|下单时间|发单时间/i.test(c)) || columns[26];

  console.log(`[解析] 关键列映射:`);
  console.log(`   订单号: ${orderSnCol}`);
  console.log(`   配送单号: ${deliveryOrderSnCol}`);
  console.log(`   状态: ${statusCol}`);
  console.log(`   金额: ${freeCol}`);
  console.log(`   平台: ${platformCol}`);
  console.log(`   配送状态: ${deliveryStatusCol}`);

  const orders: InternalOrder[] = [];

  for (let i = 1; i < result.data.length; i++) {
    const row = result.data[i];

    // 提取关键字段
    const orderSn = String(row[orderSnCol] || '');
    const deliveryOrderSn = String(row[deliveryOrderSnCol] || '');
    const status = String(row[statusCol] || '');
    const freeStr = String(row[freeCol] || '0');
    const platform = String(row[platformCol] || '');
    const deliveryStatus = String(row[deliveryStatusCol] || '');

    // 解析金额
    let free = 0;
    const freeNum = parseFloat(freeStr.replace(/[¥￥]/g, ''));
    if (!isNaN(freeNum)) {
      free = freeNum;
    }

    // 只保留有配送单号的订单
    if (deliveryOrderSn && deliveryOrderSn !== 'undefined') {
      orders.push({
        id: String(row['id'] || i),
        orderSn,
        deliveryOrderSn,
        status,
        statusText: deliveryStatus,
        platform,
        free,
      });
    }
  }

  console.log(`[解析] 有效订单数: ${orders.length}`);
  return orders;
}

async function parseExternalOrders(filePath: string): Promise<ExternalOrder[]> {
  console.log(`[解析] 读取外部平台订单: ${path.basename(filePath)}`);

  const buffer = await fs.readFile(filePath);
  const result = await parseExcel(buffer, { headerRow: 1 });

  if (!result.success || !result.data) {
    console.error('[错误] 解析失败:', result.error);
    return [];
  }

  console.log(`[解析] 原始数据行数: ${result.data.length}`);

  const firstRow = result.data[0] || {};
  const columns = Object.keys(firstRow);

  // 查找关键列
  // 第三方订单ID
  const thirdPartyCol = columns.find(c => /第三方订单ID|三方订单编号/i.test(c)) || columns[6];
  // 达达订单ID / 配送单号
  const dadaOrderCol = columns.find(c => /达达订单ID|配送单号|delivery_order/i.test(c)) || columns[7];
  // 订单状态
  const statusCol = columns.find(c => /订单状态|status/i.test(c)) || columns[10];
  // 应付金额
  const amountCol = columns.find(c => /应付金额|实付金额|金额/i.test(c)) || columns[31];
  // 发单时间
  const sendTimeCol = columns.find(c => /发单时间|下单时间|create_time/i.test(c)) || columns[0];
  // 完成时间
  const finishTimeCol = columns.find(c => /完成时间|finish_time/i.test(c)) || columns[37];

  console.log(`[解析] 关键列映射:`);
  console.log(`   第三方订单ID: ${thirdPartyCol}`);
  console.log(`   达达订单ID: ${dadaOrderCol}`);
  console.log(`   订单状态: ${statusCol}`);
  console.log(`   应付金额: ${amountCol}`);

  const orders: ExternalOrder[] = [];

  for (let i = 1; i < result.data.length; i++) {
    const row = result.data[i];

    const thirdPartyOrderId = String(row[thirdPartyCol] || '');
    const dadaOrderId = String(row[dadaOrderCol] || '');
    const orderStatus = String(row[statusCol] || '');
    const amountStr = String(row[amountCol] || '0');

    let payableAmount = 0;
    const amountNum = parseFloat(amountStr.replace(/[¥￥]/g, ''));
    if (!isNaN(amountNum)) {
      payableAmount = amountNum;
    }

    // 解析时间
    let sendTime: Date | undefined;
    let finishTime: Date | undefined;

    try {
      const sendVal = row[sendTimeCol];
      if (sendVal) {
        if (typeof sendVal === 'string') {
          sendTime = new Date(sendVal);
        } else if (typeof sendVal === 'number') {
          sendTime = new Date(sendVal * 1000);
        }
      }

      const finishVal = row[finishTimeCol];
      if (finishVal) {
        if (typeof finishVal === 'string') {
          finishTime = new Date(finishVal);
        } else if (typeof finishVal === 'number') {
          finishTime = new Date(finishVal * 1000);
        }
      }
    } catch (e) {
      // 忽略时间解析错误
    }

    // 只保留有订单ID的记录
    if (dadaOrderId && dadaOrderId !== 'undefined') {
      orders.push({
        thirdPartyOrderId,
        dadaOrderId,
        orderStatus,
        payableAmount,
        deliveryFee: 0,
        sendTime,
        finishTime,
      });
    }
  }

  console.log(`[解析] 有效订单数: ${orders.length}`);
  return orders;
}

async function main() {
  console.log('\n');
  console.log('█'.repeat(80));
  console.log('█                                                                    █');
  console.log('█        对账核心逻辑调试脚本 (修正版) - Fixed Reconciliation Debug    █');
  console.log('█                                                                    █');
  console.log('█'.repeat(80));

  logSection('1. 环境信息');
  console.log(`任务ID: ${TASK_ID}`);
  console.log(`平台ID: ${PLATFORM_ID}`);
  console.log(`容差: ${TOLERANCE}元`);
  console.log(`上传目录: ${UPLOADS_DIR}`);
  console.log(`当前时间: ${new Date().toLocaleString('zh-CN')}`);

  // 查找文件
  logSection('2. 查找文件');
  const files = await fs.readdir(UPLOADS_DIR);
  const xlsxFiles = files.filter(f => f.endsWith('.xlsx'));
  console.log(`找到 ${xlsxFiles.length} 个Excel文件`);

  // 排序: 行数少的为内部订单表, 行数多的为外部订单
  const fileInfos = [];
  for (const file of xlsxFiles) {
    const filePath = path.join(UPLOADS_DIR, file);
    const buffer = await fs.readFile(filePath);
    const result = await parseExcel(buffer);
    fileInfos.push({
      filename: file,
      filePath,
      rowCount: result.data?.length || 0,
    });
  }

  fileInfos.sort((a, b) => a.rowCount - b.rowCount);

  console.log('\n文件排序 (按行数):');
  for (const fi of fileInfos) {
    console.log(`   ${fi.rowCount.toString().padEnd(8)} 行: ${fi.filename}`);
  }

  // 选择文件
  const internalFile = fileInfos[0]; // 行数少的
  const externalFile = fileInfos[1]; // 行数多的

  console.log(`\n选择:`);
  console.log(`   内部订单表: ${internalFile.filename} (${internalFile.rowCount} 行)`);
  console.log(`   外部订单表: ${externalFile.filename} (${externalFile.rowCount} 行)`);

  // 解析文件
  logSection('3. 解析内部订单表');
  const internalOrders = await parseInternalOrders(internalFile.filePath);

  if (internalOrders.length > 0) {
    console.log('\n前5条内部订单:');
    console.log('   ' + '-'.repeat(90));
    console.log(`   | 序号 | 订单号              | 配送单号                   | 状态 | 平台      | 金额   |`);
    console.log('   ' + '-'.repeat(90));

    internalOrders.slice(0, 5).forEach((order, idx) => {
      console.log(`   | ${String(idx + 1).padEnd(4)} | ${order.orderSn.substring(0, 18).padEnd(18)} | ${order.deliveryOrderSn.substring(0, 24).padEnd(24)} | ${(order.status || '-').padEnd(4)} | ${(order.platform || '-').substring(0, 8).padEnd(8)} | ${formatMoney(order.free).padEnd(7)} |`);
    });
    console.log('   ' + '-'.repeat(90));

    // 统计
    const platformCount: Record<string, number> = {};
    const statusCount: Record<string, number> = {};
    let totalFree = 0;

    for (const o of internalOrders) {
      platformCount[o.platform] = (platformCount[o.platform] || 0) + 1;
      statusCount[o.statusText] = (statusCount[o.statusText] || 0) + 1;
      totalFree += o.free;
    }

    console.log('\n统计:');
    console.log(`   总订单数: ${internalOrders.length}`);
    console.log(`   总金额: ¥${totalFree.toFixed(2)}`);
    console.log(`   平台分布:`);
    for (const [p, c] of Object.entries(platformCount)) {
      console.log(`      - ${p || '未知'}: ${c}`);
    }
  }

  logSection('4. 解析外部订单表');
  const externalOrders = await parseExternalOrders(externalFile.filePath);

  if (externalOrders.length > 0) {
    console.log('\n前5条外部订单:');
    console.log('   ' + '-'.repeat(100));
    console.log(`   | 序号 | 第三方订单ID              | 达达订单ID                     | 状态    | 金额   |`);
    console.log('   ' + '-'.repeat(100));

    externalOrders.slice(0, 5).forEach((order, idx) => {
      console.log(`   | ${String(idx + 1).padEnd(4)} | ${order.thirdPartyOrderId.substring(0, 24).padEnd(24)} | ${order.dadaOrderId.substring(0, 26).padEnd(26)} | ${(order.orderStatus || '-').substring(0, 6).padEnd(6)} | ${formatMoney(order.payableAmount).padEnd(7)} |`);
    });
    console.log('   ' + '-'.repeat(100));

    // 统计
    const statusCount: Record<string, number> = {};
    let totalAmount = 0;

    for (const o of externalOrders) {
      statusCount[o.orderStatus] = (statusCount[o.orderStatus] || 0) + 1;
      totalAmount += o.payableAmount;
    }

    console.log('\n统计:');
    console.log(`   总订单数: ${externalOrders.length}`);
    console.log(`   总金额: ¥${totalAmount.toFixed(2)}`);
    console.log(`   状态分布:`);
    for (const [s, c] of Object.entries(statusCount)) {
      console.log(`      - ${s || '未知'}: ${c}`);
    }
  }

  // 构建索引
  logSection('5. 构建外部订单索引');

  const externalMap = new Map<string, ExternalOrder>();
  let duplicateCount = 0;

  for (const order of externalOrders) {
    const key = order.dadaOrderId;
    if (externalMap.has(key)) {
      duplicateCount++;
    }
    externalMap.set(key, order);
  }

  console.log(`\n索引构建结果:`);
  console.log(`   外部订单总数: ${externalOrders.length}`);
  console.log(`   索引条目数: ${externalMap.size}`);
  console.log(`   重复键: ${duplicateCount}`);

  // 对账
  logSection('6. 执行对账');

  const results: MatchResult[] = [];
  let matched = 0;
  let exception = 0;
  let missing = 0;
  let totalDiff = 0;

  console.log(`\n对账参数:`);
  console.log(`   内部订单: ${internalOrders.length}`);
  console.log(`   外部订单: ${externalOrders.length}`);
  console.log(`   容差: ${TOLERANCE}元`);

  console.log('\n开始对账...');

  const total = internalOrders.length;
  let processed = 0;

  for (const internal of internalOrders) {
    processed++;

    if (processed % 500 === 0 || processed === total) {
      console.log(`   [${Math.round(processed / total * 100)}%] ${processed}/${total}`);
    }

    const external = externalMap.get(internal.deliveryOrderSn);

    if (!external) {
      missing++;
      results.push({
        orderSn: internal.orderSn,
        deliveryOrderSn: internal.deliveryOrderSn,
        status: 'MISSING',
        localAmount: internal.free,
        platformAmount: 0,
        amountDiff: -internal.free,
        reason: '外部订单中未找到',
      });
      continue;
    }

    const diff = external.payableAmount - internal.free;

    if (Math.abs(diff) <= TOLERANCE) {
      matched++;
      results.push({
        orderSn: internal.orderSn,
        deliveryOrderSn: internal.deliveryOrderSn,
        status: 'MATCHED',
        localAmount: internal.free,
        platformAmount: external.payableAmount,
        amountDiff: diff,
      });
    } else {
      exception++;
      totalDiff += diff;
      const reason = diff > 0
        ? `平台多扣 ¥${diff.toFixed(2)}`
        : `平台少扣 ¥${(-diff).toFixed(2)}`;

      results.push({
        orderSn: internal.orderSn,
        deliveryOrderSn: internal.deliveryOrderSn,
        status: 'EXCEPTION',
        localAmount: internal.free,
        platformAmount: external.payableAmount,
        amountDiff: diff,
        reason,
      });
    }
  }

  // 汇总
  logSection('7. 对账结果汇总');

  const matchRate = total > 0 ? (matched / total * 100).toFixed(1) : '0.0';

  console.log('\n┌' + '─'.repeat(78) + '┐');
  console.log('│' + ' '.repeat(30) + '对账结果汇总' + ' '.repeat(25) + '│');
  console.log('├' + '─'.repeat(78) + '┤');
  console.log(`│  总订单数    │ ${String(total).padEnd(12)} │ 匹配成功  │ ${String(matched).padEnd(10)} │`.padEnd(80) + '│');
  console.log(`│  匹配成功    │ ${String(matched).padEnd(12)} │ 金额异常  │ ${String(exception).padEnd(10)} │`.padEnd(80) + '│');
  console.log(`│  金额异常    │ ${String(exception).padEnd(12)} │ 订单缺失  │ ${String(missing).padEnd(10)} │`.padEnd(80) + '│');
  console.log(`│  订单缺失    │ ${String(missing).padEnd(12)} │ 匹配率    │ ${String(matchRate + '%').padEnd(10)} │`.padEnd(80) + '│');
  console.log('├' + '─'.repeat(78) + '┤');
  console.log(`│  内部总金额  │ ¥${String(internalOrders.reduce((s, o) => s + o.free, 0).toFixed(2)).padEnd(13)} │`.padEnd(80) + '│');
  console.log(`│  外部总金额  │ ¥${String(externalOrders.reduce((s, o) => s + o.payableAmount, 0).toFixed(2)).padEnd(13)} │`.padEnd(80) + '│');
  console.log(`│  金额差异    │ ¥${String(totalDiff.toFixed(2)).padEnd(13)} │  (外部-内部)  │`.padEnd(80) + '│');
  console.log('└' + '─'.repeat(78) + '┘');

  // 异常订单详情
  logSection('8. 异常订单详情');

  const exceptions = results.filter(r => r.status === 'EXCEPTION');
  if (exceptions.length > 0) {
    console.log(`\n异常订单: ${exceptions.length}`);

    console.log('\n前10条:');
    console.log('   ' + '-'.repeat(90));
    console.log(`   | 序号 | 配送单号                   | 内部金额 | 外部金额 | 差异    |`);
    console.log('   ' + '-'.repeat(90));

    exceptions.slice(0, 10).forEach((r, idx) => {
      const diffStr = r.amountDiff > 0 ? `+${r.amountDiff.toFixed(2)}` : r.amountDiff.toFixed(2);
      console.log(`   | ${String(idx + 1).padEnd(4)} | ${r.deliveryOrderSn.substring(0, 26).padEnd(26)} | ${formatMoney(r.localAmount).padEnd(8)} | ${formatMoney(r.platformAmount).padEnd(8)} | ${diffStr.padEnd(8)} |`);
    });
    console.log('   ' + '-'.repeat(90));
  } else {
    console.log('\n✅ 无异常订单!');
  }

  // 缺失订单详情
  logSection('9. 缺失订单详情');

  const missings = results.filter(r => r.status === 'MISSING');
  if (missings.length > 0) {
    console.log(`\n缺失订单: ${missings.length}`);

    console.log('\n前10条:');
    console.log('   ' + '-'.repeat(60));
    console.log(`   | 序号 | 配送单号                        | 内部金额 |`);
    console.log('   ' + '-'.repeat(60));

    missings.slice(0, 10).forEach((r, idx) => {
      console.log(`   | ${String(idx + 1).padEnd(4)} | ${r.deliveryOrderSn.substring(0, 28).padEnd(28)} | ${formatMoney(r.localAmount).padEnd(8)} |`);
    });
    console.log('   ' + '-'.repeat(60));
  } else {
    console.log('\n✅ 无缺失订单!');
  }

  // 完成
  logSection('10. 完成');

  console.log('\n✅ 对账完成!');
  console.log(`   总耗时: ${Date.now() - parseInt(TASK_ID.split('-')[1] || Date.now().toString())}ms`);
  console.log('');
}

main().catch(console.error);
