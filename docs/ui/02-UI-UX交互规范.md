# OrderComparer V3 - UI/UX 交互规范

**文档版本：** 1.0
**创建日期：** 2026-01-19
**设计师：** UI/UX 团队
**状态：** 草稿

---

## 1. 概述

### 1.1 设计目标

- **专业性**：采用简洁、严谨的商务风格，符合财务系统定位
- **易用性**：简化操作流程，减少用户认知负荷
- **一致性**：统一的视觉语言和交互模式
- **可访问性**：WCAG 2.1 AA 级别合规

### 1.2 设计风格

基于 uipro 设计规范，采用 **"Modern Professional"** 风格：

- **UI 风格**：Clean Minimalism + Soft UI Evolution
- **配色方案**：专业蓝紫色系（商务/严谨）
- **字体搭配**：Inter / JetBrains Mono
- **关键效果**：平滑过渡、柔和阴影、精细动画

---

## 2. 设计系统

### 2.1 色彩系统

#### 主色调（Primary）

| Token | 用途 | Hex | RGB |
|-------|------|-----|-----|
| `--primary-50` | 浅色背景 | #eff6ff | 239, 246, 255 |
| `--primary-100` | 悬停背景 | #dbeafe | 219, 234, 254 |
| `--primary-200` | 边框/分隔线 | #bfdbfe | 191, 219, 254 |
| `--primary-300` | 淡色元素 | #93c5fd | 147, 197, 253 |
| `--primary-400` | 次要按钮 | #60a5fa | 96, 165, 250 |
| `--primary-500` | 主要交互 | #3b82f6 | 59, 130, 246 |
| `--primary-600` | **品牌色/主按钮** | #2563eb | 37, 99, 235 |
| `--primary-700` | 主按钮 Hover | #1d4ed8 | 29, 78, 216 |
| `--primary-800` | 深色元素 | #1e40af | 30, 64, 175 |
| `--primary-900` | 深色背景 | #1e3a8a | 30, 58, 138 |

#### 功能色（Functional）

| Token | 用途 | Hex |
|-------|------|-----|
| `--success` | 成功/通过 | #16a34a |
| `--warning` | 警告/待处理 | #ca8a04 |
| `--error` | 错误/失败 | #dc2626 |
| `--info` | 信息/提示 | #0284c7 |

#### 中性色（Neutral）

| Token | 用途 | Hex |
|-------|------|-----|
| `--gray-50` | 页面背景 | #fafafa |
| `--gray-100` | 卡片背景 | #f5f5f5 |
| `--gray-200` | 边框/分隔线 | #e5e5e5 |
| `--gray-300` | 占位符 | #d4d4d4 |
| `--gray-400` | 禁用状态 | #a3a3a3 |
| `--gray-500` | 次要文本 | #737373 |
| `--gray-600` | 正文 | #525252 |
| `--gray-700` | 标题 | #404040 |
| `--gray-800` | 深色文本 | #262626 |
| `--gray-900` | 深色背景 | #171717 |

#### 颜色使用规则

```css
/* 登录页背景渐变 */
background: linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%);

/* 主要按钮 */
.btn-primary {
  background: var(--primary-600);
  color: white;
}

/* 主要按钮 Hover */
.btn-primary:hover {
  background: var(--primary-700);
}

/* 悬停边框 */
.card:hover {
  border-color: var(--primary-200);
  box-shadow: 0 4px 8px rgba(0,0,0,0.06);
}

/* 成功状态 */
.status-success {
  color: var(--success);
  background: #dcfce7;
}

/* 错误状态 */
.status-error {
  color: var(--error);
  background: #fee2e2;
}
```

---

### 2.2 字体系统

#### 字体族

| Token | 用途 | 字体 |
|-------|------|------|
| `--font-sans` | 正文 | Inter, -apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif |
| `--font-mono` | 代码/订单号 | JetBrains Mono, "Fira Code", Consolas, monospace |

#### 字体大小与行高

