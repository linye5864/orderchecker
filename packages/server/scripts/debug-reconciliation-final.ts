/**
 * 对账核心逻辑调试脚本 - 最终版
 * 使用正确的列索引进行对账
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.resolve(__dirname, '../uploads');
const TASK_ID = `DEBUG-${Date.now()}`;
const TOLERANCE = 0.01;

// 正确的列索引 (基于 smart-column-detect.ts 分析结果)
const COLS = {
  // fa69...xlsx (内部订单表 - 57942行)
  internal: {
    orderSn: 1,           // order_sn
    deliveryOrderSn: 3,   // delivery_order_sn (匹配键)
    thirdPartyOrderId: 3, // 第三方订单ID = delivery_order_sn
    free: 9,              // free
    status: 42,           // 配送状态
    platform: 41,         // 发单运力
  },
  // fb5b...xlsx (外部平台订单 - 2249行)
  external: {
    thirdPartyOrderId: 6, // 第三方订单ID (匹配键)
    dadaOrderId: 7,       // 达达订单ID
    orderStatus: 10,      // 订单状态
    payableAmount: 36,    // 应付金额
    platform: 8,          // 订单来源标识
  },
};

interface InternalOrder {
  orderSn: string;
  deliveryOrderSn: string;
  free: number;
  status: string;
  platform: string;
}

interface ExternalOrder {
  thirdPartyOrderId: string;
  dadaOrderId: string;
  orderStatus: string;
  payableAmount: number;
  platform: string;
}

interface MatchResult {
  internalOrderSn: string;
  deliveryOrderSn: string;
  status: 'MATCHED' | 'EXCEPTION' | 'MISSING';
  internalAmount: number;
  externalAmount: number;
  amountDiff: number;
  platform: string;
  reason?: string;
}

function formatMoney(amount: number): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '-';
  return amount.toFixed(2);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(80));
  console.log(`  ${title}`);
  console.log('='.repeat(80));
}

async function parseExcel(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
}

async function parseInternalOrders(filePath: string): Promise<InternalOrder[]> {
  console.log(`[解析] 内部订单表: ${path.basename(filePath)}`);

  const buffer = await fs.readFile(filePath);
  const data = await parseExcel(buffer);

  console.log(`[解析] 总行数: ${data.length}`);

  const orders: InternalOrder[] = [];

  // 跳过表头行
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;

    const deliveryOrderSn = String(row[COLS.internal.deliveryOrderSn] || '').trim();
    const free = parseFloat(String(row[COLS.internal.free] || '0').replace(/[¥￥]/g, ''));

    // 只保留有配送单号和有效金额的订单
    if (deliveryOrderSn && deliveryOrderSn !== 'undefined' && !isNaN(free)) {
      orders.push({
        orderSn: String(row[COLS.internal.orderSn] || '').trim(),
        deliveryOrderSn,
        free,
        status: String(row[COLS.internal.status] || '').trim(),
        platform: String(row[COLS.internal.platform] || '').trim(),
      });
    }
  }

  console.log(`[解析] 有效订单: ${orders.length}`);
  return orders;
}

async function parseExternalOrders(filePath: string): Promise<ExternalOrder[]> {
  console.log(`[解析] 外部订单表: ${path.basename(filePath)}`);

  const buffer = await fs.readFile(filePath);
  const data = await parseExcel(buffer);

  console.log(`[解析] 总行数: ${data.length}`);

  const orders: ExternalOrder[] = [];

  // 跳过表头行
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;

    const dadaOrderId = String(row[COLS.external.dadaOrderId] || '').trim();
    const payableAmount = parseFloat(String(row[COLS.external.payableAmount] || '0').replace(/[¥￥]/g, ''));

    // 只保留有订单ID和有效金额的订单
    if (dadaOrderId && dadaOrderId !== 'undefined' && !isNaN(payableAmount)) {
      orders.push({
        thirdPartyOrderId: String(row[COLS.external.thirdPartyOrderId] || '').trim(),
        dadaOrderId,
        orderStatus: String(row[COLS.external.orderStatus] || '').trim(),
        payableAmount,
        platform: String(row[COLS.external.platform] || '').trim(),
      });
    }
  }

  console.log(`[解析] 有效订单: ${orders.length}`);
  return orders;
}

async function main() {
  console.log('\n');
  console.log('█'.repeat(80));
  console.log('█                                                                    █');
  console.log('█           对账核心逻辑调试脚本 - Final Reconciliation Debug         █');
  console.log('█                                                                    █');
  console.log('█'.repeat(80));

  logSection('1. 环境信息');
  console.log(`任务ID: ${TASK_ID}`);
  console.log(`容差: ${TOLERANCE}元`);
  console.log(`上传目录: ${UPLOADS_DIR}`);

  // 查找文件
  logSection('2. 查找文件');
  const files = await fs.readdir(UPLOADS_DIR);
  const xlsxFiles = files.filter(f => f.endsWith('.xlsx'));

  // 排序: 行数多的为内部订单表 (fa69...), 行数少的为外部订单 (fb5b...)
  const fileInfos = [];
  for (const file of xlsxFiles) {
    const filePath = path.join(UPLOADS_DIR, file);
    const buffer = await fs.readFile(filePath);
    const data = await parseExcel(buffer);
    fileInfos.push({
      filename: file,
      filePath,
      rowCount: data.length,
    });
  }

  // 按行数排序 (内部订单表行数多)
  fileInfos.sort((a, b) => b.rowCount - a.rowCount);

  // 找到正确的文件 (内部订单表行数多, 外部订单行数少)
  const internalFile = fileInfos.find(f => f.rowCount > 50000) || fileInfos[0];
  const externalFile = fileInfos.find(f => f.filename.includes('fb5b45e9')) || fileInfos[fileInfos.length - 1];

  console.log(`\n内部订单表: ${internalFile.filename} (${internalFile.rowCount} 行)`);
  console.log(`外部订单表: ${externalFile.filename} (${externalFile.rowCount} 行)`);

  // 解析内部订单
  logSection('3. 解析内部订单表');
  const internalOrders = await parseInternalOrders(internalFile.filePath);

  if (internalOrders.length > 0) {
    console.log('\n前5条内部订单:');
    console.log('   ' + '-'.repeat(100));
    console.log(`   | 序号 | 订单号                  | 配送单号                   | 状态    | 平台     | 金额   |`);
    console.log('   ' + '-'.repeat(100));

    internalOrders.slice(0, 5).forEach((order, idx) => {
      console.log(`   | ${String(idx + 1).padEnd(4)} | ${order.orderSn.substring(0, 20).padEnd(20)} | ${order.deliveryOrderSn.substring(0, 24).padEnd(24)} | ${(order.status || '-').substring(0, 6).padEnd(6)} | ${(order.platform || '-').substring(0, 8).padEnd(8)} | ${formatMoney(order.free).padEnd(7)} |`);
    });
    console.log('   ' + '-'.repeat(100));

    // 统计
    const platformCount: Record<string, number> = {};
    const statusCount: Record<string, number> = {};
    let totalFree = 0;

    for (const o of internalOrders) {
      platformCount[o.platform] = (platformCount[o.platform] || 0) + 1;
      statusCount[o.status] = (statusCount[o.status] || 0) + 1;
      totalFree += o.free;
    }

    console.log('\n统计:');
    console.log(`   总订单数: ${internalOrders.length}`);
    console.log(`   总金额: ¥${totalFree.toFixed(2)}`);
    console.log(`   平台分布:`);
    for (const [p, c] of Object.entries(platformCount).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      console.log(`      - ${p || '未知'}: ${c}`);
    }
    console.log(`   状态分布:`);
    for (const [s, c] of Object.entries(statusCount).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      console.log(`      - ${s || '未知'}: ${c}`);
    }
  }

  // 解析外部订单
  logSection('4. 解析外部订单表');
  const externalOrders = await parseExternalOrders(externalFile.filePath);

  if (externalOrders.length > 0) {
    console.log('\n前5条外部订单:');
    console.log('   ' + '-'.repeat(100));
    console.log(`   | 序号 | 第三方订单ID                | 状态    | 应付金额 | 平台    |`);
    console.log('   ' + '-'.repeat(100));

    externalOrders.slice(0, 5).forEach((order, idx) => {
      console.log(`   | ${String(idx + 1).padEnd(4)} | ${order.thirdPartyOrderId.substring(0, 28).padEnd(28)} | ${(order.orderStatus || '-').substring(0, 6).padEnd(6)} | ${formatMoney(order.payableAmount).padEnd(8)} | ${(order.platform || '-').substring(0, 8).padEnd(8)} |`);
    });
    console.log('   ' + '-'.repeat(100));

    // 统计
    const platformCount: Record<string, number> = {};
    const statusCount: Record<string, number> = {};
    let totalAmount = 0;

    for (const o of externalOrders) {
      platformCount[o.platform] = (platformCount[o.platform] || 0) + 1;
      statusCount[o.orderStatus] = (statusCount[o.orderStatus] || 0) + 1;
      totalAmount += o.payableAmount;
    }

    console.log('\n统计:');
    console.log(`   总订单数: ${externalOrders.length}`);
    console.log(`   总金额: ¥${totalAmount.toFixed(2)}`);
    console.log(`   平台分布:`);
    for (const [p, c] of Object.entries(platformCount).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      console.log(`      - ${p || '未知'}: ${c}`);
    }
    console.log(`   状态分布:`);
    for (const [s, c] of Object.entries(statusCount).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      console.log(`      - ${s || '未知'}: ${c}`);
    }
  }

  // 构建外部订单索引 (使用第三方订单ID作为匹配键)
  const externalMap = new Map<string, ExternalOrder>();
  let duplicateCount = 0;

  for (const order of externalOrders) {
    // 使用第三方订单ID作为匹配键
    const key = order.thirdPartyOrderId;
    if (externalMap.has(key)) {
      duplicateCount++;
    }
    externalMap.set(key, order);
  }

  console.log(`\n索引构建结果:`);
  console.log(`   外部订单总数: ${externalOrders.length}`);
  console.log(`   索引条目数: ${externalMap.size}`);
  console.log(`   重复键: ${duplicateCount}`);

  // 打印一些索引示例
  console.log('\n   索引示例 (前5个):');
  let idx = 0;
  for (const [key, order] of externalMap) {
    if (idx >= 5) break;
    console.log(`   [${key.substring(0, 30)}...] -> ¥${order.payableAmount.toFixed(2)} (${order.orderStatus})`);
    idx++;
  }

  // 执行对账
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
  console.log(`   匹配键: internal.delivery_order_sn = external.第三方订单ID`);

  console.log('\n开始对账...');

  const total = internalOrders.length;
  let processed = 0;

  for (const internal of internalOrders) {
    processed++;

    if (processed % 1000 === 0 || processed === total) {
      console.log(`   [${Math.round(processed / total * 100)}%] ${processed}/${total}`);
    }

    // 使用 internal.deliveryOrderSn 匹配 external.thirdPartyOrderId
    const external = externalMap.get(internal.deliveryOrderSn);

    if (!external) {
      missing++;
      results.push({
        internalOrderSn: internal.orderSn,
        deliveryOrderSn: internal.deliveryOrderSn,
        status: 'MISSING',
        internalAmount: internal.free,
        externalAmount: 0,
        amountDiff: -internal.free,
        platform: internal.platform,
        reason: '外部订单中未找到',
      });
      continue;
    }

    const diff = external.payableAmount - internal.free;

    if (Math.abs(diff) <= TOLERANCE) {
      matched++;
      results.push({
        internalOrderSn: internal.orderSn,
        deliveryOrderSn: internal.deliveryOrderSn,
        status: 'MATCHED',
        internalAmount: internal.free,
        externalAmount: external.payableAmount,
        amountDiff: diff,
        platform: internal.platform,
      });
    } else {
      exception++;
      totalDiff += diff;
      const reason = diff > 0
        ? `平台多扣 ¥${diff.toFixed(2)}`
        : `平台少扣 ¥${(-diff).toFixed(2)}`;

      results.push({
        internalOrderSn: internal.orderSn,
        deliveryOrderSn: internal.deliveryOrderSn,
        status: 'EXCEPTION',
        internalAmount: internal.free,
        externalAmount: external.payableAmount,
        amountDiff: diff,
        platform: internal.platform,
        reason,
      });
    }
  }

  // 汇总
  logSection('7. 对账结果汇总');

  const matchRate = total > 0 ? (matched / total * 100).toFixed(1) : '0.0';
  const totalInternal = internalOrders.reduce((sum, o) => sum + o.free, 0);
  const totalExternal = externalOrders.reduce((sum, o) => sum + o.payableAmount, 0);

  console.log('\n┌' + '─'.repeat(78) + '┐');
  console.log('│' + ' '.repeat(28) + '对账结果汇总' + ' '.repeat(28) + '│');
  console.log('├' + '─'.repeat(78) + '┤');
  console.log(`│  总订单数    │ ${String(total).padEnd(12)} │ 匹配成功  │ ${String(matched).padEnd(10)} │`.padEnd(80) + '│');
  console.log(`│  匹配成功    │ ${String(matched).padEnd(12)} │ 金额异常  │ ${String(exception).padEnd(10)} │`.padEnd(80) + '│');
  console.log(`│  金额异常    │ ${String(exception).padEnd(12)} │ 订单缺失  │ ${String(missing).padEnd(10)} │`.padEnd(80) + '│');
  console.log(`│  订单缺失    │ ${String(missing).padEnd(12)} │ 匹配率    │ ${String(matchRate + '%').padEnd(10)} │`.padEnd(80) + '│');
  console.log('├' + '─'.repeat(78) + '┤');
  console.log(`│  内部总金额  │ ¥${String(totalInternal.toFixed(2)).padEnd(13)} │`.padEnd(80) + '│');
  console.log(`│  外部总金额  │ ¥${String(totalExternal.toFixed(2)).padEnd(13)} │`.padEnd(80) + '│');
  console.log(`│  金额差异    │ ¥${String(totalDiff.toFixed(2)).padEnd(13)} │  (外部-内部)  │`.padEnd(80) + '│');
  console.log('└' + '─'.repeat(78) + '┘');

  // 按平台统计
  console.log('\n按平台统计:');
  const platformStats: Record<string, { total: number; matched: number; exception: number; missing: number }> = {};

  for (const r of results) {
    if (!platformStats[r.platform]) {
      platformStats[r.platform] = { total: 0, matched: 0, exception: 0, missing: 0 };
    }
    platformStats[r.platform].total++;
    if (r.status === 'MATCHED') platformStats[r.platform].matched++;
    else if (r.status === 'EXCEPTION') platformStats[r.platform].exception++;
    else platformStats[r.platform].missing++;
  }

  console.log('   ' + '-'.repeat(70));
  console.log(`   | 平台         | 总数    | 匹配    | 异常    | 缺失    | 匹配率   |`);
  console.log('   ' + '-'.repeat(70));

  for (const [platform, stats] of Object.entries(platformStats).sort((a, b) => b[1].total - a[1].total)) {
    const rate = stats.total > 0 ? ((stats.matched / stats.total) * 100).toFixed(1) + '%' : '0%';
    console.log(`   | ${(platform || '未知').substring(0, 10).padEnd(10)} | ${String(stats.total).padEnd(7)} | ${String(stats.matched).padEnd(7)} | ${String(stats.exception).padEnd(7)} | ${String(stats.missing).padEnd(7)} | ${rate.padEnd(8)} |`);
  }
  console.log('   ' + '-'.repeat(70));

  // 异常订单详情
  logSection('8. 异常订单详情');

  const exceptions = results.filter(r => r.status === 'EXCEPTION');
  if (exceptions.length > 0) {
    console.log(`\n异常订单: ${exceptions.length}`);

    console.log('\n前10条:');
    console.log('   ' + '-'.repeat(100));
    console.log(`   | 序号 | 配送单号                   | 内部金额 | 外部金额 | 差异    | 平台     |`);
    console.log('   ' + '-'.repeat(100));

    exceptions.slice(0, 10).forEach((r, idx) => {
      const diffStr = r.amountDiff > 0 ? `+${r.amountDiff.toFixed(2)}` : r.amountDiff.toFixed(2);
      console.log(`   | ${String(idx + 1).padEnd(4)} | ${r.deliveryOrderSn.substring(0, 24).padEnd(24)} | ${formatMoney(r.internalAmount).padEnd(8)} | ${formatMoney(r.externalAmount).padEnd(8)} | ${diffStr.padEnd(8)} | ${(r.platform || '-').substring(0, 8).padEnd(8)} |`);
    });
    console.log('   ' + '-'.repeat(100));
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
    console.log(`   | 序号 | 配送单号                        | 内部金额 | 平台     |`);
    console.log('   ' + '-'.repeat(60));

    missings.slice(0, 10).forEach((r, idx) => {
      console.log(`   | ${String(idx + 1).padEnd(4)} | ${r.deliveryOrderSn.substring(0, 26).padEnd(26)} | ${formatMoney(r.internalAmount).padEnd(8)} | ${(r.platform || '-').substring(0, 8).padEnd(8)} |`);
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
