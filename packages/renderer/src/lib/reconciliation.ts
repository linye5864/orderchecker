/**
 * 对账核心模块
 * 实现 Python comparator.py 的核心对账逻辑
 */

// ==================== 类型定义 ====================

/**
 * 配送订单数据类型
 */
export interface DeliveryOrder {
  delivery_order_sn: string;      // 配送订单号
  发单运力: string;               // 发单运力平台
  配送状态: string;               // 配送状态
  delivery_channel: number;       // 配送渠道
  free: number;                   // 金额
  [key: string]: unknown;         // 其他字段
}

/**
 * 第三方平台订单数据类型
 */
export interface PlatformOrder {
  '三方订单编号': string;           // 三方订单编号
  '订单编号': string;               // 平台订单编号
  '订单状态': string;               // 订单状态
  '实付金额(元)': string;           // 实付金额
  '取消单扣款金额(元)': string;     // 取消单扣款金额
  [key: string]: unknown;         // 其他字段
}

/**
 * 本地流水数据类型
 */
export interface LocalFlowOrder {
  admin_id: string;               // 商户号
  type: number;                   // 类型
  method: number;                 // 方法
  money: number;                  // 金额
  delivery_order_id: string;      // 配送订单号
  [key: string]: unknown;         // 其他字段
}

/**
 * 对账结果 - 单个订单对比
 */
export interface OrderComparisonResult {
  orderNumber: string;           // 订单号
  localAmount: number;           // 本地金额
  platformAmount: number;        // 平台金额
  platformOrderNo: string;       // 平台订单号
  platformStatus: string;        // 平台订单状态
  difference: number;            // 差值
  isMatched: boolean;            // 是否匹配
  reason?: string;               // 异常原因
  localOrderData?: DeliveryOrder;// 本地订单原始数据
  platformOrderData?: PlatformOrder;// 平台订单原始数据
}

/**
 * 对账汇总结果
 */
export interface ReconciliationSummary {
  totalLocalOrders: number;       // 本地订单总数
  totalPlatformOrders: number;    // 平台订单总数
  totalLocalAmount: number;       // 本地总金额
  totalPlatformAmount: number;    // 平台总金额
  difference: number;             // 总差值
  isBalanced: boolean;            // 是否平衡
  matchedCount: number;           // 匹配成功数
  exceptionCount: number;         // 异常订单数
  exceptionOrders: OrderComparisonResult[];// 异常订单列表

  // 用于 ResultsPage 显示的额外字段
  totalOrders?: number;
  matchedOrders?: number;
  matchRate?: number;
  results?: any;
}

/**
 * 商户对账结果
 */
export interface MerchantReconciliationResult {
  adminId: string;                // 商户号
  newCustomerReward: number;      // 新客奖励
  userRecharge: number;           // 用户充值
  merchantSettlement: number;     // 商户结算
  orderTotalFree: number;         // 订单扣款总额
  isBalanced: boolean;            // 是否平衡
  validOrders: string[];          // 有效订单列表
}

/**
 * 对账配置
 */
export interface ReconciliationConfig {
  platformName: string;           // 平台名称
  localOrderColumn: string;       // 本地订单号列名
  platformOrderColumn: string;    // 平台订单号列名
  statusColumn: string;           // 状态列名
  amountColumn: string;           // 金额列名
  cancelledAmountColumn?: string; // 取消订单金额列名
  filterConditions: {
    发单运力?: string;            // 发单运力条件
    配送状态?: string;            // 配送状态条件
    delivery_channel?: number;    // 渠道条件
  };
}

// ==================== 默认配置 ====================

/**
 * 闪送平台默认配置
 */
const SHANSONG_CONFIG: ReconciliationConfig = {
  platformName: '闪送',
  localOrderColumn: 'delivery_order_sn',
  platformOrderColumn: '三方订单编号',
  statusColumn: '订单状态',
  amountColumn: '实付金额(元)',
  cancelledAmountColumn: '取消单扣款金额(元)',
  filterConditions: {
    发单运力: '闪送',
    配送状态: '配送完成',
    delivery_channel: 0,
  },
};

// ==================== 核心对账逻辑 ====================

