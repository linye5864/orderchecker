# Python 对账核心逻辑梳理

## 一、文件结构概览

### 核心文件
```
src/
├── main.py                    # 主程序入口
├── config.py                 # 配置管理（登录凭据、参数）
├── data_checker.py            # 核心对账逻辑引擎 ⭐
├── data_processor.py          # 数据处理工具（CSV 解析、汇总）
├── ui.py                     # 用户界面初始化
├── run_tests.py              # 单元测试框架
├── test.py                   # 简单测试
└── _local_order/
    ├── delivery_order.py       # 配送单数据模型
    └── transation_order.py    # 流水单数据模型
└── _3rd_order/
    ├── base_order.py           # 第三方平台订单基类 ⭐
    ├── shansong_order.py       # 闪送平台实现
    ├── dada_order.py          # 达达平台实现
    ├── fengniao_order.py      # 蜂鸟平台实现
    ├── xunfeng_order.py       # 顺丰同城平台实现
    ├── xunfeng_c_order.py     # 顺丰企业 C 平台实现
    ├── guoxiaodi_order.py     # 裹小递平台实现
    ├── uu_order.py            # UU 跑腿平台实现
    └── meituan_order.py       # 美团平台实现
```

---

## 二、核心对账算法（data_checker.py）

### 2.1 三方数据架构

对账涉及三个数据源：

| 数据源 | 模型 | 作用 |
|--------|------|------|
| **配送单** | DeliveryOrder | 平台内部订单记录，包含扣款金额 |
| **第三方平台订单** | Base3rdOrder 子类 | 各配送服务商的账单数据 |
| **商户流水单** | TransactionOrder | 商户资金流水，包含扣款记录 |

### 2.2 核心对账流程（do_platform_check 方法）

```python
def do_platform_check(delivery_orders: List[DeliveryOrder],
                     platform_orders: List[Base3rdOrder],
                     transation_orders: List[TransactionOrder]) -> List[CheckResult]:
    """
    三方数据交叉验证逻辑

    对每个配送单订单：
    1. 查找对应的第三方平台订单
    2. 查找对应的商户流水扣款记录
    3. 比对三方金额是否一致
    4. 生成对账结果
    """
    # 实现细节见下节
```

### 2.3 订单匹配规则

#### 配送单到平台订单的匹配

| 匹配条件 | 说明 |
|-----------|------|
| **订单号匹配** | 订单号完全一致（去除特殊字符后） |
| **平台标识** | 配送单的平台字段与平台订单的平台字段一致 |
| **时间范围** | 配送日期在对账范围内 |

**特殊处理**：
- 闪送：订单编号后自动加逗号进行匹配
- 部分平台：订单号可能包含额外前缀或后缀

#### 平台订单到流水的匹配

| 匹配条件 | 说明 |
|-----------|------|
| **订单号匹配** | 平台订单号与流水订单号一致 |
| **时间匹配** | 扣款时间在合理范围内 |
| **金额匹配** | 平台扣款金额与流水扣款金额一致 |

### 2.4 金额计算规则

#### 配送单金额计算

```python
# 实际扣款金额
if order_status == "完成":
    actual_deduction = order_amount
elif order_status == "取消":
    actual_deduction = violation_amount  # 违约金
else:
    actual_deduction = 0
```

#### 平台订单金额计算

| 平台 | 扣款字段 | 完成状态字段 | 取消状态字段 | 特殊规则 |
|------|-----------|------------|------------|---------|
| 闪送 | pay_amount | 已完成 | 已取消 | 订单编号加逗号 |
| 达达 | consume_amount | 已完成 | 已取消 | 无 |
| 蜂鸟 | delivery_fee | 已送达 | 配送异常/商户取消 | 无 |
| 顺丰同城 | delivery_price | 已完成 | 已取消 | 无 |
| 顺丰企业 C | pay_price | 已完成 | 已取消 | 无 |
| 裹小递 | pay_amount | 已完成 | 已退款 | 需传平台 ID |
| UU 跑腿 | pay_amount | 完成 | 取消 | 无 |

#### 流水金额计算

```python
# 商户余额验证
balance_check = initial_amount + reward_amount + recharge_amount - deduction_amount

# 检测异常
if deduction_amount > 0 and abs(balance_check - actual_balance) > tolerance:
    raise Exception("商户扣款异常")
```

### 2.5 异常检测逻辑

#### 异常类型

