import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth";

// 导航菜单配置
const navItems = [
  { to: "/dashboard", label: "仪表盘", icon: "📊" },
  { to: "/upload", label: "数据上传", icon: "📤" },
  { to: "/reconciliation", label: "智能对账", icon: "⚖️" },
  { to: "/results", label: "对账结果", icon: "📋" },
  { to: "/history", label: "历史记录", icon: "📁" },
  { to: "/platforms", label: "平台配置", icon: "🔧" },
  { to: "/dataview", label: "数据大屏", icon: "📈" },
  { to: "/settings", label: "系统设置", icon: "⚙️" },
];

/**
 * 应用外壳组件
 * 包含侧边栏导航和顶部栏
 */
const AppShell = () => {
  const navigate = useNavigate();
  const { user, logout, isAuthenticated, fetchCurrentUser } = useAuthStore();
  const [pingResult, setPingResult] = useState<string>("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // 初始化时获取用户信息
  useEffect(() => {
    if (isAuthenticated) {
      fetchCurrentUser();
    }
  }, [isAuthenticated, fetchCurrentUser]);

  // 测试连接
  const handlePing = async () => {
    try {
      const response = await fetch(`http://${window.location.hostname}:8000/api/v1/health`);
      const data = await response.json();
      setPingResult(data.success ? "✓ 连接正常" : "✗ 连接失败");
    } catch {
      setPingResult("✗ 连接失败");
    }
    setTimeout(() => setPingResult(""), 2000);
  };

  // 退出登录
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };

  // 导航链接样式
  const getNavLinkStyle = (isActive: boolean) => ({
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 12px",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: 500,
    textDecoration: "none",
    cursor: "pointer",
    transition: "all 0.15s ease",
    backgroundColor: isActive ? "#eff6ff" : "transparent",
    color: isActive ? "#2563eb" : "#4b5563",
    border: "none",
    width: "100%" as const,
    textAlign: "left" as const,
  });

  return (
    <div style={{
      display: "flex",
      minHeight: "100vh",
      backgroundColor: "#f9fafb",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* 侧边栏 */}
      <aside style={{
        width: "220px",
        flexShrink: 0,
        borderRight: "1px solid #e5e7eb",
        backgroundColor: "white",
        display: "flex",
        flexDirection: "column" as const,
      }}>
        {/* Logo 区域 */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          height: "56px",
          padding: "0 16px",
          borderBottom: "1px solid #f3f4f6",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "32px",
            height: "32px",
            borderRadius: "8px",
            backgroundColor: "#2563eb",
            color: "white",
            fontSize: "14px",
            fontWeight: 700,
          }}>
            OC
          </div>
          <span style={{
            fontSize: "16px",
            fontWeight: 600,
            color: "#1f2937",
          }}>
            OrderComparer
          </span>
        </div>

        {/* 导航菜单 */}
        <nav style={{
          display: "flex",
          flexDirection: "column" as const,
          gap: "4px",
          padding: "12px",
          flex: 1,
        }}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => getNavLinkStyle(isActive)}
            >
              <span style={{ fontSize: "16px" }}>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* 主内容区 */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column" as const,
        minWidth: 0,
      }}>
        {/* 顶部栏 */}
        <header style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "56px",
          flexShrink: 0,
          borderBottom: "1px solid #e5e7eb",
          backgroundColor: "white",
          padding: "0 24px",
        }}>
          {/* 面包屑 */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "14px",
            color: "#6b7280",
          }}>
            <span>首页</span>
          </div>

          {/* 右侧操作区 */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}>
            {/* 用户信息 */}
            {user && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 12px",
                backgroundColor: "#f3f4f6",
                borderRadius: "6px",
                fontSize: "13px",
              }}>
                <span style={{ fontWeight: 500 }}>{user.username}</span>
                <span style={{
                  padding: "2px 6px",
                  backgroundColor: "#2563eb",
                  color: "white",
                  borderRadius: "4px",
                  fontSize: "11px",
                }}>
                  {user.role === 'SUPER_ADMIN' ? '超级管理员' :
                   user.role === 'ADMIN' ? '管理员' :
                   user.role === 'OPERATOR' ? '操作员' : '只读用户'}
                </span>
              </div>
            )}

            <button
              onClick={handlePing}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                backgroundColor: "white",
                fontSize: "13px",
                cursor: "pointer",
                color: "#4b5563",
              }}
            >
              测试连接
            </button>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              style={{
                padding: "6px 12px",
                border: "none",
                borderRadius: "6px",
                backgroundColor: isLoggingOut ? "#f3f4f6" : "transparent",
                fontSize: "13px",
                cursor: isLoggingOut ? "not-allowed" : "pointer",
                color: "#6b7280",
              }}
            >
              {isLoggingOut ? "退出中..." : "退出登录"}
            </button>
            {pingResult && (
              <span style={{
                fontSize: "13px",
                color: pingResult.includes("✓") ? "#16a34a" : "#dc2626",
              }}>
                {pingResult}
              </span>
            )}
          </div>
        </header>

        {/* 页面内容 */}
        <main style={{
          flex: 1,
          padding: "24px",
          overflow: "auto",
        }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppShell;
