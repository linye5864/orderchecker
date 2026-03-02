/**
 * ID格式对比脚本
 * 对比内部和外部订单的ID格式
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.resolve(__dirname, '../uploads');

async function parseExcel(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
}

async function main() {
  console.log('ID格式对比分析\n' + '='.repeat(80));

  // 读取文件
  const internalBuffer = await fs.readFile(path.join(UPLOADS_DIR, 'fa693e07-e81a-4eda-94f7-36d1299a2f47.xlsx'));
  const externalBuffer = await fs.readFile(path.join(UPLOADS_DIR, 'fb5b45e9-e561-4594-8d4f-b9f223eacc9c.xlsx'));

  const internalData = await parseExcel(internalBuffer);
  const externalData = await parseExcel(externalBuffer);

  // 分析内部订单的ID列
  console.log('\n【内部订单表 - ID列分析】(fa69...xlsx)');
  console.log('-'.repeat(100));

  const internalHeader = internalData[0];
  const idColumns = [1, 3, 25]; // order_sn, delivery_order_sn, platform_order_id

  for (const colIdx of idColumns) {
    const colName = internalHeader[colIdx];
    const samples = internalData.slice(1, 6).map(row => String(row[colIdx] || '').substring(0, 30));
    console.log(`列${colIdx}: ${colName}`);
    console.log(`  样本: ${samples.join(' | ')}`);
  }

  // 分析外部订单的ID列
  console.log('\n【外部订单表 - ID列分析】(fb5b...xlsx)');
  console.log('-'.repeat(100));

  const externalHeader = externalData[0];
  const externalIdColumns = [6, 7]; // 第三方订单ID, 达达订单ID

  for (const colIdx of externalIdColumns) {
    const colName = externalHeader[colIdx];
    const samples = externalData.slice(1, 6).map(row => String(row[colIdx] || '').substring(0, 30));
    console.log(`列${colIdx}: ${colName}`);
    console.log(`  样本: ${samples.join(' | ')}`);
  }

  // 尝试匹配
  console.log('\n【尝试匹配分析】');
  console.log('-'.repeat(100));

  // 构建外部订单索引 (用达达订单ID)
  const externalMap = new Map();
  for (let i = 1; i < externalData.length; i++) {
    const row = externalData[i];
    const dadaId = String(row[7] || '').trim();
    const thirdPartyId = String(row[6] || '').trim();
    if (dadaId) externalMap.set(dadaId, { thirdPartyId, row });
  }

  // 检查内部订单的ID是否能匹配外部
  let matchByDeliveryOrderSn = 0;
  let matchByPlatformOrderId = 0;
  let matchByThirdPartyId = 0;

  for (let i = 1; i < Math.min(internalData.length, 100); i++) {
    const row = internalData[i];

    // 尝试用 delivery_order_sn 匹配
    const deliveryOrderSn = String(row[3] || '').trim();
    if (externalMap.has(deliveryOrderSn)) {
      matchByDeliveryOrderSn++;
    }

    // 尝试用 platform_order_id 匹配
    const platformOrderId = String(row[25] || '').trim();
    if (platformOrderId && externalMap.has(platformOrderId)) {
      matchByPlatformOrderId++;
    }

    // 尝试用 order_sn + suffix 匹配
    const orderSn = String(row[1] || '').trim();
    const parts = deliveryOrderSn.split('_');
    if (parts.length >= 2) {
      const baseOrderSn = parts[0];
      if (externalMap.has(baseOrderSn)) {
        matchByThirdPartyId++;
      }
    }
  }

  console.log(`前100条内部订单中:`);
  console.log(`  直接匹配 external.达达订单ID: ${matchByDeliveryOrderSn}`);
  console.log(`  匹配 external.第三方订单ID: ${matchByPlatformOrderId}`);
  console.log(`  匹配 base order_sn: ${matchByThirdPartyId}`);

  // 检查外部订单的第三方订单ID
  console.log('\n【外部订单的第三方订单ID分析】');
  const thirdPartyIds = externalData.slice(1, 11).map(row => ({
    thirdParty: String(row[6] || '').substring(0, 25),
    dada: String(row[7] || '').substring(0, 25),
  }));

  console.log('第三方订单ID -> 达达订单ID:');
  for (const item of thirdPartyIds) {
    console.log(`  ${item.thirdParty} -> ${item.dada}`);
  }
}

main().catch(console.error);
