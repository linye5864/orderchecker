// 数据库种子数据
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 创建默认管理员用户
  const adminPassword = await bcrypt.hash('admin123', 12);
  
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: adminPassword,
      email: 'admin@example.com',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    },
  });

  console.log(`✅ Created admin user: ${admin.username}`);

  // 创建默认操作员用户
  const operatorPassword = await bcrypt.hash('operator123', 12);
  
  const operator = await prisma.user.upsert({
    where: { username: 'operator' },
    update: {},
    create: {
      username: 'operator',
      password: operatorPassword,
      email: 'operator@example.com',
      role: 'OPERATOR',
      status: 'ACTIVE',
    },
  });

  console.log(`✅ Created operator user: ${operator.username}`);

  // 创建示例用户
  const userPassword = await bcrypt.hash('user12345', 12);
  
  const user = await prisma.user.upsert({
    where: { username: 'user' },
    update: {},
    create: {
      username: 'user',
      password: userPassword,
      email: 'user@example.com',
      role: 'VIEWER',
      status: 'ACTIVE',
    },
  });

  console.log(`✅ Created viewer user: ${user.username}`);

  // 初始化平台配置
  const platforms = [
    { platformId: 'shansong', name: '闪送', icon: '📦', enabled: true, tolerance: 0.01, autoSync: true, syncInterval: 15 },
    { platformId: 'dada', name: '达达', icon: '🚴', enabled: true, tolerance: 0.01, autoSync: true, syncInterval: 15 },
    { platformId: 'fengniao', name: '蜂鸟', icon: '🐦', enabled: true, tolerance: 0.01, autoSync: true, syncInterval: 15 },
    { platformId: 'xunfeng', name: '顺丰同城', icon: '✈️', enabled: true, tolerance: 0.01, autoSync: true, syncInterval: 15 },
    { platformId: 'xunfeng-c', name: '顺丰企业C', icon: '🏢', enabled: false, tolerance: 0.01, autoSync: false, syncInterval: 15 },
    { platformId: 'guoxiaodi', name: '裹小递', icon: '📱', enabled: true, tolerance: 0.01, autoSync: true, syncInterval: 15 },
    { platformId: 'uu', name: 'UU跑腿', icon: '🏃', enabled: true, tolerance: 0.01, autoSync: true, syncInterval: 15 },
  ];

  const defaultMappings = [
    { localField: 'delivery_order_sn', platformField: '三方订单编号', required: true },
    { localField: 'platform_order_id', platformField: '订单编号', required: true },
    { localField: 'free', platformField: '实付金额', required: true },
  ];

  for (const platform of platforms) {
    await prisma.platformConfig.upsert({
      where: { platformId: platform.platformId },
      update: {},
      create: {
        ...platform,
        fieldMappings: JSON.stringify(defaultMappings),
      },
    });
  }

  console.log(`✅ Created ${platforms.length} platform configurations`);

  // 初始化系统配置
  const configs = [
    { key: 'default_tolerance', value: '0.01' },
    { key: 'default_sync_interval', value: '15' },
    { key: 'max_upload_size', value: '10485760' },
    { key: 'session_timeout', value: '120' },
  ];

  for (const config of configs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: {},
      create: config,
    });
  }

  console.log(`✅ Created ${configs.length} system configurations`);

  console.log('\n🎉 Seeding completed!\n');
  console.log('📋 Default accounts:');
  console.log('   Admin:    admin / admin123 (SUPER_ADMIN)');
  console.log('   Operator: operator / operator123 (OPERATOR)');
  console.log('   Viewer:   user / user12345 (VIEWER)');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
