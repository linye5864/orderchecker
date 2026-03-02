# 数据可视化增强方案

## 一、当前可视化实现分析

### 1.1 已实现的组件

| 组件 | 页面 | 实现方式 | 状态 |
|-------|------|---------|------|
| 统计卡片 | DashboardPage | CSS + 图标 | ✅ 已实现 |
| 平台分布图 | DashboardPage | CSS 进度条 | ✅ 已实现 |
| 7天趋势图 | DashboardPage | CSS 柱状图 | ✅ 已实现 |
| KPI 卡片 | DataviewPage | CSS + 图标 | ✅ 已实现 |
| 趋势柱状图 | DataviewPage | CSS 柱状图 | ✅ 已实现 |
| 平台排名 | DataviewPage | CSS + 进度条 | ✅ 已实现 |
| 预警列表 | DataviewPage | CSS + 徽章 | ✅ 已实现 |
| 统计汇总 | ResultsPage | CSS 表格 | ✅ 已实现 |
| 三方对比表 | ResultsPage | CSS 表格 | ✅ 已实现 |
| 订单明细表 | ResultsPage | CSS 表格 + 徽章 | ✅ 已实现 |

### 1.2 当前限制

1. **无交互功能**
   - 没有 hover 效果
   - 没有 tooltip 显示数据详情
   - 没有点击事件

2. **图表类型有限**
   - 仅支持柱状图和进度条
   - 无折线图、饼图、散点图
   - 无时间轴图表

3. **无数据操作**
   - 无数据缩放/钻取功能
   - 无图表导出功能
   - 无时间范围选择

4. **无动画效果**
   - 无加载动画
   - 无数据变化过渡动画

## 二、增强方案

### 方案 A：引入图表库（推荐）

#### 2.1 推荐方案：使用 Recharts

**优势**：
- React 原生，声明式 API
- 类型安全（TypeScript 支持）
- 轻量级（gzip 后 ~50KB）
- 易于定制和扩展
- 社区活跃，文档完善

**需要安装**：
```bash
yarn workspace @orderchecker/renderer add recharts
```

**使用示例**：
```typescript
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

function PlatformDistributionChart({ data }: { data: PlatformStats[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="count" fill="#3b82f6" name="订单数" />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

#### 2.2 备选方案：ECharts（功能最强）

**优势**：
- 功能最强大，图表类型最丰富
- 性能优秀，适合大数据量
- 完善的中文文档和社区支持
- 支持复杂的交互和动画

**劣势**：
- 体积较大（gzip 后 ~200KB）
- API 相对复杂（命令式）

#### 2.3 备选方案：Chart.js（最轻量）

**优势**：
- 最轻量级（gzip 后 ~10KB）
- 简单易用
- 适合简单场景

**劣势**：
- 功能相对简单
- 高级功能需要插件

### 方案 B：保持纯 CSS 方案（快速但有限）

如果暂时不引入图表库，可以在现有 CSS 方案基础上增强：

#### 2.4 添加交互

1. **Hover 效果**
```css
.platform-item:hover {
  background-color: #f9fafb;
  transform: translateX(4px);
}
```

2. **Tooltip 提示**

使用 CSS `data-tooltip` 和自定义 JavaScript 显示：
```html
<div data-tooltip="闪送: 456 单">
  <span>闪送</span>
</div>

<div class="tooltip" id="tooltip"></div>

<script>
document.querySelectorAll('[data-tooltip]').forEach(el => {
  el.addEventListener('mouseenter', (e) => {
    const tooltip = document.getElementById('tooltip');
    tooltip.textContent = el.getAttribute('data-tooltip');
    tooltip.style.display = 'block';
  });
  el.addEventListener('mousemove', (e) => {
    tooltip.style.left = e.pageX + 10 + 'px';
    tooltip.style.top = e.pageY + 10 + 'px';
  });
  el.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
  });
});
</script>
```

3. **点击事件**
```typescript
<div
  onClick={() => handlePlatformClick(platform)}
  style={styles.platformItem}
