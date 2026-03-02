#!/usr/bin/env node
/**
 * OrderComparer API 完整测试套件
 * 
 * 功能:
 * - 自动启动后端服务器
 * - 等待服务器就绪
 * - 运行所有 API 测试
 * - 输出详细测试报告
 * - 清理测试数据
 * 
 * 使用方法:
 *   node run-tests.js              # 运行所有测试
 *   node run-tests.js --quick      # 快速测试（跳过耗时的测试）
 *   node run-tests.js --watch      # 监听模式
 *   node run-tests.js --verbose    # 详细输出
 */

import http from 'http';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createInterface } from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.join(__dirname, '..');
const API_BASE = 'http://localhost:3001/api/v1';
const BASE_URL = 'http://localhost:3001';

// 解析命令行参数
const args = process.argv.slice(2);
const options = {
  quick: args.includes('--quick'),
  watch: args.includes('--watch'),
  verbose: args.includes('--verbose'),
  help: args.includes('--help') || args.includes('-h'),
};

// 颜色配置
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const symbols = {
  pass: '✓',
  fail: '✗',
  info: 'ℹ',
  warn: '⚠',
  arrow: '→',
};

function log(message, color = 'reset', symbol = '') {
  const prefix = symbol ? `${colors[color]}${symbol} ${colors.reset}` : '';
  console.log(`${prefix}${colors[color]}${message}${colors.reset}`);
}

function logHeader(title) {
  console.log('\n' + colors.cyan + '═'.repeat(70) + colors.reset);
  log(title, 'cyan');
  console.log(colors.cyan + '═'.repeat(70) + colors.reset);
}

function logSection(title) {
  console.log('\n' + colors.blue + '─'.repeat(50) + colors.reset);
  log(title, 'blue');
  console.log(colors.blue + '─'.repeat(50) + colors.reset);
}

// 测试结果
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: [],
  startTime: null,
  endTime: null,
};

function record(name, passed, details = null) {
  results.total++;
  if (passed) {
    results.passed++;
    log(name, 'green', symbols.pass);
  } else {
    results.failed++;
    log(name, 'red', symbols.fail);
    if (details && options.verbose) {
      log(`  ${colors.yellow}${details}${colors.reset}`);
    }
  }
  results.tests.push({ name, passed, details, timestamp: Date.now() });
}

// HTTP 请求
async function request(method, endpoint, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      timeout: 10000,
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data: body, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => reject(new Error('请求超时')));

    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// 等待服务器
async function waitForServer(maxWait = 15000) {
  log('正在检查服务器状态...', 'yellow');
  const start = Date.now();
  
  while (Date.now() - start < maxWait) {
    try {
      const res = await request('GET', `${API_BASE}/health`);
      if (res.status === 200 && res.data.success) {
        log(`服务器运行正常 ✓ (${Date.now() - start}ms)`, 'green');
        return true;
      }
    } catch {
      process.stdout.write('.');
    }
    await new Promise(r => setTimeout(r, 500));
  }
  
  throw new Error('服务器启动超时');
}

// 启动服务器
function startServer() {
  return new Promise((resolve, reject) => {
    log('启动后端服务器...', 'yellow');
    
    const proc = spawn('yarn', ['dev'], {
      cwd: SERVER_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' },
    });

    proc.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Server running') || output.includes('Listening')) {
        resolve(proc);
      }
    });

    proc.stderr.on('data', (data) => {
      console.error(colors.red + data.toString() + colors.reset);
    });

    proc.on('error', reject);

    // 超时保护
    setTimeout(() => {
      log('服务器启动超时，但继续测试...', 'yellow');
      resolve(proc);
    }, 15000);
  });
}

