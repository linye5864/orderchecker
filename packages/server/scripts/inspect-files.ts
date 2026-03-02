/**
 * 文件结构检查脚本
 * 读取Excel文件并显示实际数据结构
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.resolve(__dirname, '../uploads');

async function inspectFile(filePath: string, filename: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📄 文件: ${filename}`);
  console.log(`${'='.repeat(80)}`);

  const buffer = await fs.readFile(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  console.log(`Sheet数量: ${workbook.SheetNames.length}`);
  console.log(`Sheet名称: ${workbook.SheetNames.join(', ')}`);

  for (const sheetName of workbook.SheetNames) {
    console.log(`\n--- Sheet: ${sheetName} ---`);
    const sheet = workbook.Sheets[sheetName];

    // 转换为JSON (不带表头)
    const dataWithoutHeader = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
    console.log(`总行数: ${dataWithoutHeader.length}`);

    if (dataWithoutHeader.length > 0) {
      console.log(`\n前10行数据 (不带表头):`);
      console.log('| 行号 | ' + dataWithoutHeader[0].map((_, i) => `列${i}`).join(' | ') + ' |');
      console.log('|' + '-'.repeat(60) + '|');

      for (let rowIdx = 0; rowIdx < Math.min(10, dataWithoutHeader.length); rowIdx++) {
        const row = dataWithoutHeader[rowIdx];
        const rowStr = row.map((cell: any) => {
          if (cell === undefined || cell === null) return '(空)';
          const str = String(cell);
          return str.length > 15 ? str.substring(0, 12) + '...' : str;
        }).join(' | ');
        console.log(`| ${String(rowIdx + 1).padEnd(5)} | ${rowStr} |`);
      }

      // 尝试识别第一行是否为表头
      console.log('\n第一行分析:');
      const firstRow = dataWithoutHeader[0];
      const headerIndicators = [
        { pattern: /配送单订单号|发单运力|配送状态|free|delivery_channel|下单时间/i, name: '配送单' },
        { pattern: /订单编号|三方订单编号|订单状态|实付金额|取消单扣款|同城运单号|订单号/i, name: '平台账单' },
        { pattern: /admin_id|type|money|delivery_order_id|flow/i, name: '流水账单' },
      ];

      for (const indicator of headerIndicators) {
        const matches = firstRow.filter((cell: any) => indicator.pattern.test(String(cell)));
        if (matches.length > 0) {
          console.log(`  ✓ 可能为${indicator.name}表头，找到匹配: ${matches.join(', ')}`);
        }
      }

      // 检查列数
      console.log(`\n列数: ${firstRow.length}`);
      console.log(`列类型分析:`);
      for (let colIdx = 0; colIdx < Math.min(8, firstRow.length); colIdx++) {
        const samples = dataWithoutHeader.slice(0, 20).map((row: any[]) => row[colIdx]);
        const sampleStr = samples.map(String).slice(0, 3).join(', ');
        console.log(`  列${colIdx}: ${sampleStr}${samples.length > 3 ? '...' : ''}`);
      }
    }
  }
}

async function main() {
  console.log('文件结构检查');
  console.log('='.repeat(80));

  const files = await fs.readdir(UPLOADS_DIR);
  const xlsxFiles = files.filter(f => f.endsWith('.xlsx'));

  for (const file of xlsxFiles) {
    const filePath = path.join(UPLOADS_DIR, file);
    await inspectFile(filePath, file);
  }
}

main().catch(console.error);
