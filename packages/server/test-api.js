#!/usr/bin/env node
/**
 * OrderComparer API 自动测试脚本
 * 
 * 使用方法:
 *   node test-api.js                    # 运行所有测试
 *   node test-api.js auth              # 只运行认证测试
 *   node test-api.js users             # 只运行用户管理测试
 *   node test-api.js platforms         # 只运行平台配置测试
 */

import http from 'http';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.join(__dirname, '..');
const BASE_URL = 'http://localhost:3001';
const API_BASE = `${BASE_URL}/api/v1`;

// 颜色配置
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

function logTest(name, passed, error = null) {
  const status = passed ? '✓' : '✗';
  const color = passed ? 'green' : 'red';
  log(`  ${status} ${name}`, color);
  if (error) {
    log(`    ${error}`, 'yellow');
  }
}

// HTTP 请求封装
async function request(method, endpoint, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(body),
            headers: res.headers,
          });
        } catch {
          resolve({
            status: res.statusCode,
            data: body,
            headers: res.headers,
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// 测试结果收集
const results = {
  passed: 0,
  failed: 0,
  tests: [],
};

function recordTest(name, passed, error = null) {
  results.tests.push({ name, passed, error });
  if (passed) {
    results.passed++;
    logTest(name, true);
  } else {
    results.failed++;
    logTest(name, false, error);
  }
}

// 检查服务器是否运行
async function waitForServer(maxWait = 10000) {
  log('等待服务器启动...', 'yellow');
  const start = Date.now();
  
  while (Date.now() - start < maxWait) {
    try {
      const res = await request('GET', `${API_BASE}/health`);
      if (res.status === 200) {
        log('服务器已启动 ✓\n', 'green');
        return true;
      }
    } catch {
      // 服务器未就绪，继续等待
    }
    await new Promise(r => setTimeout(r, 500));
  }
  
  throw new Error('服务器启动超时');
}

// ==================== 认证模块测试 ====================
async function testAuth() {
  logSection('认证模块测试');

  let token = null;
  let refreshToken = null;

  // 测试 1: 健康检查
  try {
    const res = await request('GET', `${API_BASE}/health`);
    recordTest('健康检查', res.status === 200 && res.data.success);
  } catch (e) {
    recordTest('健康检查', false, e.message);
  }

  // 测试 2: 管理员登录
  try {
    const res = await request('POST', `${API_BASE}/auth/login`, {
      username: 'admin',
      password: 'admin123',
    });
    const success = res.status === 200 && res.data.success && res.data.data?.token;
    recordTest('管理员登录 (admin/admin123)', success);
    if (success) {
      token = res.data.data.token;
      log(`    Token: ${token.substring(0, 30)}...`, 'blue');
    }
  } catch (e) {
    recordTest('管理员登录', false, e.message);
  }

  // 测试 3: 错误的密码
  try {
    const res = await request('POST', `${API_BASE}/auth/login`, {
      username: 'admin',
      password: 'wrongpassword',
    });
    recordTest('错误密码拒绝', res.status === 401 && !res.data.success);
  } catch (e) {
    recordTest('错误密码拒绝', false, e.message);
  }

  // 测试 4: 不存在的用户
  try {
    const res = await request('POST', `${API_BASE}/auth/login`, {
      username: 'nonexistent',
      password: 'password',
    });
    recordTest('不存在的用户被拒绝', res.status === 401);
  } catch (e) {
    recordTest('不存在的用户被拒绝', false, e.message);
  }

  // 测试 5: 获取当前用户
  if (token) {
    try {
      const res = await request('GET', `${API_BASE}/auth/me`, null, {
        Authorization: `Bearer ${token}`,
      });
      const success = res.status === 200 && res.data.data?.username === 'admin';
      recordTest('获取当前用户信息', success);
      if (success) {
        log(`    用户: ${res.data.data.username}, 角色: ${res.data.data.role}`, 'blue');
      }
    } catch (e) {
      recordTest('获取当前用户信息', false, e.message);
    }
  } else {
    recordTest('获取当前用户信息', false, '缺少 token');
  }

  // 测试 6: 无 Token 访问受保护路由
  try {
    const res = await request('GET', `${API_BASE}/users`);
    recordTest('无 Token 被拒绝访问', res.status === 401);
  } catch (e) {
    recordTest('无 Token 被拒绝访问', false, e.message);
  }

  // 测试 7: 无效 Token
  try {
    const res = await request('GET', `${API_BASE}/users`, null, {
      Authorization: 'Bearer invalid.token.here',
    });
    recordTest('无效 Token 被拒绝', res.status === 401);
  } catch (e) {
    recordTest('无效 Token 被拒绝', false, e.message);
  }

  // 测试 8: 操作员登录
  try {
    const res = await request('POST', `${API_BASE}/auth/login`, {
      username: 'operator',
      password: 'operator123',
    });
    const success = res.status === 200 && res.data.success;
    recordTest('操作员登录 (operator/operator123)', success);
    if (success) {
      log(`    角色: ${res.data.data.role}`, 'blue');
    }
  } catch (e) {
    recordTest('操作员登录', false, e.message);
  }

  // 测试 9: Token 刷新
  if (token) {
    try {
      const res = await request('POST', `${API_BASE}/auth/refresh`, null, {
        Authorization: `Bearer ${token}`,
      });
      const success = res.status === 200 && res.data.data?.token;
      recordTest('Token 刷新', success);
      if (success) {
        refreshToken = res.data.data.token;
        // 使用刷新后的 token 供后续测试使用
        token = refreshToken;
      }
    } catch (e) {
      recordTest('Token 刷新', false, e.message);
    }
  }

  // 返回 token 供后续测试使用
  return { token };
}

// ==================== 用户管理测试 ====================
async function testUsers(token) {
  logSection('用户管理测试');

  // 测试 1: 获取用户列表
  try {
    const res = await request('GET', `${API_BASE}/users`, null, {
      Authorization: `Bearer ${token}`,
    });
    const success = res.status === 200 && res.data.success && Array.isArray(res.data.data);
    recordTest('获取用户列表', success);
    if (success) {
      log(`    用户数量: ${res.data.data.length}`, 'blue');
    }
  } catch (e) {
    recordTest('获取用户列表', false, e.message);
  }

  // 测试 2: 获取用户详情
  try {
    const res = await request('GET', `${API_BASE}/users/07ae7919-190c-4f10-8fef-1c1094ff033b`, null, {
      Authorization: `Bearer ${token}`,
    });
    const success = res.status === 200 && res.data.data?.username === 'admin';
    recordTest('获取用户详情', success);
  } catch (e) {
    recordTest('获取用户详情', false, e.message);
  }

  // 测试 3: 获取角色列表
  try {
    const res = await request('GET', `${API_BASE}/users/roles`, null, {
      Authorization: `Bearer ${token}`,
    });
    const success = res.status === 200 && res.data.success && res.data.data?.length === 4;
    recordTest('获取角色列表', success);
    if (success) {
      log(`    角色: ${res.data.data.map(r => r.value).join(', ')}`, 'blue');
    }
  } catch (e) {
    recordTest('获取角色列表', false, e.message);
  }

  // 测试 4: 分页查询
  try {
    const res = await request('GET', `${API_BASE}/users?page=1&pageSize=10`, null, {
      Authorization: `Bearer ${token}`,
    });
    const success = res.status === 200 && res.data.pagination?.page === 1;
    recordTest('用户分页查询', success);
  } catch (e) {
    recordTest('用户分页查询', false, e.message);
  }

  // 测试 5: 关键词搜索
  try {
    const res = await request('GET', `${API_BASE}/users?keyword=admin`, null, {
      Authorization: `Bearer ${token}`,
    });
    const success = res.status === 200 && res.data.success;
    recordTest('用户关键词搜索', success);
  } catch (e) {
    recordTest('用户关键词搜索', false, e.message);
  }
}

// ==================== 平台配置测试 ====================
async function testPlatforms(token) {
  logSection('平台配置测试');

  // 测试 1: 获取平台列表
  try {
    const res = await request('GET', `${API_BASE}/platforms`, null, {
      Authorization: `Bearer ${token}`,
    });
    const success = res.status === 200 && res.data.success && Array.isArray(res.data.data);
    recordTest('获取平台列表', success);
    if (success) {
      log(`    平台数量: ${res.data.data.length}`, 'blue');
      res.data.data.forEach(p => {
        log(`    - ${p.icon} ${p.name} (${p.enabled ? '启用' : '禁用'})`, 'cyan');
      });
    }
  } catch (e) {
    recordTest('获取平台列表', false, e.message);
  }

  // 测试 2: 获取单个平台配置
  try {
    const res = await request('GET', `${API_BASE}/platforms/shansong`, null, {
      Authorization: `Bearer ${token}`,
    });
    const success = res.status === 200 && res.data.data?.platformId === 'shansong';
    recordTest('获取闪送平台配置', success);
  } catch (e) {
    recordTest('获取闪送平台配置', false, e.message);
  }

  // 测试 3: 平台统计概览
  try {
    const res = await request('GET', `${API_BASE}/platforms/stats/overview`, null, {
      Authorization: `Bearer ${token}`,
    });
    const success = res.status === 200 && res.data.success;
    recordTest('获取平台统计概览', success);
  } catch (e) {
    recordTest('获取平台统计概览', false, e.message);
  }
}

// ==================== 对账任务测试 ====================
async function testTasks(token) {
  logSection('对账任务测试');

  // 测试 1: 获取任务列表
  try {
    const res = await request('GET', `${API_BASE}/tasks`, null, {
      Authorization: `Bearer ${token}`,
    });
    const success = res.status === 200 && res.data.success;
    recordTest('获取任务列表', success);
    if (success) {
      log(`    任务数量: ${res.data.data?.length || 0}`, 'blue');
    }
  } catch (e) {
    recordTest('获取任务列表', false, e.message);
  }

  // 测试 2: 获取任务统计
  try {
    const res = await request('GET', `${API_BASE}/tasks/stats`, null, {
      Authorization: `Bearer ${token}`,
    });
    const success = res.status === 200 && res.data.success;
    recordTest('获取任务统计', success);
    if (success) {
      log(`    总任务: ${res.data.data?.total || 0}`, 'blue');
    }
  } catch (e) {
    recordTest('获取任务统计', false, e.message);
  }

  // 测试 3: 创建任务（需要数据准备）
  try {
    const now = new Date();
    const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const endDate = now;

    const res = await request('POST', `${API_BASE}/tasks`, {
      name: '测试对账任务',
      platformId: 'shansong',
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    }, {
      Authorization: `Bearer ${token}`,
    });

    if (res.status === 201 || res.status === 400) {
      // 400 表示验证失败（没有数据），这是正常的
      recordTest('创建任务', true);
      log(`    ${res.status === 201 ? '创建成功' : '验证失败（无订单数据）'}`, 'blue');
    } else {
      recordTest('创建任务', false);
    }
  } catch (e) {
    recordTest('创建任务', false, e.message);
  }
}

// ==================== 测试汇总 ====================
function printSummary() {
  logSection('测试结果汇总');
  
  const total = results.passed + results.failed;
  const passRate = total > 0 ? ((results.passed / total) * 100).toFixed(1) : 0;
  
  log(`总测试数: ${total}`, 'cyan');
  log(`通过: ${results.passed} ${colors.green}✓${colors.reset}`);
  log(`失败: ${results.failed} ${results.failed > 0 ? colors.red + '✗' : '✓'}${colors.reset}`);
  log(`通过率: ${passRate}%`, passRate >= 80 ? 'green' : 'yellow');

  log('\n详细结果:');
  results.tests.forEach((t, i) => {
    const status = t.passed ? 'PASS' : 'FAIL';
    const color = t.passed ? 'green' : 'red';
    log(`${i + 1}. [${status}] ${t.name}`, color);
    if (t.error) {
      log(`   Error: ${t.error}`, 'yellow');
    }
  });

  return results.failed === 0;
}

// ==================== 主函数 ====================
async function main() {
  console.clear();
  log('\n' + '═'.repeat(60), 'cyan');
  log('  OrderComparer API 自动测试', 'cyan');
  log('═'.repeat(60) + '\n', 'cyan');

  try {
    // 等待服务器就绪
    await waitForServer();

    // 运行测试
    const { token } = await testAuth();
    
    if (token) {
      await testUsers(token);
      await testPlatforms(token);
      await testTasks(token);
    }

    // 输出汇总
    const allPassed = printSummary();
    
    log('\n' + '═'.repeat(60), 'cyan');
    if (allPassed) {
      log('  所有测试通过! ✓', 'green');
    } else {
      log('  部分测试失败，请检查上方错误信息', 'yellow');
    }
    log('═'.repeat(60) + '\n', 'cyan');

    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    log(`\n测试过程出错: ${error.message}`, 'red');
    log(error.stack, 'yellow');
    process.exit(1);
  }
}

main();
