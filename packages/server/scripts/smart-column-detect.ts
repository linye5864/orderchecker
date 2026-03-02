/**
 * 智能列检测脚本
 * 分析Excel数据，自动识别关键字段的位置
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.resolve(__dirname, '../uploads');

interface ColumnInfo {
  index: number;
  name: string;
  sampleValues: string[];
  isOrderNumber: boolean;
  isAmount: boolean;
  isDate: boolean;
  isStatus: boolean;
  isPlatform: boolean;
}

function analyzeColumn(values: any[]): ColumnInfo {
  const sampleValues = values.slice(0, 10).map(v => String(v ?? ''));
  const nonEmptyCount = sampleValues.filter(v => v && v !== 'undefined' && v !== '').length;

  const info: ColumnInfo = {
    index: 0,
    name: '',
    sampleValues,
    isOrderNumber: false,
    isAmount: false,
    isDate: false,
    isStatus: false,
    isPlatform: false,
  };

  // 检测是否为订单号 (长数字串或特定格式)
  const orderPatterns = [
    /^\d{15,}$/,  // 15+位数字
    /^[a-zA-Z0-9]{20,}$/, // 20+字符混合
    /^\d{10}_\w+$/,  // 数字_字母格式
    /^\d+$/, // 纯数字
  ];

  const hasOrderPattern = orderPatterns.some(p => sampleValues.some(v => p.test(v)));
  const avgLength = sampleValues.reduce((sum, v) => sum + v.length, 0) / Math.max(sampleValues.length, 1);
  const isAllNumeric = sampleValues.every(v => /^\d+$/.test(v) || !v);

  if (nonEmptyCount > 5 && hasOrderPattern && avgLength > 10) {
    info.isOrderNumber = true;
  }

  // 检测是否为金额
  const amountPattern = /^-?\d+\.?\d*$/;
  const hasAmountPattern = sampleValues.some(v => amountPattern.test(v.replace(/[¥￥]/g, '')));
  const avgNumeric = sampleValues
    .map(v => parseFloat(v.replace(/[¥￥]/g, '')))
    .filter(v => !isNaN(v))
    .reduce((sum, v, _, arr) => sum + v / arr.length, 0);

  if (nonEmptyCount > 5 && hasAmountPattern && avgNumeric < 10000) {
    info.isAmount = true;
  }

  // 检测是否为日期
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}/,
    /^\d{4}\/\d{2}\/\d{2}/,
    /^\d{10}$/, // Unix timestamp
  ];

  const hasDatePattern = sampleValues.some(v => datePatterns.some(p => p.test(v)));
  if (nonEmptyCount > 5 && hasDatePattern) {
    info.isDate = true;
  }

  // 检测是否为状态 (短文本，常见状态值)
  const statusValues = ['已完成', '已取消', '配送中', '配送完成', '待配送', '1', '2', '3', '4', '5', '6', '10', '配送平台取消'];
  const statusMatchCount = sampleValues.filter(v => statusValues.includes(v)).length;
  if (nonEmptyCount > 5 && statusMatchCount >= 2) {
    info.isStatus = true;
  }

  // 检测是否为平台
  const platformValues = ['闪送', '达达', '美团', '蜂鸟', '饿了么', 'UU跑腿', '顺丰', '裹小递', '美团跑腿'];
  const platformMatchCount = sampleValues.filter(v => platformValues.some(p => v.includes(p))).length;
  if (nonEmptyCount > 5 && platformMatchCount >= 2) {
    info.isPlatform = true;
  }

  return info;
}

async function analyzeFile(filePath: string, filename: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📄 ${filename}`);
  console.log(`${'='.repeat(80)}`);

  const buffer = await fs.readFile(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // 读取所有数据（无表头模式）
  const data = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

  console.log(`总行数: ${data.length}`);
  console.log(`列数: ${data[0]?.length || 0}`);

  if (data.length < 2) {
    console.log('数据不足，跳过分析');
    return;
  }

  // 读取第一行作为表头参考
  const headerRow = data[0];
  const dataRows = data.slice(1);

  console.log('\n第一行（表头）:');
  console.log(headerRow.join(' | '));

  // 分析每一列
  console.log('\n列分析:');
  console.log('-'.repeat(120));

  const columns: ColumnInfo[] = [];
  const maxCols = Math.min(headerRow.length, 50);

  for (let colIdx = 0; colIdx < maxCols; colIdx++) {
    const values = dataRows.map(row => row[colIdx]);
    const info = analyzeColumn(values);
    info.index = colIdx;
    info.name = String(headerRow[colIdx] || `列${colIdx}`);
    columns.push(info);

    const tags = [];
    if (info.isOrderNumber) tags.push('📝订单号');
    if (info.isAmount) tags.push('💰金额');
    if (info.isDate) tags.push('📅日期');
    if (info.isStatus) tags.push('🏷️状态');
    if (info.isPlatform) tags.push('🚗平台');

    if (tags.length > 0) {
      console.log(`列${String(colIdx).padEnd(3)} | ${info.name.substring(0, 25).padEnd(25)} | ${tags.join(' ').padEnd(40)} | 样本: ${info.sampleValues[0]?.substring(0, 30)}`);
    }
  }

  console.log('-'.repeat(120));

  // 识别关键字段
  console.log('\n关键字段识别:');

  const orderCol = columns.find(c => c.isOrderNumber);
  const amountCol = columns.find(c => c.isAmount);
  const statusCol = columns.find(c => c.isStatus);
  const platformCol = columns.find(c => c.isPlatform);

  if (orderCol) {
    console.log(`✅ 订单号列: 列${orderCol.index} (${orderCol.name})`);
    console.log(`   样本: ${orderCol.sampleValues.slice(0, 3).join(', ')}`);
  }

  if (amountCol) {
    console.log(`✅ 金额列: 列${amountCol.index} (${amountCol.name})`);
    const amounts = amountCol.sampleValues.map(v => parseFloat(v.replace(/[¥￥]/g, ''))).filter(v => !isNaN(v));
    console.log(`   样本: ${amounts.slice(0, 3).join(', ')}`);
  }

  if (statusCol) {
    console.log(`✅ 状态列: 列${statusCol.index} (${statusCol.name})`);
    console.log(`   样本: ${statusCol.sampleValues.slice(0, 5).join(', ')}`);
  }

  if (platformCol) {
    console.log(`✅ 平台列: 列${platformCol.index} (${platformCol.name})`);
    console.log(`   样本: ${platformCol.sampleValues.slice(0, 5).join(', ')}`);
  }

  // 尝试显示有效数据行
  console.log('\n有效数据行示例:');
  const validRows = dataRows.filter(row => {
    return row.some((v, i) => {
      const col = columns[i];
      return col && (col.isOrderNumber || col.isAmount) && v;
    });
  });

  console.log(`有效行数: ${validRows.length}`);

  if (validRows.length > 0) {
    console.log('\n前3行数据:');
    for (let i = 0; i < Math.min(3, validRows.length); i++) {
      const row = validRows[i];
      console.log(`行${i + 1}: ${row.slice(0, 10).map(v => String(v ?? '').substring(0, 15)).join(' | ')}`);
    }
  }
}

async function main() {
  console.log('智能列检测分析');
  console.log('='.repeat(80));

  const files = await fs.readdir(UPLOADS_DIR);
  const xlsxFiles = files.filter(f => f.endsWith('.xlsx'));

  for (const file of xlsxFiles) {
    const filePath = path.join(UPLOADS_DIR, file);
    await analyzeFile(filePath, file);
  }
}

main().catch(console.error);
