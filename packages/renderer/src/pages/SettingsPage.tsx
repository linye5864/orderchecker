import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  User,
  Settings,
  Shield,
  Bell,
  LogOut,
  Clock,
  Key,
  Moon,
  Sun,
  Save,
  AlertTriangle,
} from "lucide-react";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = React.useState("profile");

  // 用户信息 (mock)
  const userInfo = {
    name: "管理员",
    email: "admin@example.com",
    role: "超级管理员",
    avatar: "A",
  };

  // 安全设置
  const securitySettings = {
    sessionTimeout: 120, // 分钟
    twoFactorEnabled: false,
    lastPasswordChange: "2024-12-01",
    loginNotifications: true,
  };

  // 通用设置
  const generalSettings = {
    language: "zh-CN",
    timezone: "Asia/Shanghai",
    theme: "light",
    defaultReconciliationPeriod: 7,
  };

  // 处理登出
  const handleLogout = () => {
    localStorage.removeItem("oc:auth:user");
    sessionStorage.removeItem("oc:auth:user");
    window.location.hash = "/login";
  };

  // Styles
  const styles = {
    page: {
      padding: '24px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '24px',
    },
    pageHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    pageTitle: {
      fontSize: '24px',
      fontWeight: 'bold',
      marginBottom: '4px',
    },
    pageSubtitle: {
      color: '#6b7280',
      fontSize: '14px',
    },
    card: {
      backgroundColor: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      overflow: 'hidden',
    },
    cardHeader: {
      padding: '16px 20px',
      borderBottom: '1px solid #e5e7eb',
    },
    cardTitle: {
      fontSize: '16px',
      fontWeight: 600,
    },
    cardDesc: {
      fontSize: '14px',
      color: '#6b7280',
      marginTop: '4px',
    },
    cardContent: {
      padding: '20px',
    },
    tabsList: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      width: '100%',
      backgroundColor: '#f3f4f6',
      borderRadius: '8px',
      padding: '4px',
    },
    tabTrigger: {
      padding: '8px 16px',
      borderRadius: '6px',
      fontSize: '14px',
      cursor: 'pointer',
      transition: 'all 0.2s',
      border: 'none',
      backgroundColor: 'transparent',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
    },
    tabTriggerActive: {
      backgroundColor: '#fff',
      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    },
    tabContent: {
      marginTop: '24px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '24px',
    },
    avatarSection: {
      display: 'flex',
      alignItems: 'center',
      gap: '24px',
    },
    avatar: {
      width: '80px',
      height: '80px',
      borderRadius: '9999px',
      backgroundColor: '#22c55e',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontSize: '24px',
      fontWeight: 'bold',
    },
    userInfo: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '8px',
    },
    userName: {
      fontSize: '18px',
      fontWeight: 600,
    },
    userEmail: {
      color: '#6b7280',
      fontSize: '14px',
    },
    badge: {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '4px 12px',
      fontSize: '12px',
      borderRadius: '9999px',
      backgroundColor: '#f3f4f6',
      color: '#6b7280',
    },
    grid2: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '16px',
    },
    formGroup: {
      marginBottom: '16px',
    },
    label: {
      fontSize: '14px',
      fontWeight: 500,
      marginBottom: '8px',
      display: 'block',
    },
    input: {
      width: '100%',
      padding: '8px 12px',
      border: '1px solid #d1d5db',
      borderRadius: '6px',
      fontSize: '14px',
    },
    actionBar: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '16px',
      paddingTop: '16px',
      borderTop: '1px solid #e5e7eb',
    },
    themeOption: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '16px',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    themeOptionSelected: {
      borderColor: '#22c55e',
      backgroundColor: '#f0fdf4',
    },
    themeIcon: {
      width: '20px',
      height: '20px',
    },
    themeInfo: {
      display: 'flex',
      flexDirection: 'column' as const,
    },
    themeTitle: {
      fontWeight: 500,
    },
    themeDesc: {
      fontSize: '12px',
      color: '#6b7280',
    },
    select: {
      width: '100%',
      padding: '8px 12px',
      border: '1px solid #d1d5db',
      borderRadius: '6px',
      fontSize: '14px',
      backgroundColor: '#fff',
    },
    settingRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      marginBottom: '12px',
    },
    settingInfo: {
      flex: 1,
    },
    settingTitle: {
      fontWeight: 500,
      marginBottom: '4px',
    },
    settingDesc: {
      fontSize: '14px',
      color: '#6b7280',
    },
    helpText: {
      fontSize: '12px',
      color: '#6b7280',
      marginTop: '4px',
    },
    warningBox: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '16px',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      backgroundColor: '#f9fafb',
      marginBottom: '16px',
    },
    warningIcon: {
      width: '20px',
      height: '20px',
      color: '#eab308',
      flexShrink: 0,
    },
    buttonPrimary: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 16px',
      backgroundColor: '#22c55e',
      color: '#fff',
      border: 'none',
      borderRadius: '6px',
      fontSize: '14px',
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    buttonOutline: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 16px',
      backgroundColor: 'transparent',
      border: '1px solid #d1d5db',
      borderRadius: '6px',
      fontSize: '14px',
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    buttonDanger: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 16px',
      backgroundColor: 'transparent',
      border: '1px solid #fecaca',
      borderRadius: '6px',
      fontSize: '14px',
      color: '#ef4444',
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    notificationItem: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      marginBottom: '12px',
    },
    notificationInfo: {
      flex: 1,
    },
    notificationTitle: {
      fontWeight: 500,
      marginBottom: '4px',
    },
    notificationDesc: {
      fontSize: '14px',
      color: '#6b7280',
    },
    iconWithTitle: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '4px',
    },
    icon: {
      width: '20px',
      height: '20px',
    },
    section: {
      marginBottom: '24px',
    },
  };

  const tabs = [
    { id: "profile", label: "个人信息", icon: <User style={{ width: '16px', height: '16px' }} /> },
    { id: "general", label: "通用设置", icon: <Settings style={{ width: '16px', height: '16px' }} /> },
    { id: "security", label: "安全设置", icon: <Shield style={{ width: '16px', height: '16px' }} /> },
    { id: "notifications", label: "通知设置", icon: <Bell style={{ width: '16px', height: '16px' }} /> },
  ];

  const notifications = [
    { id: "reconciliation_complete", label: "对账完成", desc: "对账任务完成后通知", enabled: true },
    { id: "reconciliation_error", label: "对账异常", desc: "对账过程中出现错误时通知", enabled: true },
    { id: "platform_sync", label: "平台同步", desc: "账单数据同步完成时通知", enabled: false },
    { id: "daily_report", label: "日报推送", desc: "每日对账汇总报告", enabled: true },
  ];

  return (
    <div style={styles.page}>
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.pageTitle}>系统设置</h1>
          <p style={styles.pageSubtitle}>管理账户和系统配置</p>
        </div>
        <button
          style={styles.buttonDanger}
          onClick={handleLogout}
        >
          <LogOut style={{ width: '16px', height: '16px' }} />
          退出登录
        </button>
      </div>

      {/* Tabs */}
      <div style={styles.tabsList}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            style={{
              ...styles.tabTrigger,
              ...(activeTab === tab.id ? styles.tabTriggerActive : {}),
            }}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={styles.tabContent}>
        {/* 个人信息 */}
        {activeTab === "profile" && (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div style={styles.cardTitle}>账户信息</div>
              <p style={styles.cardDesc}>查看和修改您的账户信息</p>
            </div>
            <div style={styles.cardContent}>
              {/* 头像和基本信息 */}
              <div style={styles.avatarSection}>
                <div style={styles.avatar}>{userInfo.avatar}</div>
                <div style={styles.userInfo}>
                  <div style={styles.userName}>{userInfo.name}</div>
                  <div style={styles.userEmail}>{userInfo.email}</div>
                  <div style={styles.badge}>{userInfo.role}</div>
                </div>
              </div>

              <div style={{ ...styles.grid2, marginTop: '24px' }}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>显示名称</label>
                  <input style={styles.input} defaultValue={userInfo.name} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>邮箱地址</label>
                  <input style={styles.input} defaultValue={userInfo.email} type="email" />
                </div>
              </div>

              <div style={styles.actionBar}>
                <button style={styles.buttonOutline}>取消</button>
                <button style={styles.buttonPrimary}>
                  <Save style={{ width: '16px', height: '16px' }} />
                  保存更改
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 通用设置 */}
        {activeTab === "general" && (
          <>
            {/* 外观设置 */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardTitle}>外观设置</div>
                <p style={styles.cardDesc}>自定义界面外观</p>
              </div>
              <div style={styles.cardContent}>
                <div style={{ marginBottom: '24px' }}>
                  <label style={styles.label}>主题</label>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div
                      style={{
                        ...styles.themeOption,
                        ...(generalSettings.theme === "light" ? styles.themeOptionSelected : {}),
                      }}
                    >
                      <Sun style={styles.themeIcon} />
                      <div style={styles.themeInfo}>
                        <p style={styles.themeTitle}>浅色</p>
                        <p style={styles.themeDesc}>明亮的界面主题</p>
                      </div>
                    </div>
                    <div
                      style={{
                        ...styles.themeOption,
                        ...(generalSettings.theme === "dark" ? styles.themeOptionSelected : {}),
                      }}
                    >
                      <Moon style={styles.themeIcon} />
                      <div style={styles.themeInfo}>
                        <p style={styles.themeTitle}>深色</p>
                        <p style={styles.themeDesc}>暗色界面主题</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={styles.grid2}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>语言</label>
                    <select style={styles.select} defaultValue={generalSettings.language}>
                      <option value="zh-CN">简体中文</option>
                      <option value="en-US">English</option>
                    </select>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>时区</label>
                    <select style={styles.select} defaultValue={generalSettings.timezone}>
                      <option value="Asia/Shanghai">Asia/Shanghai (UTC+8)</option>
                      <option value="UTC">UTC</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* 对账默认设置 */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardTitle}>对账默认设置</div>
                <p style={styles.cardDesc}>配置默认对账参数</p>
              </div>
              <div style={styles.cardContent}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>默认对账周期 (天)</label>
                  <input
                    style={{ ...styles.input, width: '200px' }}
                    type="number"
                    defaultValue={generalSettings.defaultReconciliationPeriod}
                    min="1"
                    max="30"
                  />
                  <p style={styles.helpText}>新建对账任务时的默认时间范围</p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* 安全设置 */}
        {activeTab === "security" && (
          <>
            {/* 会话管理 */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={{ ...styles.iconWithTitle, fontSize: '16px', fontWeight: 600 }}>
                  <Clock style={styles.icon} />
                  会话管理
                </div>
                <p style={styles.cardDesc}>控制登录会话的有效期</p>
              </div>
              <div style={styles.cardContent}>
                <div style={styles.warningBox}>
                  <AlertTriangle style={styles.warningIcon} />
                  <div>
                    <p style={{ fontWeight: 500, marginBottom: '4px' }}>会话超时策略</p>
                    <p style={{ fontSize: '14px', color: '#6b7280' }}>
                      长时间未活动后自动登出，保障账户安全
                    </p>
                  </div>
                  <div style={{ ...styles.badge, marginLeft: 'auto' }}>{securitySettings.sessionTimeout} 分钟</div>
                </div>
                <div style={styles.grid2}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>超时时间 (分钟)</label>
                    <input
                      style={{ ...styles.input, width: '200px' }}
                      type="number"
                      defaultValue={securitySettings.sessionTimeout}
                      min="30"
                      max="480"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 密码安全 */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={{ ...styles.iconWithTitle, fontSize: '16px', fontWeight: 600 }}>
                  <Shield style={styles.icon} />
                  密码安全
                </div>
                <p style={styles.cardDesc}>管理密码和账户安全</p>
              </div>
              <div style={styles.cardContent}>
                <div style={styles.settingRow}>
                  <div style={styles.settingInfo}>
                    <p style={styles.settingTitle}>密码强度要求</p>
                    <p style={styles.settingDesc}>至少8位，包含字母和数字</p>
                  </div>
                  <div style={{ ...styles.badge, backgroundColor: '#dcfce7', color: '#16a34a' }}>已启用</div>
                </div>
                <div style={styles.settingRow}>
                  <div style={styles.settingInfo}>
                    <p style={styles.settingTitle}>最后密码修改</p>
                    <p style={styles.settingDesc}>{securitySettings.lastPasswordChange}</p>
                  </div>
                  <button style={styles.buttonOutline}>
                    <Key style={{ width: '16px', height: '16px' }} />
                    修改密码
                  </button>
                </div>
              </div>
            </div>

            {/* 登录通知 */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={{ ...styles.iconWithTitle, fontSize: '16px', fontWeight: 600 }}>
                  <Bell style={styles.icon} />
                  登录通知
                </div>
                <p style={styles.cardDesc}>新设备登录时接收通知</p>
              </div>
              <div style={styles.cardContent}>
                <div style={styles.notificationItem}>
                  <div style={styles.notificationInfo}>
                    <p style={styles.notificationTitle}>登录异常提醒</p>
                    <p style={styles.notificationDesc}>当账户在新设备登录时发送通知</p>
                  </div>
                  <button
                    style={{
                      ...styles.buttonOutline,
                      ...(securitySettings.loginNotifications ? styles.buttonPrimary : {}),
                    }}
                  >
                    {securitySettings.loginNotifications ? "已开启" : "已关闭"}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* 通知设置 */}
        {activeTab === "notifications" && (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div style={styles.cardTitle}>通知偏好</div>
              <p style={styles.cardDesc}>选择您希望接收的通知类型</p>
            </div>
            <div style={styles.cardContent}>
              {notifications.map((item) => (
                <div key={item.id} style={styles.notificationItem}>
                  <div style={styles.notificationInfo}>
                    <p style={styles.notificationTitle}>{item.label}</p>
                    <p style={styles.notificationDesc}>{item.desc}</p>
                  </div>
                  <button
                    style={{
                      ...styles.buttonOutline,
                      ...(item.enabled ? styles.buttonPrimary : {}),
                    }}
                  >
                    {item.enabled ? "已开启" : "已关闭"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