| Token | 用途 | 大小 | 行高 | 字重 |
|-------|------|------|------|------|
| `--text-xs` | 辅助文本 | 11px | 1.4 | 600 |
| `--text-sm` | 小号文本 | 12px | 1.5 | 400 |
| `--text-base` | 正文 | 13px | 1.5 | 400 |
| `--text-lg` | 小标题 | 14px | 1.4 | 600 |
| `--text-xl` | 中标题 | 16px | 1.3 | 600 |
| `--text-2xl` | 大标题 | 18px | 1.2 | 700 |
| `--text-3xl` | 页面标题 | 24px | 1.1 | 700 |

#### 使用示例

```css
/* 页面标题 */
.page-title {
  font-family: var(--font-sans);
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--gray-900);
}

/* 正文 */
.body-text {
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: 1.5;
  color: var(--gray-600);
}

/* 订单号（等宽） */
.order-id {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--gray-900);
}
```

---

### 2.3 间距系统

| Token | 值 | 用途 |
|-------|-----|------|
| `--space-xs` | 4px | 紧密间距 |
| `--space-sm` | 8px | 小间距 |
| `--space-md` | 12px | 中间距 |
| `--space-lg` | 16px | 标准间距 |
| `--space-xl` | 20px | 大间距 |
| `--space-2xl` | 24px | 超大间距 |

---

### 2.4 圆角系统

| Token | 值 | 用途 |
|-------|-----|------|
| `--radius-sm` | 4px | 小按钮、标签 |
| `--radius-md` | 6px | 按钮、输入框 |
| `--radius-lg` | 8px | 卡片、弹窗 |
| `--radius-full` | 9999px | 圆形头像、徽标 |

---

### 2.5 阴影系统

| Token | 用途 | CSS |
|-------|------|-----|
| `--shadow-sm` | 小元素悬停 | `0 1px 2px rgba(0,0,0,0.05)` |
| `--shadow-md` | 卡片悬停 | `0 4px 6px -1px rgba(0,0,0,0.1)` |
| `--shadow-lg` | 弹窗 | `0 20px 25px -5px rgba(0,0,0,0.1)` |
| `--shadow-xl` | 模态框 | `0 25px 50px -12px rgba(0,0,0,0.25)` |

---

### 2.6 动画系统

#### 过渡时长

| Token | 用途 | 值 |
|-------|------|-----|
| `--duration-fast` | 快速反馈 | 150ms |
| `--duration-base` | 标准过渡 | 200ms |
| `--duration-slow` | 复杂动画 | 300ms |
| `--duration-slower` | 页面切换 | 400ms |

#### 过渡缓动

| Token | 用途 | 值 |
|-------|------|-----|
| `--ease-linear` | 线性动画 | `linear` |
| `--ease-in` | 进入动画 | `ease-in` |
| `--ease-out` | 离开动画 | `ease-out` |
| `--ease-in-out` | 往返动画 | `ease-in-out` |

#### 关键动画

```css
/* 悬停效果 */
.hover-effect {
  transition: all var(--duration-base) var(--ease-in-out);
}

/* 页面切换 */
.page-enter {
  animation: fadeIn var(--duration-slower) var(--ease-in-out);
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 旋转动画 */
.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 抖动动画 */
.shake {
  animation: shake 0.5s ease-in-out;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-10px); }
  20%, 40%, 60%, 80% { transform: translateX(10px); }
}

/* 滑入动画 */
.slide-in-right {
  animation: slideInRight 0.3s ease-out;
}

@keyframes slideInRight {
  from {
    transform: translateX(400px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
```

---

## 3. 组件规范

### 3.1 按钮

#### 主要按钮

```html
<button class="btn btn-primary">
  <span>登录</span>
</button>
```

```css
.btn {
  padding: 11px 20px;
  border: none;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-in-out);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn-primary {
  background: var(--primary-600);
  color: white;
}

.btn-primary:hover {
  background: var(--primary-700);
}

.btn-primary:active {
  background: var(--primary-800);
}

.btn-primary:disabled {
  background: var(--gray-300);
  cursor: not-allowed;
}
```

#### 次要按钮

```html
<button class="btn btn-secondary">取消</button>
```

```css
.btn-secondary {
  background: white;
  border: 1px solid var(--gray-300);
  color: var(--gray-700);
}

.btn-secondary:hover {
  background: var(--gray-50);
  border-color: var(--gray-400);
}
```

