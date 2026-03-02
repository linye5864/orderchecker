# OrderComparer V3 开发 Checklist（工程/QA 可执行）

> 目标：把 `docs/prd/01-产品需求文档.md`（FR-001..FR-009）+ `docs/prd/03-产品需求拆解.md`（WBS）+ `design/01-界面设计文档.md`（UI 规范）汇总成可落地的研发/测试任务清单。
>
> 约束（必须遵守）：
> - 禁止使用 emoji 作为图标，统一 SVG（Lucide/Heroicons outline）。
> - 所有可交互元素必须有 hover/active/focus-visible，且具备 `cursor: pointer`。
> - 动效：150ms（轻反馈）/200ms（默认）/300ms（复杂）/400ms（页面切换），并尊重 `prefers-reduced-motion`。
> - 响应式验收断点：375 / 768 / 1024 / 1440。

---

## 0. 统一交付标准（DoD / 全局质量门禁）

### 0.1 工程交付（通用）
- [ ] 所有页面具备：Loading / Empty / Error 三态（至少 Upload / Reconciliation / Results 必须覆盖）。
- [ ] 全局 Toast/Notification：success/error/warning/info（右上角 slide-in，支持关闭）。
- [ ] 全局路由切换：页面淡入（≤400ms），支持减少动效。
- [ ] 交互一致：按钮/卡片/表格行 hover 反馈；Input focus ring；不可点击态可见。
- [ ] 图标：所有 icon 按钮具备 `aria-label`；同一套图标集，不混用 emoji。

### 0.2 可访问性（A11y）
- [ ] WCAG 2.1 AA：对比度（正文 ≥4.5:1）、键盘可达、语义化结构（nav/main/table/th）。
- [ ] `:focus-visible` 的焦点指示清晰且不移除 outline（可用 ring 替代）。
- [ ] Tab 顺序合理：表单、弹窗、向导、分页、Tabs 均可键盘操作。
- [ ] `prefers-reduced-motion`：禁用/缩短进度条动画、slide-in 等非必要动效。

### 0.3 兼容与性能
- [ ] 断点验收：375/768/1024/1440，无横向滚动（移动端如表格需要横滑，必须显式允许并不破坏布局）。
- [ ] 首屏性能目标：Lighthouse 首屏 <2s（PRD NFR）。
- [ ] 列表/表格 >50 行时：考虑虚拟列表或分页，避免卡顿（uipro 建议）。

### 0.4 测试与验证
- [ ] 单元测试：核心纯函数（解析/映射/对账规则/过滤分页）覆盖。
- [ ] 集成测试：关键流程（上传→向导四步→结果→导出→历史）覆盖。
- [ ] E2E（建议）：登录→上传文件→执行对账→导出报表。
- [ ] 验收证据：关键页面在四断点截图/录屏 + A11y 检查报告（例如 axe）。

---

## 1. Epic：项目初始化与工程化（WBS 1.1 / Phase 1）

### 1.1 代码库与工具链
- [ ] 初始化前端工程（建议：React 18 + Vite/Next.js；与 PRD 技术栈一致即可）。
- [ ] 配置 TypeScript（如使用 TS）、路径别名、环境变量模板。
- [ ] 配置 ESLint + Prettier + 基础 CI（lint/test/build）。
- [ ] 配置 Tailwind（PRD 建议）或等效 design tokens 落地方式。
- [ ] 目录规范：pages/views、components、services、state、types、utils、assets/icons。

**验收：**
- [ ] `lint` / `test` / `build`（如有）可在本机与 CI 跑通。

### 1.2 设计系统与基础组件库（与 UI 规范对齐）
> 让后续页面只拼装，不在页面里“散落式写样式/交互”。

- [ ] Design Tokens：颜色、字号、圆角、阴影、间距、动效时长（来自 UI/UX 规范）。
- [ ] Icon 体系：选定 Lucide 或 Heroicons（outline），建立 icon 映射表。
- [ ] 基础组件（需含交互状态）：
  - [ ] Button（primary/secondary/disabled/loading）
  - [ ] Input / Select（focus ring / error / disabled）
  - [ ] Card（hover 边框 + 阴影）
  - [ ] Table（header/row hover/异常行高亮）
  - [ ] Tabs
  - [ ] Stepper（4 步向导）
  - [ ] Modal（Esc/点击遮罩关闭可配置）
  - [ ] Toast/Notification
  - [ ] EmptyState
  - [ ] Pagination