>
```

#### 2.5 添加动画

```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.platform-item {
  animation: fadeIn 0.3s ease-out;
}
```

## 三、实施建议

### 阶段 1：短期（1-2 天）
1. **选择图表库**：推荐使用 Recharts
2. **安装依赖**：`yarn workspace @orderchecker/renderer add recharts`
3. **迁移 DashboardPage**：
   - 平台分布图 → Recharts BarChart
   - 7天趋势图 → Recharts LineChart
4. **迁移 DataviewPage**：
   - KPI 趋势图 → Recharts LineChart（双轴）
   - 平台排名 → 保持 CSS 方案（已有交互效果）
   - 订单趋势 → Recharts BarChart

### 阶段 2：中期（3-5 天）
5. **增强 ResultsPage**：
   - 添加导出为图表功能（PNG/SVG）
   - 添加数据筛选和排序
   - 添加图表切换（柱状图/折线图）

6. **添加实时更新**：
   - 使用 WebSocket 或轮询获取最新数据
   - 图表自动刷新（无需刷新页面）

### 阶段 3：长期（1-2 周）
7. **高级交互**：
   - 数据钻取（点击柱子看详情）
   - 时间范围选择器（7天/30天/自定义）
   - 多图表联动（悬停一个图表，其他图表高亮）

8. **性能优化**：
   - 虚拟化大数据列表（react-window）
   - 图表数据分页
   - 缓存计算结果

## 四、代码迁移示例

### 4.1 DashboardPage 迁移示例

```typescript
// 原来的 CSS 进度条
<div style={{ height: "8px", backgroundColor: "#f3f4f6" }}>
  <div style={{ height: "100%", width: `${platform.percent}%`, backgroundColor: platform.color }} />
</div>

// 使用 Recharts 替换
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

<BarChart data={platformStats}>
  <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 12 }} />
  <YAxis />
  <Tooltip
    formatter={(value, name, props) => {
      const platform = props.payload;
      return [
        <div style={{ fontSize: 14 }}>
          <div style={{ fontWeight: 600 }}>{platform.name}</div>
          <div style={{ color: "#6b7280" }}>
            {value} 单 ({platform.percent.toFixed(1)}%)
          </div>
        </div>
      ];
    }}
  />
  <Bar dataKey="count" fill={platform.color} radius={[4, 4, 0, 0]} />
</BarChart>
```

### 4.2 DataviewPage 迁移示例

```typescript
// 原来的 CSS 柱状图
<div style={{ height: `${getBarHeight(item.value)}%`, backgroundColor: item.color }} />

// 使用 Recharts 替换
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

<LineChart data={orderTrendData}>
  <CartesianGrid strokeDasharray="3 3" vertical={false} />
  <XAxis dataKey="day" tick={{ fill: "#6b7280" }} />
  <YAxis yAxisId="orders" orientation="left" tick={{ fill: "#6b7280" }} />
  <YAxis yAxisId="amount" orientation="right" tick={{ fill: "#6b7280" }} />
  <Tooltip />
  <Legend />
  <Line yAxisId="orders" type="monotone" dataKey="orders" stroke="#22c55e" strokeWidth={2} dot={false} />
  <Line yAxisId="amount" type="monotone" dataKey="amount" stroke="#16a34a" strokeWidth={2} dot={false} />
</LineChart>
```

## 五、测试和验证

### 5.1 功能测试清单

- [ ] 图表正确渲染数据
- [ ] Hover 显示正确 tooltip
- [ ] 点击事件正常触发
- [ ] 图表响应式调整
- [ ] 数据为空时显示占位符
- [ ] 图表导出功能正常
- [ ] 时间范围选择器正常工作
- [ ] 多图表联动正常

### 5.2 性能测试清单

- [ ] 大数据量时渲染流畅（1000+ 数据点）
- [ ] 图表切换无明显延迟
- [ ] 内存使用正常
- [ ] 无内存泄漏

## 六、部署注意事项

1. **首次加载**：确保 Chart.js/Recharts 从 CDN 加载，避免增加 bundle 体积
2. **服务端渲染**：如果使用 Next.js，考虑 SSR 兼容性
3. **浏览器兼容性**：测试主流浏览器（Chrome、Firefox、Safari、Edge）
4. **移动端适配**：确保图表在移动端正常显示（触摸交互）

## 七、下一步

等待用户确认实施方案：
- 方案 A：引入 Recharts（推荐）
- 方案 B：引入 ECharts（功能最强）
- 方案 C：保持纯 CSS（快速但有限）

确认后立即开始实施。