| 异常类型 | 检测条件 | 严重程度 |
|-----------|-----------|---------|
| **订单缺失** | 配送单在第三方平台未找到 | 🔴 高 |
| **金额不匹配-平台扣款** | 配送单扣款 ≠ 平台扣款 | 🔴 高 |
| **金额不匹配-商户流水** | 配送单扣款 ≠ 流水扣款 | 🔴 高 |
| **三方全不匹配** | 配送单扣款 ≠ 平台扣款 ≠ 流水扣款 | 🔴 高 |
| **违约订单** | 取消订单存在违约金 | 🟡 中 |
| **商户余额异常** | 计算余额与实际余额不符 | 🟡 中 |
| **数据缺失** | 必填字段缺失 | 🟠 低 |

#### 异常统计

```python
# 统计各类异常数量
total_pass_count = 0       # 通过的订单数
total_fail_count = 0      # 失败的订单数
exception_types = {
    "missing": 0,          # 缺失订单
    "amount_mismatch": 0,  # 金额不匹配
    "violation": 0,        # 违约订单
    "balance_error": 0,     # 余额异常
}
```

### 2.6 对账结果格式

```python
class CheckResult:
    """
    对账结果数据结构

    Attributes:
        delivery_order_sn: str          # 配送单订单号
        delivery_platform: str          # 配送平台名称
        delivery_amount: float         # 配送单扣款金额
        platform_order_sn: str         # 平台订单号
        platform_amount: float         # 平台扣款金额
        transaction_sn: str            # 流水订单号
        transaction_amount: float       # 流水扣款金额
        status: str                   # 对账状态 (PASS/FAIL)
        exception_type: str            # 异常类型
        exception_reason: str          # 异常原因
        exception_amount: float        # 差异金额
    """
```

---

## 三、数据模型详解

### 3.1 配送单模型（delivery_order.py）

```python
class DeliveryOrder:
    """
    配送单数据模型

    Attributes:
        delivery_order_sn: str       # 订单号
        delivery_platform: str       # 发单运力（平台）
        delivery_status: str        # 配送状态
        delivery_channel: int        # 配送渠道
        free: float                 # 扣款金额（实际）
        delivery_time: str           # 配送时间
    """
```

### 3.2 流水单模型（transation_order.py）

```python
class TransactionOrder:
    """
    商户流水单数据模型

    Attributes:
        transaction_sn: str           # 流水号
        transaction_time: str        # 交易时间
        transaction_type: str        # 交易类型
        transaction_amount: float     # 交易金额
        balance: float                # 余额
    """
```

### 3.3 第三方平台订单基类（base_order.py）

```python
class Base3rdOrder(ABC):
    """
    第三方平台订单基类（抽象类）

    Abstract Methods:
        match_with_delivery(self, delivery_order: DeliveryOrder) -> bool:
            """
            判断平台订单是否与配送单匹配

            Returns:
                True: 匹配
                False: 不匹配
            """

        get_actual_deduction(self) -> float:
            """
            获取实际扣款金额

            Returns:
                实际扣款金额
            """

        get_order_sn(self) -> str:
            """
            获取平台订单号

            Returns:
                标准化的订单号
            """
```

### 3.4 各平台实现示例

#### 闪送实现（shansong_order.py）

```python
class ShanSongOrder(Base3rdOrder):
    """
    闪送平台订单实现

    特殊规则：
        - 订单编号后自动加逗号进行匹配
    """

    def match_with_delivery(self, delivery_order: DeliveryOrder) -> bool:
        # 闪送特殊规则：订单编号后加逗号
        delivery_sn = delivery_order.delivery_order_sn.replace(",", "")
        platform_sn = self.order_sn.replace(",", "")
        return delivery_sn == platform_sn

    def get_actual_deduction(self) -> float:
        if self.status == "已完成":
            return self.pay_amount
        elif self.status == "已取消":
            return self.cancel_deduction_amount
        else:
            return 0
```

#### 达达实现（dada_order.py）

```python
class DadaOrder(Base3rdOrder):
    """
    达达平台订单实现

    特殊规则：
        - 无特殊匹配规则，直接使用订单号匹配
    """

    def match_with_delivery(self, delivery_order: DeliveryOrder) -> bool:
        # 达达直接匹配订单号
        return self.order_id == delivery_order.delivery_order_sn

    def get_actual_deduction(self) -> float:
        if self.status == "已完成":
            return self.consume_amount
        elif self.status == "已取消":
            return self.cancel_amount
        else:
            return 0
```

---

## 四、数据处理工具（data_processor.py）

### 4.1 CSV 文件解析