#### 按钮状态

| 状态 | 样式 | 交互 |
|------|------|------|
| Default | 标准样式 | Hover 背景色变深 |
| Hover | 背景色 +10% | 光标指针 |
| Active | 背景色 +20% | 轻微缩放 |
| Disabled | 灰色半透明 | 不可点击 |
| Loading | 显示 spinner | 禁用按钮 |

---

### 3.2 输入框

```html
<div class="form-group">
  <label for="email">邮箱</label>
  <div class="input-wrapper">
    <span class="input-icon">📧</span>
    <input type="email" id="email" placeholder="请输入邮箱" />
  </div</div>
```

```css
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 13px;
  font-weight: 500;
  color: var(--gray-700);
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-wrapper input {
  width: 100%;
  padding: 10px 12px 10px 38px;
  border: 1px solid var(--gray-300);
  border-radius: var(--radius-md);
  font-size: 14px;
  transition: all var(--duration-base) var(--ease-in-out);
}

.input-wrapper input:focus {
  outline: none;
  border-color: var(--primary-500);
  box-shadow: 0 0 0 3px var(--primary-50);
}

.input-icon {
  position: absolute;
  left: 12px;
  font-size: 16px;
  pointer-events: none;
  opacity: 0.5;
}
```

#### 输入框状态

| 状态 | 样式 | 交互 |
|------|------|------|
| Default | 灰色边框 | - |
| Focus | 蓝色边框 + 光晕 | 清空按钮（可选） |
| Error | 红色边框 + 错误信息 | - |
| Disabled | 灰色背景 + 不可点击 | - |

---

### 3.3 卡片

```html
<div class="card">
  <div class="card-header">
    <h3 class="card-title">卡片标题</h3>
    <div class="card-actions">
      <button class="icon-btn">⋮</button>
    </div>
  </div>
  <div class="card-body">
    <!-- 卡片内容 -->
  </div>
</div>
```

```css
.card {
  background: white;
  border-radius: var(--radius-lg);
  border: 1px solid var(--gray-200);
  overflow: hidden;
  transition: all var(--duration-base) var(--ease-in-out);
}

.card:hover {
  border-color: var(--primary-200);
  box-shadow: var(--shadow-md);
}

.card-header {
  padding: var(--space-lg);
  border-bottom: 1px solid var(--gray-200);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--gray-50);
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--gray-900);
}

.card-body {
  padding: var(--space-lg);
}
```

---

### 3.4 表格

```html
<table class="data-table">
  <thead>
    <tr>
      <th>订单号</th>
      <th>平台</th>
      <th>金额</th>
      <th>状态</th>
      <th>操作</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>SS20240119001</td>
      <td>闪送</td>
      <td>¥25.00</td>
      <td><span class="status-badge status-success">成功</span></td>
      <td><button class="btn-sm">查看</button></td>
    </tr>
  </tbody>
</table>
```

```css
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table th {
  background: var(--gray-50);
  padding: var(--space-sm) var(--space-md);
  text-align: left;
  font-weight: 600;
  color: var(--gray-700);
  border-bottom: 2px solid var(--gray-200);
}

.data-table td {
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--gray-100);
  color: var(--gray-900);
}

.data-table tbody tr:hover td {
  background: var(--primary-50);
}

.status-badge {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.status-success {
  background: #dcfce7;
  color: #166534;
}

.status-error {
  background: #fee2e2;
  color: #991b1b;
}
```

---

### 3.5 通知

```html
<div class="notification notification-success">
  <div class="notification-icon">✅</div>
  <div class="notification-message">操作成功</div>
  <button class="notification-close">×</button>
</div>
```

```css
.notification {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 10000;
  min-width: 300px;
  max-width: 500px;
  padding: 16px 20px;
  background: white;
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  border-left: 4px solid;
  display: flex;
  align-items: center;
  gap: 12px;
  animation: slideInRight 0.3s ease-out;
}

.notification-success {
  border-left-color: var(--success);
}

.notification-error {
  border-left-color: var(--error);
}

.notification-warning {
  border-left-color: var(--warning);
}

.notification-info {
  border-left-color: var(--info);
}

.notification-icon {
  font-size: 24px;
}

.notification-message {
  flex: 1;
  font-size: 14px;
  color: #1f2937;
}

.notification-close {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 18px;
  color: #9ca3af;
  line-height: 1;
}
```

