# OrderChecker 订单对账系统

> 企业级物流配送订单对账管理系统 - 让对账工作更简单

---

## 目录

- [系统简介](#系统简介)
- [环境准备](#环境准备)
- [安装部署](#安装部署)
- [启动运行](#启动运行)
- [对账操作指南](#对账操作指南)
- [常见问题](#常见问题)
- [技术支持](#技术支持)

---

## 系统简介

### 什么是 OrderChecker？

OrderChecker 是一个专门为物流配送行业设计的订单对账系统。它可以帮你：

- **自动对账**：上传配送单、流水单、平台账单，系统自动进行三方对比
- **发现差异**：自动识别多扣、少扣、漏单等问题
- **生成报表**：一键导出对账结果，方便后续处理

### 支持的配送平台

| 平台 | 代码 | 状态 |
|------|------|------|
| 达达 | dada | ✅ 已支持 |
| 闪送 | shansong | ✅ 已支持 |
| 蜂鸟 | fengniao | ✅ 已支持 |
| 顺丰同城 | sf | ✅ 已支持 |
| 顺丰企业C | sf_enterprise | ✅ 已支持 |
| UU跑腿 | uu | ✅ 已支持 |
| 裹小递 | guoxiaodi | ✅ 已支持 |

### 三方对账原理

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   配送单    │     │   流水单    │     │  平台账单   │
│ (应该扣多少)│     │ (实际扣多少)│     │ (三方扣多少)│
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                    ┌──────▼──────┐
                    │  对账引擎   │
                    │  自动对比   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  对账结果   │
                    │ · 匹配订单  │
                    │ · 差异订单  │
                    │ · 金额异常  │
                    └─────────────┘
```

---

## 环境准备

在安装本系统之前，请确保您的电脑已安装以下软件：

### 1. Node.js（前端运行环境）

**Windows/Mac 用户：**

1. 访问 https://nodejs.org/
2. 下载 LTS（长期支持）版本
3. 双击安装包，按提示完成安装
4. 打开终端/命令提示符，输入以下命令验证：
   ```bash
   node --version
   ```
   显示版本号（如 v18.x.x）表示安装成功

### 2. Python（后端运行环境）

**Windows 用户：**

1. 访问 https://www.python.org/downloads/
2. 下载 Python 3.10 或更高版本
3. 安装时**务必勾选** "Add Python to PATH"
4. 打开命令提示符，输入以下命令验证：
   ```bash
   python --version
   ```
   显示版本号（如 Python 3.10.x）表示安装成功

**Mac 用户：**

Mac 系统通常已预装 Python，打开终端验证：
```bash
python3 --version
```

### 3. 验证环境

打开终端（Mac）或命令提示符（Windows），依次输入：

```bash
node --version    # 应显示 v18.x.x 或更高
npm --version     # 应显示 9.x.x 或更高
python3 --version # 应显示 3.10.x 或更高（Mac）
python --version  # 应显示 3.10.x 或更高（Windows）
```

---

## 安装部署

### 第一步：获取项目代码

**方式一：从 GitHub 下载（推荐）**

```bash
git clone https://github.com/linye5864/orderchecker.git
cd orderchecker
```

**方式二：下载压缩包**

1. 访问 https://github.com/linye5864/orderchecker
2. 点击绿色按钮 "Code" → "Download ZIP"
3. 解压到任意目录

### 第二步：安装前端依赖

```bash
# 进入项目目录
cd orderchecker

# 安装依赖（需要几分钟，请耐心等待）
npm install
```

### 第三步：安装后端依赖

**Mac 用户：**
```bash
# 进入后端目录
cd packages/backend

# 创建虚拟环境
python3 -m venv venv

# 激活虚拟环境
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 返回项目根目录
cd ../..
```

**Windows 用户：**
```bash
# 进入后端目录
cd packages\backend

# 创建虚拟环境
python -m venv venv

# 激活虚拟环境
venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 返回项目根目录
cd ..\..
```

### 第四步：初始化数据库

**Mac 用户：**
```bash
cd packages/backend
source venv/bin/activate
python init_database.py
cd ../..
```

**Windows 用户：**
```bash
cd packages\backend
venv\Scripts\activate
python init_database.py
cd ..\..
```

看到 "初始化完成!" 表示数据库初始化成功。

---

## 启动运行

### 启动后端服务

**Mac 用户：**
```bash
cd packages/backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Windows 用户：**
```bash
cd packages\backend
venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

看到以下信息表示后端启动成功：
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete.
```

**注意：** 此终端窗口需要保持打开，不要关闭！

### 启动前端服务

**新开一个终端窗口**，执行：

```bash
cd orderchecker/packages/renderer
npm run dev
```

看到以下信息表示前端启动成功：
```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
```

### 访问系统

打开浏览器，访问：**http://localhost:5173**

### 默认登录账号

| 字段 | 值 |
|------|-----|
| 用户名 | `admin` |
| 密码 | `admin123` |

---

## 对账操作指南

### 一、登录系统

1. 打开浏览器，访问 http://localhost:5173
2. 输入用户名：`admin`
3. 输入密码：`admin123`
4. 点击「登录」按钮

### 二、准备数据文件

对账需要准备三类文件：

#### 1. 配送单（必需）

**说明：** 从聚合平台导出的配送订单明细，记录"应该扣多少钱"

**必需字段：**
| 字段名 | 说明 | 示例 |
|--------|------|------|
| 三方单号/配送单号 | 订单唯一标识 | DEL200001 |
| 配送状态 | 订单状态 | 已完成/已取消 |
| 真实配送费/配送费 | 扣款金额 | 12.50 |
| 商户ID | 商户标识 | M001 |
| 创建时间 | 下单时间 | 2026-03-01 08:00:00 |

#### 2. 流水单（必需）

**说明：** 从聚合平台导出的资金流水，记录"实际扣了多少钱"

**必需字段：**
| 字段名 | 说明 | 示例 |
|--------|------|------|
| 配送单号/三方单号 | 关联的订单号 | DEL200001 |
| 金额 | 扣款金额（负数表示扣款） | -12.50 |
| 变动前额 | 扣款前余额 | 1000.00 |
| 变动后额 | 扣款后余额 | 987.50 |
| 交易时间 | 扣款时间 | 2026-03-01 08:05:00 |

#### 3. 平台账单（可选）

**说明：** 从配送平台（达达、闪送等）导出的账单，记录"三方扣了多少钱"

**必需字段：**
| 字段名 | 说明 | 示例 |
|--------|------|------|
| 三方订单编号 | 三方订单号 | DEL200001 |
| 配送费/总扣款 | 扣款金额 | 12.00 |
| 订单状态 | 订单状态 | 已完成 |
| 订单时间 | 下单时间 | 2026-03-01 08:00:00 |

### 三、上传文件

1. 点击左侧菜单「数据上传」
2. 选择文件类型：
   - 配送单 → 选择配送单文件
   - 流水单 → 选择流水单文件  
   - 平台账单 → 选择平台账单文件
3. 点击「上传」按钮
4. 等待上传完成，看到成功提示

### 四、执行对账

1. 点击左侧菜单「对账管理」或「发起对账」
2. 选择已上传的文件：
   - 配送单文件
   - 流水单文件
   - 平台账单文件（可选）
3. 选择配送平台（如：达达）
4. 输入任务名称（如：2026年3月对账）
5. 点击「开始对账」按钮
6. 等待对账完成，可实时查看进度

### 五、查看结果

对账完成后，可以查看：

#### 1. 对账汇总

| 指标 | 说明 |
|------|------|
| 总订单数 | 参与对账的订单总数 |
| 匹配订单数 | 三方数据一致且金额匹配的订单数 |
| 差异订单数 | 存在金额差异或数据缺失的订单数 |
| 匹配率 | 匹配订单数 / 总订单数 |

#### 2. 差异类型说明

| 差异类型 | 说明 | 可能原因 |
|----------|------|----------|
| 多扣 | 实际扣款 > 应扣款 | 平台重复扣款、费用计算错误 |
| 少扣 | 实际扣款 < 应扣款 | 优惠未生效、补贴未计入 |
| 流水缺失 | 配送单有但流水单无 | 扣款延迟、数据同步问题 |
| 平台缺失 | 配送单有但平台账单无 | 订单未同步到三方平台 |
| 金额不符 | 三方金额不一致 | 费用计算规则差异 |

#### 3. 订单明细

可以查看每个订单的详细对账结果：
- 配送单金额
- 流水单金额
- 平台账单金额
- 差异金额
- 差异原因

### 六、导出报表

1. 在对账结果页面，点击「导出报表」按钮
2. 选择导出格式（Excel）
3. 系统自动下载对账结果文件

---

## 常见问题

### Q1: 启动后端报错 "ModuleNotFoundError"

**原因：** Python 依赖未安装或虚拟环境未激活

**解决方法：**
```bash
cd packages/backend
source venv/bin/activate  # Mac
# 或 venv\Scripts\activate  # Windows
pip install -r requirements.txt
```

### Q2: 启动前端报错 "Cannot find module"

**原因：** 前端依赖未安装

**解决方法：**
```bash
cd packages/renderer
rm -rf node_modules  # 删除旧依赖
npm install          # 重新安装
```

### Q3: 登录提示 "用户名或密码错误"

**原因：** 数据库未初始化或用户不存在

**解决方法：**
```bash
cd packages/backend
source venv/bin/activate
python init_database.py
```

### Q4: 上传文件后提示 "未能提取出任何有效订单"

**原因：** 文件字段名不匹配

**解决方法：** 
确保文件包含以下字段之一：
- 配送单：`三方单号`、`配送单号` 或 `订单号`
- 流水单：`配送单号`、`三方单号` 或 `订单号`
- 平台账单：`三方订单编号` 或 `第三方订单ID`

### Q5: 对账结果显示金额都是 0

**原因：** 金额字段名不匹配

**解决方法：**
确保文件包含金额字段：
- 配送单：`真实配送费`、`配送费` 或 `消耗金额`
- 流水单：`金额` 或 `发生金额`
- 平台账单：`配送费`、`总扣款` 或 `应付金额`

### Q6: 端口被占用怎么办？

**后端端口 8000 被占用：**
```bash
# Mac/Linux
lsof -i :8000
kill -9 <PID>

# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

**前端端口 5173 被占用：**
```bash
# Mac/Linux
lsof -i :5173
kill -9 <PID>

# Windows
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

### Q7: 如何修改默认密码？

登录系统后：
1. 点击右上角用户头像
2. 选择「修改密码」
3. 输入原密码和新密码
4. 点击「确认」

---

## 生产环境部署

### 使用 Docker 部署（推荐）

确保已安装 Docker 和 Docker Compose，然后：

```bash
# 进入项目目录
cd orderchecker

# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

访问：http://localhost:3000

### 手动部署

#### 1. 构建前端

```bash
cd packages/renderer
npm run build
```

构建产物在 `packages/renderer/dist` 目录。

#### 2. 配置 Nginx

将 `dist` 目录部署到 Nginx，配置示例：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /path/to/dist;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

#### 3. 启动后端

```bash
cd packages/backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

建议使用 PM2 或 Supervisor 管理后端进程。

---

## 系统截图

### 登录页面
输入用户名和密码登录系统。

### 数据上传页面
上传配送单、流水单、平台账单三类文件。

### 对账管理页面
选择文件、配置参数、发起对账任务。

### 对账结果页面
查看汇总统计、差异订单、订单明细。

---

## 技术支持

如遇到问题，请通过以下方式获取帮助：

1. 查看本文档的「常见问题」章节
2. 查看项目 Issues：https://github.com/linye5864/orderchecker/issues
3. 联系开发团队

---

## 附录

### API 端点列表

| 功能 | 方法 | 端点 |
|------|------|------|
| 登录 | POST | `/api/v1/auth/login` |
| 文件上传 | POST | `/api/v1/files/upload` |
| 文件列表 | GET | `/api/v1/files` |
| 执行对账 | POST | `/api/v1/reconciliation/execute` |
| 任务列表 | GET | `/api/v1/tasks` |
| 平台列表 | GET | `/api/v1/platforms` |
| 健康检查 | GET | `/api/v1/health` |

### 默认配置

| 配置项 | 默认值 |
|--------|--------|
| 后端端口 | 8000 |
| 前端端口 | 5173 |
| 数据库 | SQLite |
| 文件大小限制 | 100MB |
| 支持的文件格式 | .xlsx, .xls, .csv |

---

**© 2026 OrderChecker 订单对账系统**