/**
 * 执行配送单与第三方平台订单对账
 * 对应 Python comparator.py 的 compare_data() 方法
 */
export function compareDeliveryWithPlatform(
  localOrders: DeliveryOrder[],
  platformOrders: PlatformOrder[],
  config: ReconciliationConfig = SHANSONG_CONFIG
): ReconciliationSummary {
  console.log(`----------------------- 配送单与${config.platformName}平台对账 -----------------------`);

  // 验证本地订单
  if (!localOrders || localOrders.length === 0) {
    throw new Error('配送单数据为空');
  }

  // 验证第三方订单
  if (!platformOrders || platformOrders.length === 0) {
    throw new Error(`${config.platformName}订单数据为空`);
  }

  // 过滤本地订单 - 只保留符合条件的数据
  const filteredLocalOrders = localOrders.filter((order) => {
    const { filterConditions } = config;
    
    if (filterConditions.发单运力 && order.发单运力 !== filterConditions.发单运力) {
      return false;
    }
    if (filterConditions.配送状态 && order.配送状态 !== filterConditions.配送状态) {
      return false;
    }
    if (filterConditions.delivery_channel !== undefined && 
        order.delivery_channel !== filterConditions.delivery_channel) {
      return false;
    }
    return true;
  });

  console.log(`配送订单符合条件的数据有 ${filteredLocalOrders.length} 条`);

  // 统计平台订单总数
  const totalPlatformOrders = platformOrders.length;
  console.log(`第三方${config.platformName}订单共有 ${totalPlatformOrders} 条数据（含配送完成与取消）`);

  let totalPlatformAmount = 0;
  let totalLocalAmount = 0;
  const exceptionOrders: OrderComparisonResult[] = [];
  const matchedOrders: OrderComparisonResult[] = [];

  // 遍历本地订单进行对账
  for (const order of filteredLocalOrders) {
    const orderNumber = order[config.localOrderColumn] as string;
    const orderAmount = order.free as number;

    // 累计本地配送有效订单扣款金额之和
    totalLocalAmount += orderAmount;

    // 查找第三方订单（注意：平台订单号可能带有尾部逗号）
    const platformOrder = platformOrders.find(
      (p) => p[config.platformOrderColumn] === orderNumber + ',' || 
             p[config.platformOrderColumn] === orderNumber
    );

    if (platformOrder) {
      const platformOrderNumber = platformOrder[config.platformOrderColumn] as string;
      const platformSelfNumber = platformOrder['订单编号'] as string;
      const platformStatus = platformOrder[config.statusColumn] as string;

      // 计算平台金额
      let platformAmount = 0;
      if (platformStatus === `${config.platformName}完成`) {
        const amountStr = String(platformOrder[config.amountColumn] ?? '0');
        platformAmount = parseFloat(amountStr.replace(/,/g, '').trim());
      } else if (platformStatus === '已取消' && config.cancelledAmountColumn) {
        const amountStr = String(platformOrder[config.cancelledAmountColumn] ?? '0');
        platformAmount = parseFloat(amountStr.replace(/,/g, '').trim());
      }

      // 累计平台订单扣款金额之和
      totalPlatformAmount += platformAmount;

      // 计算差值
      const difference = roundToTwoDecimals(platformAmount - orderAmount);
      const isMatched = platformAmount === orderAmount;

      const result: OrderComparisonResult = {
        orderNumber,
        localAmount: orderAmount,
        platformAmount,
        platformOrderNo: platformSelfNumber,
        platformStatus,
        difference,
        isMatched,
        reason: isMatched ? undefined : `金额不一致，差值: ${difference.toFixed(2)}`,
        localOrderData: order,
        platformOrderData: platformOrder,
      };

      if (isMatched) {
        console.log(`Pass: 配送单: '${orderNumber}' 金额: '${orderAmount.toFixed(2)}';\t${config.platformName}订单: '${platformSelfNumber}' 状态: '${platformStatus}' 金额: '${platformAmount.toFixed(2)}'`);
        matchedOrders.push(result);
      } else {
        const orderMessage = `Fail: 配送单: '${orderNumber}' 金额: '${orderAmount.toFixed(2)}';\t${config.platformName}订单: '${platformSelfNumber}' 状态: '${platformStatus}' 金额: '${platformAmount.toFixed(2)}';\t差值: '${difference.toFixed(2)}'`;
        console.log(orderMessage);
        result.reason = `金额不一致，差值: ${difference.toFixed(2)}`;
        exceptionOrders.push(result);
      }
    } else {
      // 未找到对应的第三方订单
      const errorMsg = `${config.platformName}订单中未找到配送订单中对应的订单编号: '${orderNumber}'，金额：'${orderAmount}'`;
      console.log(errorMsg);
      exceptionOrders.push({
        orderNumber,
        localAmount: orderAmount,
        platformAmount: 0,
        platformOrderNo: '',
        platformStatus: '未找到',
        difference: -orderAmount,
        isMatched: false,
        reason: errorMsg,
        localOrderData: order,
      });
    }
  }

  // 对两个累计和统一2位小数精度
  totalPlatformAmount = roundToTwoDecimals(totalPlatformAmount);
  totalLocalAmount = roundToTwoDecimals(totalLocalAmount);
  const totalDifference = roundToTwoDecimals(totalPlatformAmount - totalLocalAmount);

  // 输出对账结果
  if (totalDifference === 0) {
    console.log(`对账正常: 配送单与${config.platformName}第三方订单扣款金额相等(${totalPlatformAmount})`);
  } else {
    const exceptionType = totalDifference > 0 ? '多' : '少';
    console.log(`对账异常: 第三方平台${exceptionType}扣款 ${Math.abs(totalDifference)}元 【 配送单扣款金额:${totalLocalAmount} ${config.platformName}平台扣款金额：${totalPlatformAmount}】`);
    for (const order of exceptionOrders) {
      console.log(order.reason);
    }
  }

  console.log('---------------------------------------------------------------------------\n');

  return {
    totalLocalOrders: filteredLocalOrders.length,
    totalPlatformOrders,
    totalLocalAmount,
    totalPlatformAmount,
    difference: totalDifference,
    isBalanced: totalDifference === 0,
    matchedCount: matchedOrders.length,
    exceptionCount: exceptionOrders.length,
    exceptionOrders: [...exceptionOrders, ...matchedOrders],
  };
}