```python
def parse_csv_file(file_path: str, encoding: str = "gbk") -> List[Dict]:
    """
    解析 CSV 文件

    Args:
        file_path: 文件路径
        encoding: 编码格式（默认 GBK，支持中文）

    Returns:
        解析后的数据列表（字典列表）

    Features:
        - 支持自定义分隔符
        - 自动检测编码
        - 跳过空行
    """
```

### 4.2 数据汇总

```python
def summarize_by_platform(data: List[Dict], platform_field: str) -> Dict[str, Dict]:
    """
    按平台维度汇总数据

    Args:
        data: 数据列表
        platform_field: 平台字段名称

    Returns:
        按平台分组的汇总数据
        {
            "闪送": {"count": 456, "amount": 45600},
            "达达": {"count": 398, "amount": 38900},
            ...
        }
    """
```

### 4.3 数据验证

```python
def validate_order_fields(order: Dict, required_fields: List[str]) -> bool:
    """
    验证订单字段完整性

    Args:
        order: 订单数据字典
        required_fields: 必填字段列表

    Returns:
        True: 所有必填字段存在
        False: 存在缺失字段

    Raises:
        ValueError: 当字段缺失时
    """
```

---

## 五、对账流程图

```
开始
  ↓
加载三方数据（配送单、平台订单、流水单）
  ↓
数据解析和标准化
  ↓
初始化对账引擎
  ↓
遍历每个配送单
  ↓
查找对应平台订单
  ↓ (未找到)
记录异常：订单缺失
  ↓ (找到)
查找对应流水订单
  ↓ (未找到)
记录异常：流水缺失
  ↓ (找到)
三方金额比对
  ↓
比对结果判断
  ├─ 金额一致 → 记录 PASS
  ├─ 配送单≠平台 → 记录金额不匹配
  ├─ 配送单≠流水 → 记录金额不匹配
  └─ 三方全不匹配 → 记录严重异常
  ↓
统计汇总
  ↓
生成对账报告
  ↓
结束
```

---

## 六、测试框架（run_tests.py）

### 6.1 测试类型

```python
class TestRunner:
    """
    测试运行器

    Features:
        - 多线程并发执行
        - 测试结果统计
        - HTML 格式报告生成
        - 单元测试框架集成
    """
```

### 6.2 测试用例

| 测试类型 | 说明 |
|---------|------|
| **匹配测试** | 测试订单号匹配逻辑 |
| **金额测试** | 测试金额计算准确性 |
| **异常检测测试** | 测试各类异常的识别 |
| **边界测试** | 测试空数据、超大文件等边界情况 |
| **性能测试** | 测试大数据量处理性能 |

---

## 七、配置管理（config.py）

### 7.1 配置项

```python
class Config:
    """
    系统配置管理

    配置项：
        - 登录凭据（用户名、密码）
        - 数据库连接信息
        - API 端点
        - 日志级别
        - 容差阈值
    """
```

### 7.2 环境变量

```python
# 配置文件位置
config_path = "config/config.ini"

# 环境变量
API_BASE_URL
DATABASE_PATH
LOG_LEVEL
TOLERANCE_THRESHOLD
```

---

## 八、与现有后端架构的对比

### 8.1 当前 Python 实现

**架构**：独立脚本 + 本地文件处理
- 数据解析：Python
- 对账逻辑：Python
- 数据存储：本地 CSV/Excel 文件
- 用户界面：命令行/简单 UI

### 8.2 新后端架构（Node.js + TypeScript）

**架构**：Web 应用 + 数据库 + API
- 数据解析：JavaScript/TypeScript（前端）+ Node.js（后端）
- 对账逻辑：待迁移
- 数据存储：PostgreSQL/SQLite
- 用户界面：React Web 应用

### 8.3 迁移建议

#### 阶段 1：数据模型迁移

| Python 模型 | TypeScript 接口 | 映射关系 |
|------------|----------------|---------|
| DeliveryOrder | DeliveryOrder | 完全对应 |
| TransactionOrder | TransactionOrder | 完全对应 |
| Base3rdOrder | PlatformOrder | 完全对应 |
| ShanSongOrder | ShanSongOrder | 完全对应 |
| DadaOrder | DadaOrder | 完全对应 |

#### 阶段 2：对账逻辑迁移