**验收：**
- [ ] 所有组件可键盘操作；icon button 有 aria-label。
- [ ] 组件动效符合 150–300ms，页面切换 300–400ms。

---

## 2. Epic：用户认证系统（FR-001 / WBS 1.2）

### 2.1 登录页（Login）
- [ ] 页面布局：左右分栏（移动端隐藏左侧，仅表单）。
- [ ] 表单字段：用户名、密码、记住我、忘记密码链接。
- [ ] 密码可见性切换：eye/eye-off SVG。
- [ ] 表单校验：必填；密码强度（≥8 位含字母数字）（PRD）。
- [ ] 登录按钮 loading；成功 toast + 800ms 跳转。
- [ ] 登录失败：表单 shake + toast error。
- [ ] 安全/风控：失败 3 次锁定 15 分钟（PRD）。

**验收：**
- [ ] 键盘 Tab 顺序：用户名→密码→记住我→忘记密码→登录。
- [ ] 错误信息可读；focus-visible 清晰。

### 2.2 会话与权限（RBAC）
- [ ] 会话超时：2 小时自动登出（PRD）。
- [ ] Token/Session 存储策略：
  - [ ] 记住我：持久化
  - [ ] 非记住我：会话级
- [ ] 角色：管理员/财务员/审计员（PRD）；前端路由/菜单控制（至少隐藏/禁用）。
- [ ] 登出功能（Topbar/Settings）。

**验收：**
- [ ] 受保护路由：未登录跳转 Login。
- [ ] 权限不足页面/提示（最小可用）。

---

## 3. Epic：主应用框架（FR-002 / WBS 1.3）

### 3.1 App Shell（Sidebar + Topbar + Content）
- [ ] Sidebar：220px ↔ 60px 可折叠；激活态高亮（primary）。
- [ ] 菜单 8 项（与 PRD/设计文档一致）：
  - [ ] Dashboard
  - [ ] Upload
  - [ ] Reconciliation（向导）
  - [ ] Results
  - [ ] History
  - [ ] Platforms
  - [ ] Dataview
  - [ ] Settings
- [ ] Topbar：面包屑、搜索框（≤768 隐藏）。
- [ ] SPA 路由无刷新切换；页面淡入动效。
- [ ] 移动端：Sidebar off-canvas + 遮罩。

**验收：**
- [ ] 断点下布局正确：768 时侧栏变抽屉；375 无遮挡。

### 3.2 全局通知系统
- [ ] Toast 容器：右上角固定，支持多条堆叠。
- [ ] 通知类型：success/error/warning/info。
- [ ] 自动关闭 3–5s（可配置）+ 手动关闭。

---

## 4. Epic：Dashboard（FR-003 / WBS 2.1）

### 4.1 页面结构
- [ ] 统计卡片 4 张：今日对账/成功/异常/金额。
- [ ] 7 天趋势图（Canvas）：hover tooltip。
- [ ] 平台订单分布：进度条（进入页面 0→目标宽度动画，支持 reduced motion）。
- [ ] 待处理任务列表：按优先级颜色编码（红/黄/蓝）。
- [ ] 数据刷新：每 5 分钟（PRD）。

**验收：**
- [ ] 卡片 hover 边框变蓝 + 阴影（200ms）。
- [ ] 空状态：无任务时提供引导 CTA。

---

## 5. Epic：数据采集 / 文件上传（FR-004 / WBS 2.2）

### 5.1 Upload 页面布局
- [ ] 左侧数据源区：本地导入 + 自动化抓取源卡片（RPA 模拟入口）。
- [ ] 右侧文件池：已上传文件列表 + 统计。

### 5.2 文件导入能力
- [ ] 拖拽上传（dragover/dragleave/drop 状态明显）。
- [ ] 点击选择文件。
- [ ] 文件类型识别（Excel/CSV）。
- [ ] 智能分类：配送单/流水/平台账单（标签颜色：蓝/黄/紫）。
- [ ] 文件池管理：显示、删除、上传进度。
- [ ] 列表入场动画 slideIn 300ms（支持 reduced motion）。