/**
 * 执行本地流水对账
 * 对应 Python comparator.py 的 local_compare() 方法
 */
export function compareLocalFlow(
  localOrders: DeliveryOrder[],
  localFlow: LocalFlowOrder[]
): MerchantReconciliationResult[] {
  console.log('----------------------------- 本地流水对账 ---------------------------------');

  if (!localFlow || localFlow.length === 0) {
    throw new Error('本地流水订单不存在');
  }

  if (!localOrders || localOrders.length === 0) {
    throw new Error('配送订单数据为空');
  }

  // 获取流水订单中商户号并去重
  const uniqueAdminIds = [...new Set(localFlow.map((flow) => flow.admin_id))];
  const results: MerchantReconciliationResult[] = [];

  for (const adminId of uniqueAdminIds) {
    console.log(`\n---------- 商户'${adminId}'对账 ----------`);
    const adminFlow = localFlow.filter((flow) => flow.admin_id === adminId);

    // 新客奖励 (type=2, method=3)
    const newCustomerReward = adminFlow
      .filter((flow) => flow.type === 2 && flow.method === 3)
      .reduce((sum, flow) => sum + flow.money, 0);

    // 用户充值 (type=2, method in [1, 2])
    const userRecharge = adminFlow
      .filter((flow) => flow.type === 2 && [1, 2].includes(flow.method))
      .reduce((sum, flow) => sum + flow.money, 0);

    // 商户结算 (type=1)
    const merchantSettlement = roundToTwoDecimals(
      Math.abs(adminFlow.filter((flow) => flow.type === 1).reduce((sum, flow) => sum + flow.money, 0))
    );

    const combinedResult = `流水单: 新客奖励 ${newCustomerReward}, 充值 ${userRecharge}, 扣款金额 ${merchantSettlement}`;
    console.log(combinedResult);

    // 获取去重后的订单号
    const uniqueOrderIds = [
      ...new Set(
        adminFlow
          .filter((flow) => flow.type === 1)
          .map((flow) => flow.delivery_order_id)
          .filter((id): id is string => !!id)
      ),
    ];

    if (uniqueOrderIds.length === 0) {
      continue;
    }

    let orderTotalFree = 0;
    const validOrders: string[] = [combinedResult];

    console.log('配送订单中解析对应订单扣款金额...');

    // 遍历订单
    for (const orderId of uniqueOrderIds) {
      const deliveryData = localOrders.filter(
        (order) => order.delivery_order_sn === orderId && order.配送状态 === '配送完成'
      );

      if (deliveryData.length > 0) {
        const dispatchPlatform = deliveryData[0].发单运力?.toString().trim() || '未知';
        const freeValue = deliveryData[0].free as number;

        console.log(`发单运力：${dispatchPlatform}  订单号: '${orderId}' 扣款金额：'${freeValue.toFixed(2)}'`);
        orderTotalFree += freeValue;

        const orderAmounts = localOrders
          .filter(
            (order) => order.delivery_order_sn === orderId && order.配送状态 === '配送完成'
          )
          .map((order) => order.free as number);

        const orderAmountStr = orderAmounts.map((amount) => `${orderId}|${amount}`).join(' ');
        validOrders.push(orderAmountStr);
      } else {
        console.log(`订单号: '${orderId}' 未完成状态, 忽略`);
      }
    }

    orderTotalFree = roundToTwoDecimals(orderTotalFree);
    validOrders.push(`该商户配送单中累计扣款: ${orderTotalFree}`);

    // 输出商户对账结果
    const reconciliationResult = merchantSettlement === orderTotalFree ? '对账成功' : '对账失败';
    console.log(`\n商户(${adminId}) '${reconciliationResult}' 详细对账记录: '${validOrders}'`);

    results.push({
      adminId,
      newCustomerReward,
      userRecharge,
      merchantSettlement,
      orderTotalFree,
      isBalanced: merchantSettlement === orderTotalFree,
      validOrders,
    });
  }

  console.log('---------------------------------------------------------------------------');

  return results;
}