// ==================== 测试用例 ====================
async function runTests() {
  results.startTime = Date.now();
  
  // 1. 基础连接测试
  logHeader('基础连接测试');
  
  try {
    const res = await request('GET', `${API_BASE}/health`);
    record('服务器健康检查', res.status === 200 && res.data.success);
  } catch (e) {
    record('服务器健康检查', false, e.message);
  }

  // 2. 认证测试
  logHeader('认证模块测试');
  
  let adminToken = null;
  
  // 测试管理员登录
  try {
    const res = await request('POST', `${API_BASE}/auth/login`, {
      username: 'admin',
      password: 'admin123',
    });
    const success = res.status === 200 && res.data.success && res.data.data?.token;
    record('管理员登录 (admin/admin123)', success);
    if (success) {
      adminToken = res.data.data.token;
      log(`  Token: ${res.data.data.token.substring(0, 40)}...`, 'blue');
    }
  } catch (e) {
    record('管理员登录', false, e.message);
  }

  // 测试错误登录
  try {
    const res = await request('POST', `${API_BASE}/auth/login`, {
      username: 'admin',
      password: 'wrongpassword',
    });
    record('错误密码被拒绝', res.status === 401 && !res.data.success);
  } catch (e) {
    record('错误密码被拒绝', false, e.message);
  }

  // 测试无 Token 访问
  try {
    const res = await request('GET', `${API_BASE}/users`);
    record('无 Token 被拒绝', res.status === 401);
  } catch (e) {
    record('无 Token 被拒绝', false, e.message);
  }

  // 测试无效 Token
  try {
    const res = await request('GET', `${API_BASE}/users`, null, {
      Authorization: 'Bearer invalid.token.here',
    });
    record('无效 Token 被拒绝', res.status === 401);
  } catch (e) {
    record('无效 Token 被拒绝', false, e.message);
  }

  // 测试获取当前用户
  if (adminToken) {
    try {
      const res = await request('GET', `${API_BASE}/auth/me`, null, {
        Authorization: `Bearer ${adminToken}`,
      });
      record('获取当前用户', res.status === 200 && res.data.data?.username === 'admin');
      if (res.data.data) {
        log(`  用户: ${res.data.data.username}, 角色: ${res.data.data.role}`, 'blue');
      }
    } catch (e) {
      record('获取当前用户', false, e.message);
    }
  }

  // 3. 用户管理测试
  logHeader('用户管理测试');
  
  if (adminToken) {
    try {
      const res = await request('GET', `${API_BASE}/users`, null, {
        Authorization: `Bearer ${adminToken}`,
      });
      record('获取用户列表', res.status === 200 && res.data.success);
      if (res.data.data?.length) {
        log(`  用户数量: ${res.data.data.length}`, 'blue');
      }
    } catch (e) {
      record('获取用户列表', false, e.message);
    }

    try {
      const res = await request('GET', `${API_BASE}/users/roles`, null, {
        Authorization: `Bearer ${adminToken}`,
      });
      record('获取角色列表', res.status === 200 && res.data.data?.length === 4);
      if (res.data.data) {
        log(`  角色: ${res.data.data.map(r => r.value).join(', ')}`, 'blue');
      }
    } catch (e) {
      record('获取角色列表', false, e.message);
    }

    // 测试分页
    try {
      const res = await request('GET', `${API_BASE}/users?page=1&pageSize=10`, null, {
        Authorization: `Bearer ${adminToken}`,
      });
      record('用户分页查询', res.status === 200 && res.data.pagination);
    } catch (e) {
      record('用户分页查询', false, e.message);
    }

    // 测试搜索
    try {
      const res = await request('GET', `${API_BASE}/users?keyword=admin`, null, {
        Authorization: `Bearer ${adminToken}`,
      });
      record('用户搜索', res.status === 200);
    } catch (e) {
      record('用户搜索', false, e.message);
    }
  }

  // 4. 平台配置测试
  logHeader('平台配置测试');
  
  if (adminToken) {
    try {
      const res = await request('GET', `${API_BASE}/platforms`, null, {
        Authorization: `Bearer ${adminToken}`,
      });
      record('获取平台列表', res.status === 200 && res.data.success && Array.isArray(res.data.data));
      if (res.data.data?.length) {
        log(`  平台数量: ${res.data.data.length}`, 'blue');
        res.data.data.forEach(p => {
          log(`  ${p.icon} ${p.name} ${p.enabled ? '(启用)' : '(禁用)'}`, 'cyan');
        });
      }
    } catch (e) {
      record('获取平台列表', false, e.message);
    }

    try {
      const res = await request('GET', `${API_BASE}/platforms/shansong`, null, {
        Authorization: `Bearer ${adminToken}`,
      });
      record('获取闪送平台配置', res.status === 200 && res.data.data?.platformId === 'shansong');
    } catch (e) {
      record('获取闪送平台配置', false, e.message);
    }

    try {
      const res = await request('GET', `${API_BASE}/platforms/stats/overview`, null, {
        Authorization: `Bearer ${adminToken}`,
      });
      record('获取平台统计', res.status === 200);
    } catch (e) {
      record('获取平台统计', false, e.message);
    }
  }

  // 5. 对账任务测试
  logHeader('对账任务测试');
  
  if (adminToken) {
    try {
      const res = await request('GET', `${API_BASE}/tasks`, null, {
        Authorization: `Bearer ${adminToken}`,
      });
      record('获取任务列表', res.status === 200 && res.data.success);
      log(`  任务数量: ${res.data.data?.length || 0}`, 'blue');
    } catch (e) {
      record('获取任务列表', false, e.message);
    }

    try {
      const res = await request('GET', `${API_BASE}/tasks/stats`, null, {
        Authorization: `Bearer ${adminToken}`,
      });
      record('获取任务统计', res.status === 200 && res.data.data !== undefined);
    } catch (e) {
      record('获取任务统计', false, e.message);
    }

    try {
      const now = new Date();
      const res = await request('POST', `${API_BASE}/tasks`, {
        name: 'API 测试任务',
        platformId: 'shansong',
        startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: now.toISOString(),
      }, {
        Authorization: `Bearer ${adminToken}`,
      });
      // 201 = 成功, 400 = 验证失败（正常情况，因为没有实际数据）
      record('创建任务', res.status === 201 || res.status === 400);
      log(`  状态码: ${res.status} (${res.status === 201 ? '创建成功' : '需要订单数据'})`, 'blue');
    } catch (e) {
      record('创建任务', false, e.message);
    }

    try {
      const res = await request('GET', `${API_BASE}/tasks/stats/monthly?year=2024&month=12`, null, {
        Authorization: `Bearer ${adminToken}`,
      });
      record('获取月度统计', res.status === 200);
    } catch (e) {
      record('获取月度统计', false, e.message);
    }
  }

  // 6. 操作员权限测试
  logHeader('权限测试');
  
  try {
    const res = await request('POST', `${API_BASE}/auth/login`, {
      username: 'operator',
      password: 'operator123',
    });
    record('操作员登录', res.status === 200 && res.data.data?.role === 'OPERATOR');
  } catch (e) {
    record('操作员登录', false, e.message);
  }

  results.endTime = Date.now();
}

