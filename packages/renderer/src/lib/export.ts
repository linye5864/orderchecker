/**
 * Excel 导出工具
 * 使用 xlsx 库将数据导出为 Excel 文件
 */

export interface ExportRow {
  [key: string]: string | number | boolean | null | undefined;
}

export interface ExportColumn {
  key: string;
  label: string;
  width?: number;
}

/**
 * 导出数据为 Excel 文件
 * @param data - 要导出的数据数组
 * @param columns - 列配置
 * @param filename - 文件名（不含扩展名）
 */
export async function exportToExcel(
  data: ExportRow[],
  columns: ExportColumn[],
  filename: string = `export_${Date.now()}`
): Promise<void> {
  const XLSX = await import('xlsx');

  // 创建工作簿和工作表
  const workbook = XLSX.utils.book_new();

  // 转换数据格式：使用列配置的 key 和 label
  const worksheetData = [columns.map(col => col.label)];
  data.forEach(row => {
    const rowData = columns.map(col => {
      const value = row[col.key];
      return String(value ?? '');
    });
    worksheetData.push(rowData);
  });

  // 创建工作表
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // 设置列宽
  if (columns.some(col => col.width)) {
    const colWidths = columns.map(col => ({
      wch: col.width || 15
    }));
    worksheet['!cols'] = colWidths;
  }

  // 添加工作表到工作簿
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

  // 生成并下载文件
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

/**
 * 导出简单表格数据
 * @param data - 数据对象数组
 * @param filename - 文件名
 */
export async function exportSimpleData(
  data: Record<string, any>[],
  filename: string = `export_${Date.now()}`
): Promise<void> {
  if (data.length === 0) {
    console.warn('没有数据可导出');
    return;
  }

  const XLSX = await import('xlsx');

  // 自动提取列名
  const columns: ExportColumn[] = Object.keys(data[0]).map(key => ({
    key,
    label: key,
  }));

  await exportToExcel(data, columns, filename);
}

/**
 * 导出对账结果
 * @param results - 对账结果数据 (ReconciliationSummary 结构)
 * @param filename - 文件名
 */
export async function exportReconciliationResults(
  results: any,
  filename: string = `reconciliation_${Date.now()}`
): Promise<void> {
  const XLSX = await import('xlsx');

  const workbook = XLSX.utils.book_new();

  // 准备明细数据
  const allOrders = results.details || [];
  
  // 按状态分组
  const matchedOrders = allOrders.filter((o: any) => o.status === 'MATCHED');
  const exceptionOrders = allOrders.filter((o: any) => o.status === 'EXCEPTION');
  const missingOrders = allOrders.filter((o: any) => o.status === 'MISSING');

  // 格式化金额（分转元）
  const formatMoney = (cents: number) => {
    if (cents === undefined || cents === null) return '-';
    return (cents / 100).toFixed(2);
  };

  // 格式化时间
  const formatTime = (date: Date | string | undefined) => {
    if (!date) return '-';
    if (date instanceof Date) return date.toLocaleString('zh-CN');
    try {
      return new Date(date).toLocaleString('zh-CN');
    } catch {
      return String(date);
    }
  };

  // 导出匹配订单
  if (matchedOrders.length > 0) {
    const matchedData = matchedOrders.map((order: any) => ({
      配送单号: order.orderNumber,
      平台单号: order.platformOrderNumber || '-',
      配送单金额: formatMoney(order.localAmount),
      平台账单金额: formatMoney(order.platformAmount),
      差额: formatMoney(order.amountDiff),
      配送状态: order.localStatus || '-',
      平台状态: order.platformStatus || '-',
      异常原因: order.reason || '-',
      下单时间: formatTime(order.createdAt),
    }));

    const matchedSheet = XLSX.utils.json_to_sheet(matchedData);
    // 设置列宽
    matchedSheet['!cols'] = [
      { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(workbook, matchedSheet, '匹配订单');
  }

  // 导出异常订单
  if (exceptionOrders.length > 0) {
    const exceptionData = exceptionOrders.map((order: any) => ({
      配送单号: order.orderNumber,
      平台单号: order.platformOrderNumber || '-',
      配送单金额: formatMoney(order.localAmount),
      平台账单金额: formatMoney(order.platformAmount),
      差额: formatMoney(order.amountDiff),
      配送状态: order.localStatus || '-',
      平台状态: order.platformStatus || '-',
      异常原因: order.reason || '-',
      下单时间: formatTime(order.createdAt),
    }));

    const exceptionSheet = XLSX.utils.json_to_sheet(exceptionData);
    exceptionSheet['!cols'] = [
      { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(workbook, exceptionSheet, '异常订单');
  }

  // 导出缺失订单
  if (missingOrders.length > 0) {
    const missingData = missingOrders.map((order: any) => ({
      配送单号: order.orderNumber,
      平台单号: order.platformOrderNumber || '(未找到)',
      配送单金额: formatMoney(order.localAmount),
      平台账单金额: formatMoney(order.platformAmount),
      差额: formatMoney(order.amountDiff),
      配送状态: order.localStatus || '-',
      平台状态: order.platformStatus || '-',
      异常原因: order.reason || '-',
      下单时间: formatTime(order.createdAt),
    }));

    const missingSheet = XLSX.utils.json_to_sheet(missingData);
    missingSheet['!cols'] = [
      { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(workbook, missingSheet, '缺失订单');
  }

  // 导出汇总信息
  const summaryData = [
    { 项目: '总订单数', 数值: results.totalOrders || 0, 说明: '有效配送订单数' },
    { 项目: '匹配成功', 数值: results.matchedOrders || 0, 说明: '' },
    { 项目: '金额异常', 数值: results.exceptionOrders || 0, 说明: '金额不匹配' },
    { 项目: '订单缺失', 数值: results.missingOrders || 0, 说明: '平台账单未找到' },
    { 项目: '匹配率', 数值: `${(results.matchRate || 0).toFixed(2)}%`, 说明: '匹配成功/总订单数' },
    { 项目: '', 数值: '', 说明: '' },
    { 项目: '配送单总金额', 数值: `¥${formatMoney(results.totalLocalAmount)}`, 说明: '' },
    { 项目: '平台账单总金额', 数值: `¥${formatMoney(results.totalPlatformAmount)}`, 说明: '' },
    { 项目: '金额差异', 数值: `¥${formatMoney(results.amountDiff)}`, 说明: '' },
  ];

  const summarySheet = XLSX.utils.json_to_sheet(summaryData);
  summarySheet['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, '汇总');

  // 导出全部明细（可选）
  if (allOrders.length > 0) {
    const allData = allOrders.map((order: any) => ({
      配送单号: order.orderNumber,
      平台单号: order.platformOrderNumber || '-',
      状态: order.status === 'MATCHED' ? '匹配成功' :
             order.status === 'MISSING' ? '订单缺失' : '金额异常',
      配送单金额: formatMoney(order.localAmount),
      平台账单金额: formatMoney(order.platformAmount),
      差额: formatMoney(order.amountDiff),
      异常原因: order.reason || '-',
      下单时间: formatTime(order.createdAt),
    }));

    const allSheet = XLSX.utils.json_to_sheet(allData);
    allSheet['!cols'] = [
      { wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 15 }, { wch: 15 },
      { wch: 12 }, { wch: 30 }, { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(workbook, allSheet, '全部订单');
  }

  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