---

## 4. 页面布局规范

### 4.1 登录页布局

```html
<div class="auth-page">
  <div class="auth-container">
    <div class="auth-left">
      <!-- 品牌展示 + 特性卡片 -->
    </div>
    <div class="auth-right">
      <!-- 登录表单 -->
    </div>
  </div>
</div>
```

```css
.auth-page {
  min-height: 100vh;
  display: flex;
}

.auth-container {
  display: flex;
  width: 100%;
  min-height: 100vh;
}

.auth-left {
  flex: 1;
  background: linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%);
  padding: 40px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  color: white;
}

.auth-right {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: white;
}
```

---

### 4.2 主应用布局

```html
<div class="app-container">
  <aside class="sidebar">
    <!-- 侧边栏导航 -->
  </aside>
  <main class="main-content">
    <header class="topbar">
      <!-- 顶部栏 -->
    </header>
    <div class="content-wrapper">
      <!-- 页面内容 -->
    </div>
  </main>
</div>
```

```css
.app-container {
  display: flex;
  min-height: 100vh;
  background: var(--gray-100);
}

.sidebar {
  width: 220px;
  background: white;
  border-right: 1px solid var(--gray-200);
  display: flex;
  flex-direction: column;
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  z-index: 1000;
  transition: width var(--duration-base) var(--ease-in-out);
}

.sidebar.collapsed {
  width: 60px;
}

.main-content {
  flex: 1;
  margin-left: 220px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  transition: margin-left var(--duration-base) var(--ease-in-out);
}

.topbar {
  height: 56px;
  background: white;
  border-bottom: 1px solid var(--gray-200);
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 999;
}

.content-wrapper {
  flex: 1;
  padding: 20px;
}
```

---

## 5. 交互规范

### 5.1 悬停反馈

**规则：** 所有可交互元素必须有悬停反馈

```css
/* 好的做法 */
.clickable {
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-in-out);
}

.clickable:hover {
  background: var(--gray-100);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

/* 坏的做法 */
.clickable {
  /* 没有悬停反馈 */
}
```

---

### 5.2 焦点状态

**规则：** 所有表单元素必须有可见的焦点指示

```css
/* 好的做法 */
input:focus,
button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--primary-500);
}

/* 坏的做法 */
input:focus {
  outline: none; /* 没有替代焦点指示 */
}
```

---

### 5.3 加载状态

**规则：** 所有异步操作必须有加载指示

```html
<!-- 按钮 loading -->
<button class="btn btn-primary" disabled>
  <span class="loader"></span>
  <span>处理中...</span>
</button>

<!-- 页面 loading -->
<div class="page-loading">
  <div class="spinner"></div>
  <p>加载中...</p>
</div>
```

---

### 5.4 错误处理

**规则：** 所有错误必须有清晰的视觉提示和错误信息

```html
<!-- 表单错误 -->
<div class="form-group error">
  <label>邮箱</label>
  <input type="email" />
  <span class="error-message">请输入有效的邮箱地址</span>
</div>

<!-- 全局错误 -->
<div class="notification notification-error">
  <span class="notification-icon">❌</span>
  <span>操作失败，请重试</span>
</div>
```

---

## 6. 响应式设计

### 6.1 断点

| 断点名称 | 最小宽度 | 用途 |
|----------|----------|------|
| Mobile | 375px | 手机竖屏 |
| Tablet | 768px | 平板 |
| Desktop | 1024px | 桌面 |
| Large | 1440px | 大屏 |

---

### 6.2 响应式示例

```css
/* 桌面（默认） */
.sidebar {
  width: 220px;
}

/* 平板 */
@media (max-width: 1024px) {
  .sidebar {
    width: 180px;
  }

  .stats-row {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* 移动端 */
@media (max-width: 768px) {
  .sidebar {
    transform: translateX(-100%);
  }

  .sidebar.mobile-open {
    transform: translateX(0);
  }

  .main-content {
    margin-left: 0;
  }

  .stats-row {
    grid-template-columns: 1fr;
  }

  .search-box {
    display: none;
  }
}
```