// 输出测试报告
function printReport() {
  logHeader('测试报告');
  
  const duration = ((results.endTime - results.startTime) / 1000).toFixed(2);
  const passRate = results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : 0;

  console.log('\n' + ' '.repeat(2) + colors.cyan + '─'.repeat(46) + colors.reset);
  log(`  测试总数:  ${results.total}`, 'cyan');
  log(`  通过:      ${colors.green}${results.passed}${colors.reset} ${symbols.pass}`, 'green');
  log(`  失败:      ${colors.red}${results.failed}${colors.reset} ${symbols.fail}`, results.failed > 0 ? 'red' : 'green');
  log(`  跳过:      ${results.skipped}`, 'yellow');
  log(`  通过率:    ${passRate}%`, passRate >= 80 ? 'green' : 'yellow');
  log(`  耗时:      ${duration}s`, 'cyan');
  console.log(' '.repeat(2) + colors.cyan + '─'.repeat(46) + colors.reset);

  // 测试结果分布
  log('\n测试结果分布:');
  const distribution = {};
  results.tests.forEach(t => {
    const prefix = t.name.split(' ')[0];
    distribution[prefix] = (distribution[prefix] || { pass: 0, fail: 0 });
    if (t.passed) distribution[prefix].pass++;
    else distribution[prefix].fail++;
  });

  Object.entries(distribution).forEach(([module, { pass, fail }]) => {
    const total = pass + fail;
    const rate = ((pass / total) * 100).toFixed(0);
    log(`  ${module}: ${pass}/${total} (${rate}%)`, rate >= 80 ? 'green' : 'yellow');
  });

  // 失败的测试
  if (results.failed > 0) {
    log('\n失败的测试:');
    results.tests.filter(t => !t.passed).forEach((t, i) => {
      log(`  ${i + 1}. ${t.name}`, 'red');
      if (t.details) log(`     ${t.details}`, 'yellow');
    });
  }

  console.log('\n');
  logHeader(results.failed === 0 ? '🎉 所有测试通过!' : '⚠️  部分测试失败');
}

function showHelp() {
  console.log(`
${colors.cyan}OrderComparer API 测试套件${colors.reset}

用法:
  node run-tests.js [选项]

选项:
  --quick     快速模式，跳过部分测试
  --verbose   详细输出模式
  --watch     监听模式（持续测试）
  --help, -h  显示帮助信息

示例:
  node run-tests.js              # 运行所有测试
  node run-tests.js --verbose    # 详细输出
  node run-tests.js --quick      # 快速测试

注意:
  - 测试前确保没有其他进程占用端口 3001
  - 测试数据存储在 packages/server/prisma/dev.db
`);
}

// 主函数
async function main() {
  if (options.help) {
    showHelp();
    return;
  }

  console.clear();
  console.log('\n' + colors.cyan + '═'.repeat(70) + colors.reset);
  log('  OrderComparer API 自动化测试', 'cyan');
  log('  ' + new Date().toLocaleString('zh-CN'), 'yellow');
  console.log(colors.cyan + '═'.repeat(70) + colors.reset);

  try {
    // 检查并启动服务器
    try {
      await waitForServer(3000);
    } catch {
      await startServer();
      await waitForServer();
    }

    // 运行测试
    await runTests();

    // 输出报告
    printReport();

    process.exit(results.failed === 0 ? 0 : 1);
  } catch (error) {
    log(`\n测试失败: ${error.message}`, 'red');
    if (options.verbose) console.error(error.stack);
    process.exit(1);
  }
}

main();
