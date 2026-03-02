# 多阶段 Dockerfile
# 构建前端 + 后端镜像

# 阶段 1: 构建前端
FROM node:18-alpine AS frontend-builder

WORKDIR /app

# 复制 package.json 和 yarn.lock
COPY package.json yarn.lock ./
COPY packages/renderer/package.json ./packages/renderer/
COPY packages/engine/package.json ./packages/engine/
COPY packages/shared/package.json ./packages/shared/

# 安装依赖
RUN yarn install

# 复制源代码
COPY packages/renderer ./packages/renderer
COPY packages/engine ./packages/engine
COPY packages/shared ./packages/shared

# 构建前端
RUN yarn workspace @orderchecker/renderer build

# 阶段 2: 构建后端
FROM node:18-alpine AS backend-builder

WORKDIR /app

# 复制 package.json 和 yarn.lock
COPY package.json yarn.lock ./
COPY packages/server/package.json ./packages/server/
COPY packages/engine/package.json ./packages/engine/
COPY packages/shared/package.json ./packages/shared/

# 安装依赖
RUN yarn install

# 复制源代码
COPY packages/server ./packages/server
COPY packages/engine ./packages/engine
COPY packages/shared ./packages/shared

# 构建后端
RUN yarn workspace @orderchecker/server build

# 阶段 3: 生产镜像
FROM node:18-alpine AS backend-production

WORKDIR /app

# 复制后端代码
COPY --from=backend-builder /app/packages/server/dist ./dist
COPY --from=backend-builder /app/packages/server/node_modules ./node_modules
COPY --from=backend-builder /app/packages/server/package.json ./
COPY --from=backend-builder /app/packages/server/prisma ./prisma

# 复制共享代码和引擎代码（运行时需要）
COPY --from=backend-builder /app/packages/shared/node_modules ./node_modules/shared
COPY --from=backend-builder /app/packages/engine/node_modules ./node_modules/engine

# 创建上传目录
RUN mkdir -p /app/uploads

# 环境变量
ENV NODE_ENV=production
ENV PORT=3001

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/v1/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# 启动后端
CMD ["node", "dist/index.js"]

# 阶段 4: 前端生产镜像（Nginx）
FROM nginx:1.25-alpine AS frontend-production

# 复制 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 复制前端构建产物
COPY --from=frontend-builder /app/packages/renderer/dist /usr/share/nginx/html

# 暴露端口
EXPOSE 80

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]

# 如果需要使用 docker-compose，可以定义一个默认阶段
FROM frontend-production