```python
# Python 核心逻辑（data_checker.py）
def do_platform_check(...):
    # 1. 订单匹配
    for delivery in delivery_orders:
        platform = find_platform_order(delivery)
        if platform:
            # 2. 金额比对
            if compare_amounts(delivery, platform, transaction):
                return PASS
            else:
                return FAIL
        else:
            return MISSING

# TypeScript 对应实现（reconciliation.service.ts）
async function executeReconciliation(...):
    // 1. 加载数据库
    const deliveryOrders = await loadDeliveryOrders();
    const platformOrders = await loadPlatformOrders();
    const transactions = await loadTransactions();

    // 2. 执行对账
    const results = [];
    for (const delivery of deliveryOrders) {
        const platform = await findPlatformOrder(delivery.orderSn);
        const transaction = await findTransaction(delivery.orderSn);

        const result = compareAmounts(delivery, platform, transaction);
        results.push(result);
    }

    // 3. 保存结果
    await saveReconciliationResults(results);
}
```

#### 阶段 3：异常处理迁移

```python
# Python 异常类型
exception_types = {
    "missing": "订单缺失",
    "amount_mismatch": "金额不匹配",
    "violation": "违约订单",
    "balance_error": "余额异常",
}

# TypeScript 对应类型（types/index.ts）
export type ExceptionType = 'MISSING' | 'AMOUNT_MISMATCH' | 'VIOLATION' | 'BALANCE_ERROR';
```

---

## 九、关键算法说明

### 9.1 订单号匹配算法

```python
def normalize_order_sn(order_sn: str, platform_type: str) -> str:
    """
    标准化订单号

    根据不同平台类型应用不同的标准化规则

    Args:
        order_sn: 原始订单号
        platform_type: 平台类型

    Returns:
        标准化后的订单号
    """
    # 闪送：去除逗号
    if platform_type == "shansong":
        return order_sn.replace(",", "")

    # 其他平台：去除特殊字符
    return order_sn.strip().upper()
```

### 9.2 金额比对算法

```python
def compare_amounts(delivery_amount: float,
                    platform_amount: float,
                    transaction_amount: float,
                    tolerance: float = 0.01) -> ComparisonResult:
    """
    金额比对算法

    Args:
        delivery_amount: 配送单扣款金额
        platform_amount: 平台扣款金额
        transaction_amount: 流水扣款金额
        tolerance: 容差阈值

    Returns:
        比对结果对象
    """
    # 精确匹配
    if abs(delivery_amount - platform_amount) < tolerance and \
       abs(platform_amount - transaction_amount) < tolerance:
        return ComparisonResult(
            status="PASS",
            reason="三方金额一致"
        )

    # 部分不匹配
    if abs(delivery_amount - platform_amount) >= tolerance:
        return ComparisonResult(
            status="FAIL",
            exception_type="AMOUNT_MISMATCH_PLATFORM",
            exception_reason=f"平台扣款差异 {abs(delivery_amount - platform_amount)} 元",
            exception_amount=abs(delivery_amount - platform_amount)
        )

    # 更多检测...
```

---

## 十、建议和优化方向

### 10.1 当前问题

1. **性能问题**
   - 大数据量时对账速度慢
   - 内存占用高
   - 未使用数据库索引

2. **可维护性问题**
   - 平台特定逻辑分散在多个文件中
   - 缺少统一的错误处理
   - 配置硬编码

3. **扩展性问题**
   - 添加新平台需要创建新文件和类
   - 字段映射不灵活
   - 缺少配置化

### 10.2 优化建议

1. **数据库优化**
   - 为订单号、时间等常用查询字段添加索引
   - 使用连接查询代替多次单表查询
   - 考虑使用内存缓存（Redis）

2. **架构优化**
   - 引入工厂模式管理不同平台
   - 使用策略模式处理不同匹配规则
   - 引入模板方法模式统一数据处理

3. **功能增强**
   - 支持增量对账（只对账新增订单）
   - 支持异步对账（后台任务队列）
   - 添加对账结果导出和通知
   - 支持人工修正和对账回滚

4. **代码质量优化**
   - 添加完整的单元测试覆盖
   - 使用类型注解（Python 3.9+）
   - 完善错误日志和监控
   - 使用 Lint 工具（如 pylint）

---

## 十一、总结

### 核心要点

1. **三方数据交叉验证**：配送单、平台订单、流水单三方数据必须一致
2. **订单号匹配**：各平台有特定的订单号匹配规则（如闪送加逗号）
3. **金额计算**：根据订单状态（完成/取消）计算实际扣款金额
4. **异常检测**：自动识别订单缺失、金额不匹配、违约订单等异常
5. **可扩展性**：通过继承基类 Base3rdOrder 支持新平台扩展

### 迁移关键点

- Python 逻辑完全可以直接迁移到 TypeScript/Node.js
- 数据模型结构相似，易于转换
- 对账算法清晰，易于实现
- 建议优先迁移核心对账逻辑（data_checker.py）