### 5.3 进入对账向导的可用性校验
- [ ] CTA “进入对账控制台”按钮：
  - [ ] 未满足最小组合（至少业务侧+资金侧）→ disabled（原因提示）。
  - [ ] 满足条件 → enabled。

### 5.4 自动化抓取（RPA 模拟）
- [ ] RPA Modal：标题 + progress bar + logs（黑底绿字、等宽字体）。
- [ ] 完成后：success toast；文件自动入池。

**验收（关键）：**
- [ ] 上传 3 类文件各 1 个后，文件池统计准确。
- [ ] 删除文件会实时更新统计与 CTA 状态。

---

## 6. Epic：智能对账控制台（FR-005 / WBS 2.3）

### 6.1 Stepper 与向导框架
- [ ] 四步 Stepper：active ring；completed 绿色。
- [ ] 上一步/下一步/执行对账：按钮状态随条件变化。
- [ ] 步骤切换：淡入 200–300ms。

### 6.2 Step 1：数据映射（业务侧 ↔ 资金侧）
- [ ] 两个 mapping slot，支持拖拽/选择文件填充。
- [ ] 映射确认前置校验：缺少必需字段/文件时提示。

### 6.3 Step 2：智能预检
- [ ] 预检列表：待检查→检查中→通过（状态可视）。
- [ ] 状态样式：checking 边框 primary；passed success + 浅绿底。

### 6.4 Step 3：核心对账执行
- [ ] 实时日志窗口（console window）：黑底绿字；支持自动滚动。
- [ ] 进度条：0→100%（过渡 300ms 递增）。

### 6.5 Step 4：结果预览
- [ ] 成功卡 + 关键指标预览 + CTA 跳转 Results。
- [ ] 对账完成自动跳转（或提供明确按钮，PRD 要求自动跳转可作为默认）。

**验收（关键）：**
- [ ] 无法越过步骤：未完成 Step 1 映射不能进入 Step 2（或进入但明确阻断）。
- [ ] 对账执行中，按钮禁用与 loading 状态正确。

---

## 7. Epic：对账结果查看（FR-006 / WBS 2.4）

### 7.1 页面结构
- [ ] 顶部汇总卡 4 张：总单数/成功/异常/总金额。
- [ ] 三方金额对比表（配送单/平台账单/流水账单）。
- [ ] 平台 Tabs 切换。
- [ ] 表格工具栏：搜索、状态筛选、导出。
- [ ] 明细表格：row hover；异常行浅红高亮。
- [ ] 分页：上一页/下一页/页码跳转（可选）。
- [ ] 异常汇总折叠面板：展开/收起动画；箭头旋转 200ms。

### 7.2 搜索/筛选/分页逻辑
- [ ] 搜索：按订单号/关键字段。
- [ ] 状态筛选：成功/异常/全部。
- [ ] 分页：默认 page size（可配置）。

### 7.3 导出（Excel）
- [ ] 导出按钮：loading；完成 toast。
- [ ] 导出内容包含：汇总 + 明细 + 异常清单（至少明细）。

**验收（关键）：**
- [ ] 搜索 + 筛选 + 分页组合工作正常（先筛选再分页，或先搜索再分页，规则明确）。
- [ ] 无结果：EmptyState + “返回上传/重新对账”引导。

---

## 8. Epic：历史记录管理（FR-007 / WBS 3.1）

### 8.1 页面结构
- [ ] 月度统计卡（本月累计次数、账实相符率等）。
- [ ] 月份选择器（前进/后退）。
- [ ] 报告列表卡片（日期、指标、状态）。
- [ ] 卡片状态边框色：perfect=success / issue=error / fixed=info。
- [ ] 卡片 hover 上浮 2px + 阴影；迷你进度条显示匹配率。

**验收：**
- [ ] 点击某条历史记录可进入 Results（或可查看详情页，二选一但需固定）。

---

## 9. Epic：平台配置管理（FR-008 / WBS 3.2）

