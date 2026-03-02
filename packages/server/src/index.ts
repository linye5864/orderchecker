// 服务入口文件
import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import http from 'http';

import { env } from './config/index.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/index.js';
import { prisma } from './lib/db.js';
import { initWebSocket, closeWebSocket } from './services/websocket.service.js';

config({ path: '.env' });

const app = express();

// 中间件
// 允许所有来源（开发环境），生产环境应使用具体域名
app.use(cors({
  origin: env.NODE_ENV === 'development' ? true : env.CORS_ORIGIN,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 请求日志
app.use((req, _res, next) => {
  if (env.NODE_ENV === 'development') {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  }
  next();
});

// API 路由
app.use('/api/v1', routes);

// 根路径
app.get('/', (_req, res) => {
  res.json({
    name: 'OrderComparer API',
    version: '1.0.0',
    docs: '/api/v1/health',
  });
});

// 404 处理
app.use(notFoundHandler);

// 错误处理
app.use(errorHandler);

// 创建 HTTP 服务器
const server = http.createServer(app);

// 初始化 WebSocket 服务器
initWebSocket(server);

// 启动服务器
const PORT = env.PORT;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║                                                      ║
║   OrderComparer API Server                           ║
║                                                      ║
║   🚀 Server running on: http://${HOST}:${PORT}                ║
║   📝 Environment: ${env.NODE_ENV.padEnd(15)}              ║
║   🔗 API Base: /api/v1                               ║
║   🔌 WebSocket: /ws/progress                         ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
  `);
});

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  closeWebSocket();
  await prisma.$disconnect();
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  closeWebSocket();
  await prisma.$disconnect();
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

export default app;