/**
 * 检查配送单各平台扣款汇总
 * 对应 Python comparator.py 的 check_distribution_orders() 方法
 */
export function checkDistributionOrders(localOrders: DeliveryOrder[]): Array<{
  platform: string;
  totalDeduction: number;
  orderCount: number;
}> {
  console.log('--------------------------- 配送单各平台扣款汇总 ---------------------------');

  if (!localOrders || localOrders.length === 0) {
    throw new Error('配送单数据为空');
  }

  const uniquePlatforms = [...new Set(localOrders.map((order) => order.发单运力).filter(Boolean))];
  const results: Array<{ platform: string; totalDeduction: number; orderCount: number }> = [];

  for (const platform of uniquePlatforms) {
    const platformData = localOrders.filter(
      (order) =>
        order.发单运力 === platform &&
        order.配送状态 === '配送完成' &&
        order.delivery_channel === 0
    );

    const platformTotalFree = roundToDecimals(
      platformData.reduce((sum, order) => sum + ((order.free as number) || 0), 0),
      2
    );

    console.log(`配送平台: '${platform}'\t扣款金额总和: '${platformTotalFree.toFixed(2)}'`);

    results.push({
      platform: platform as string,
      totalDeduction: platformTotalFree,
      orderCount: platformData.length,
    });
  }

  return results;
}

// ==================== 工具函数 ====================

/**
 * 四舍五入到2位小数
 */
export function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 四舍五入到指定小数位数
 */
export function roundToDecimals(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * 格式化金额（分转元）
 */
export function formatMoneyFromCents(cents: number | undefined): string {
  if (cents === undefined) return '-';
  const v = cents / 100;
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * 格式化金额（元）
 */
export function formatMoney(yuan: number | undefined): string {
  if (yuan === undefined) return '-';
  return yuan.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ==================== 默认导出 ====================

export default {
  compareDeliveryWithPlatform,
  compareLocalFlow,
  checkDistributionOrders,
  roundToTwoDecimals,
  roundToDecimals,
  formatMoneyFromCents,
  formatMoney,
  SHANSONG_CONFIG,
};