### 9.1 页面布局
- [ ] 左侧平台列表（≥7 平台）：icon + name + status dot；选中态左侧 primary 边。
- [ ] 右侧配置面板：基本信息 / 字段映射 / 对账规则。
- [ ] 启用/禁用 Toggle：状态变化即时可见。
- [ ] 保存/取消：固定 footer。

### 9.2 字段映射与规则配置（MVP 可简化）
- [ ] 字段映射可视化（至少：key-value 映射列表）。
- [ ] 对账规则可配置项占位：金额字段、时间窗口、容差等（先做 schema + UI 占位）。

**验收：**
- [ ] 未保存变更离开页面：提示确认（可选但推荐）。

---

## 10. Epic：数据大屏可视化（FR-009 / WBS 3.3）

### 10.1 页面结构
- [ ] KPI 4 卡。
- [ ] 趋势图表（订单/金额/异常）。
- [ ] 平台排名列表。
- [ ] 预警列表（重要预警：红色 icon + 时间）。
- [ ] 实时刷新机制（PRD 要求）。

**验收：**
- [ ] 图表 hover tooltip，200ms 渐显。

---

## 11. Epic：系统设置（Settings / 与 FR-001 安全项对齐）

### 11.1 基础设置
- [ ] 个人信息：头像/角色展示/登出。
- [ ] 通用设置：语言/时区/默认对账周期（可先占位）。

### 11.2 安全与会话
- [ ] 展示会话超时策略（2 小时）与密码规则（至少前端提示）。
- [ ] （可选）修改密码入口（MVP 视需求）。

---

## 12. Epic：数据层与“后端/API”占位（PRD 技术栈建议）

> 说明：PRD 提到 FastAPI/Flask 等“未来规划”。若当前阶段为纯前端 demo，可以先用 mock service + 本地存储模拟，并保证未来可替换为 API。

### 12.1 前端数据模型（必须）
- [ ] 定义核心实体 types：
  - [ ] UploadFile（类型/来源/状态/大小/时间）
  - [ ] ReconciliationJob（step/status/progress/logs）
  - [ ] OrderRow（订单号/平台/三方金额/状态/差异原因）
  - [ ] ReportSummary（汇总指标）
  - [ ] PlatformConfig（启用状态/字段映射/规则）

### 12.2 服务层抽象
- [ ] service 接口：auth、upload、reconcile、results、history、platforms。
- [ ] mock 实现：
  - [ ] 模拟上传解析与分类（规则可先基于文件名/列头）。
  - [ ] 模拟对账：生成日志、进度、结果数据。
  - [ ] 历史记录本地持久化（PRD 设计决策）。

**验收：**
- [ ] 不改 UI 的情况下可替换成真实 API（同名接口）。

---

## 13. Epic：QA 验收清单（按页面/流程）

### 13.1 核心业务流程验收
- [ ] 登录：成功/失败/锁定/记住我/超时登出。
- [ ] Upload：拖拽/点击上传/分类/删除/进度/CTA 使能。
- [ ] Reconciliation：
  - [ ] Step1 未映射阻断
  - [ ] Step2 状态流转
  - [ ] Step3 日志滚动 + 进度
  - [ ] Step4 跳 Results
- [ ] Results：tabs/搜索/筛选/分页/导出/异常折叠。
- [ ] History：月份切换/卡片状态/进入历史结果。
- [ ] Platforms：选择平台/启用禁用/保存取消。
- [ ] Dataview：KPI/图表/排名/预警/刷新。
- [ ] Settings：登出/安全信息展示。

### 13.2 A11y 专项
- [ ] 全站键盘走查（Tab/Shift+Tab/Enter/Esc）。
- [ ] axe/等效工具扫描：无严重错误。

### 13.3 响应式专项
- [ ] 375/768/1024/1440 截图：每页至少 1 张。
- [ ] 768 以下 sidebar 抽屉可打开/关闭，遮罩可点击关闭。

---

## 14. 发布与运维（WBS Phase 4，占位）
- [ ] 生产构建产物可部署（静态站点或 server）。
- [ ] 基础监控与错误上报（可选）。
- [ ] 发布回归：核心流程 E2E 跑通。
