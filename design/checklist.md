# UI/UX Review Checklist & Optimization Plan

**Review Date**: 2026-01-20
**Reviewer**: Antigravity (AI Agent)
**Scope**: Dashboard, Upload, Reconciliation Pages, Global Styles
**Reference**: `design/01-界面设计文档.md`, `globals.css`

---

## 🚨 Critical Issues (High Priority)

### 1. 样式实现方式严重违背工程规范

- **现状**: `DashboardPage.tsx`, `UploadPage.tsx`, `ReconciliationPage.tsx` 等核心页面大量使用 **内联样式 (`style={{ ... }}`)**。
- **问题**:
  - **难以维护**: 样式分散在 JSX 中，不仅代码冗长，且无法利用 CSS 的缓存、预处理等优势。
  - **无法响应式**: 内联样式无法直接使用 Media Queries，导致多端适配困难。
  - **不支持主题**: 硬编码的 Hex 颜色值（如 `#2563eb`）导致无法通过修改 CSS 变量来统一调整主题或支持深色模式。
  - **性能隐患**: 大量内联样式可能导致 React Diff 性能下降。
- **优化建议**:
  - **立即重构**: 移除所有业务页面的内联样式，全面转向 **Tailwind CSS Utility Classes** 或 **CSS Modules**。
  - **复用类名**: 严格使用 `globals.css` 中定义的 `.btn`, `.card`, `.input` 等原子类。

### 2. Design Tokens 未落地

- **现状**: 页面代码中大量存在硬编码颜色（e.g., `#1f2937`, `#6b7280`, `#eff6ff`）。
- **问题**: 虽然 `globals.css` 定义了 `--primary-500`, `--gray-900` 等变量，但页面开发时并未引用，导致设计系统形同虚设，视觉一致性完全依赖开发者的自觉。
- **优化建议**:
  - 强制使用 Tailwind 的语义化颜色类（如 `text-gray-900`, `bg-primary-50`）或 CSS 变量（`var(--primary-600)`）。
  - 全局搜索并替换所有 Hex 颜色值为对应的 Token。

### 3. 组件复用性缺失

- **现状**: 相同的 UI 元素（如“状态标签”、“带图标的按钮”、“进度条”）在不同页面被重复“画”了一遍。
- **问题**:
  - 代码冗余度高。
  - 修改一个组件样式需要改动多个文件。
  - 交互行为（如 Hover 效果）在不同页面可能不一致。
- **优化建议**:
  - 提取基础组件：`StatusBadge`, `IconButton`, `ProgressBar`, `StepCard` 等。
  - 统一放入 `src/components/ui` 目录并复用。

---

## 🎨 Visual & Interaction Polish (Checklist)

### Global / Layout

- [ ] **Typography**: 移除所有硬编码的 `font-family`（目前在每个页面根元素都重新定义了字体栈），应由 `body` 全局继承。
- [ ] **Spacing**: 统一间距单位。目前存在 `24px`, `28px`, `20px` 等随意值，建议统一使用 Tailwind 的 spacing scale (e.g., `p-6` (24px), `gap-4` (16px))。
- [ ] **Scrollbars**: 自定义各个滚动区域（如日志窗口、表格容器）的滚动条样式，保持与操作系统或应用主题一致。

### Dashboard Page (`DashboardPage.tsx`)

- [ ] **卡片交互**: 现在的卡片 Hover 效果是通过 CSS 还是 JS 实现的？建议统一用 `hover:shadow-lg hover:border-primary-300` 类。
- [ ] **图表实现**: 目前的柱状图是纯 `div` 模拟的，建议封装为独立的 `Chart` 组件，或引入轻量级图表库（如 Recharts）以获得更好的 Tooltip 和交互体验。
- [ ] **Loading/Error State**: 目前的 Loading/Error 界面是硬编码的居中 div，应替换为全局的 `LoadingSpinner` 和 `ErrorState` 组件。

### Upload Page (`UploadPage.tsx`)

- [ ] **Dropzone**:
  - 移除大段的内联事件处理 (`onDragOver`, `onDragLeave` 改变样式)。
  - 改用 CSS 类（如 `group-hover` 或 `data-active` 属性）配合 Tailwind 处理拖拽状态。
- [ ] **Tabs**: 目前的 Tabs 是硬写的按钮组，缺乏键盘导航支持（Arrow Left/Right）。应使用无障碍友好的 Tabs 组件（Radix UI 或 Headless UI）。
- [ ] **File List**: 表格每一行也是大量内联样式。应重构为标准的 `<Table>` 组件使用。

### Reconciliation Page (`ReconciliationPage.tsx`)

- [ ] **Stepper**: 步骤条的代码逻辑复杂且样式硬编码。应抽离为 `Steps` 组件。
- [ ] **Console Log**:
  - 日志窗口的自动滚动逻辑应封装。
  - 颜色（`#86efac` 等）需改为 Token（`text-success-400`）。
- [ ] **Animations**: 页面中存在 `<style>` 标签定义的 `keyframes`。应移至 `globals.css` 或 `tailwind.config.js` 的 `extend.keyframes` 中。

---

## ♿ Accessibility (A11y) Review

- [ ] **Focus Focus**: 大量自定义的 `div` 按钮（如 Dropzone）可能缺乏 focus 样式。确保所有可交互元素都有 `:focus-visible` 状态 (Tailwind `focus-visible:ring`).
- [ ] **Semantic HTML**:
  - 检查 `div` 是否被滥用于本该是 `button` 或 `header` 的地方。
  - 确保图标按钮有 `aria-label`。
- [ ] **Keyboard Nav**: 确保 Upload 页面的 Tabs 和 Upload Zone 可以通过键盘操作。

---

## 🛠 Action Plan (Next Steps)

1.  **Refactor Styles (Priority 1)**:
    - 将 `DashboardPage.tsx` 重构为使用 Tailwind Classes。
    - 将 `UploadPage.tsx` 重构为使用 Tailwind Classes。
    - 将 `ReconciliationPage.tsx` 重构为使用 Tailwind Classes。
2.  **Extract Components (Priority 2)**:
    - Create `src/components/ui/Button.tsx`
    - Create `src/components/ui/Card.tsx`
    - Create `src/components/ui/Badge.tsx`
    - Create `src/components/ui/ProgressBar.tsx`
3.  **Validate**:
    - Build production check.
    - Responsive testing (Mobile/Tablet/Desktop).