---

## 7. 可访问性

### 7.1 键盘导航

**规则：** 所有功能必须可通过键盘访问

```html
<!-- 好的做法 -->
<button class="icon-btn" aria-label="关闭">
  <span>×</span>
</button>

<a href="#" role="button" tabindex="0">链接按钮</a>

<!-- 坏的做法 -->
<div onclick="handleClick()">点击我</div> <!-- 无键盘访问 -->
```

---

### 7.2 语义化 HTML

**规则：** 使用语义化 HTML 标签

```html
<!-- 好的做法 -->
<nav>
  <ul>
    <li><a href="/">首页</a></li>
  </ul>
</nav>

<main>
  <article>
    <h1>标题</h1>
  </article>
</main>

<!-- 坏的做法 -->
<div class="nav">首页</div>
<div class="content">内容</div>
```

---

### 7.3 颜色对比度

**规则：** 文本与背景对比度必须达到 WCAG AA 标准（4.5:1）

| 场景 | 最小对比度 |
|------|-----------|
| 正文（< 18pt）| 4.5:1 |
| 大文本（≥ 18pt）| 3:1 |
| 交互元素 | 4.5:1 |

---

## 8. 交互动画规范

### 8.1 动画时长

| 动画类型 | 推荐时长 |
|----------|----------|
| 悬停过渡 | 150-200ms |
| 模态框 | 200-300ms |
| 页面切换 | 300-400ms |
| Loading Spinner | 0.8-1s（循环） |

---

### 8.2 动画示例

```css
/* 悬停效果 */
.btn {
  transition: all 200ms ease-in-out;
}

.btn:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

/* 模态框 */
.modal {
  opacity: 0;
  transform: scale(0.95);
  transition: all 300ms ease-in-out;
}

.modal.active {
  opacity: 1;
  transform: scale(1);
}

/* 页面切换 */
.page {
  opacity: 0;
  transform: translateY(20px);
  transition: all 400ms ease-in-out;
}

.page.active {
  opacity: 1;
  transform: translateY(0);
}
```

---

## 9. 图标规范

### 9.1 图标库

推荐使用以下图标库：

| 库 | 用途 | 链接 |
|----|------|------|
| Heroicons | 通用图标 | https://heroicons.com |
| Lucide | 专业图标 | https://lucide.dev |
| Simple Icons | 品牌图标 | https://simpleicons.org |

---

### 9.2 图标使用规范

```html
<!-- 好的做法：使用 SVG 图标 -->
<button aria-label="搜索">
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
</button>

<!-- 坏的做法：使用 emoji 作为图标 -->
<button>🔍 搜索</button> <!-- 不可访问、不一致 -->
```

---

## 10. 开发交付检查清单

在交付任何 UI 实现之前，请验证以下项目：

### 视觉质量

- [ ] 所有图标使用 SVG（不使用 emoji）
- [ ] 图标来自一致的图标集
- [ ] 悬停状态不导致布局偏移
- [ ] 使用主题色直接（`bg-primary`）而非 CSS 变量

### 交互

- [ ] 所有可点击元素有 `cursor-pointer`
- [ ] 悬停状态提供清晰的视觉反馈
- [ ] 过渡时间在 150-300ms 范围内
- [ ] 焦点状态对键盘导航可见

### 可访问性

- [ ] 图片有 alt 文本
- [ ] 表单输入框有标签
- [ ] 颜色不是唯一指示器
- [ ] `prefers-reduced-motion` 受尊重
- [ ] 颜色对比度满足 WCAG AA（4.5:1）

### 布局

- [ ] 响应式设计在 375px、768px、1024px、1440px 测试
- [ ] 无横向滚动（移动端）
- [ ] 内容不被固定导航栏遮挡
- [ ] 一致的 `max-width` 使用

### 性能

- [ ] 图片已优化（WebP、懒加载）
- [ ] 列表超过 50 项时虚拟化
- [ ] 代码分割 / 懒加载重组件
- [ ] 避免渲染期间的布局读取

---

**文档结束**
