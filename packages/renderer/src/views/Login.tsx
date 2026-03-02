import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth";

type AuthLocationState = {
  from?: string;
};

/**
 * 登录页面组件
 * 调用后端 API 进行身份验证
 */
const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading } = useAuthStore();

  // 表单状态
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string>("");

  // 计算登录成功后重定向的地址
  const redirectTo = useMemo(() => {
    const state = (location.state ?? {}) as AuthLocationState;
    const from = state.from;

    if (!from) return "/dashboard";
    if (!from.startsWith("/")) return "/dashboard";

    return from;
  }, [location.state]);

  // 处理登录提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username || !password) {
      setError("请输入用户名和密码");
      return;
    }

    try {
      await login(username, password, rememberMe);
      // 跳转到目标页面
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f5f5f5",
      }}
    >
      <Card style={{ width: "360px" }}>
        <CardHeader style={{ padding: "24px" }}>
          <CardTitle style={{ marginBottom: "24px", fontSize: "20px" }}>登录</CardTitle>
        </CardHeader>
        <CardContent style={{ padding: "24px", paddingTop: "0" }}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* 用户名输入框 */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label
                htmlFor="username"
                style={{ fontSize: "14px", fontWeight: 500, color: "#374151" }}
              >
                用户名
              </label>
              <input
                id="username"
                type="text"
                placeholder="请输入用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  border: "1px solid #d1d5db",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box",
                  opacity: isLoading ? 0.6 : 1,
                }}
              />
            </div>

            {/* 密码输入框 */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label
                htmlFor="password"
                style={{ fontSize: "14px", fontWeight: 500, color: "#374151" }}
              >
                密码
              </label>
              <input
                id="password"
                type="password"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  border: "1px solid #d1d5db",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box",
                  opacity: isLoading ? 0.6 : 1,
                }}
              />
            </div>

            {/* 记住我选项 */}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "14px",
                color: "#374151",
                cursor: isLoading ? "not-allowed" : "pointer",
                opacity: isLoading ? 0.6 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={isLoading}
                style={{ width: "16px", height: "16px" }}
              />
              记住我
            </label>

            {/* 错误提示 */}
            {error && (
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: "6px",
                  backgroundColor: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#dc2626",
                  fontSize: "14px",
                }}
              >
                {error}
              </div>
            )}

            {/* 登录按钮 */}
            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: "100%",
                padding: "11px 20px",
                backgroundColor: isLoading ? "#93c5fd" : "#2563eb",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: 500,
                cursor: isLoading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {isLoading ? "登录中..." : "登录"}
            </button>

            {/* 演示模式提示 */}
            <div
              style={{
                textAlign: "center",
                fontSize: "12px",
                color: "#9ca3af",
                marginTop: "8px",
              }}
            >
              演示账号: admin / admin123
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

// 简单的 Card 组件（内联以避免依赖）
const Card = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    {...props}
    style={{
      backgroundColor: "white",
      borderRadius: "8px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      ...props.style,
    }}
  />
);

const CardHeader = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div {...props} style={{ borderBottom: "1px solid #f3f4f6", ...props.style }} />
);

const CardTitle = (props: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h1 {...props} style={{ margin: 0, ...props.style }} />
);

const CardContent = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div {...props} style={{ ...props.style }} />
);

export default Login;
