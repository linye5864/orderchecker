/**
 * 认证状态管理
 * 使用 Zustand 管理用户登录状态和 Token
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { authApi, type LoginParams, type LoginResponse, type User } from '@/lib/api';

interface AuthState {
  // 用户信息
  user: User | null;
  setUser: (user: User | null) => void;

  // Token 状态
  isAuthenticated: boolean;
  setAuthenticated: (value: boolean) => void;

  // 加载状态
  isLoading: boolean;
  setLoading: (loading: boolean) => void;

  // 登录方法
  login: (username: string, password: string, rememberMe: boolean) => Promise<void>;

  // 登出方法
  logout: () => Promise<void>;

  // 获取当前用户
  fetchCurrentUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // 初始状态
      user: null,
      isAuthenticated: false,
      isLoading: false,

      // 设置用户信息
      setUser: (user) => set({ user }),

      // 设置认证状态
      setAuthenticated: (value) => set({ isAuthenticated: value }),

      // 设置加载状态
      setLoading: (loading) => set({ isLoading: loading }),

      // 登录
      login: async (username: string, password: string, rememberMe: boolean) => {
        set({ isLoading: true });

        try {
          const response = await authApi.login({ username, password } as LoginParams);

          if (response.success && response.data) {
            const { access_token, user } = response.data as LoginResponse;

            // 保存 Token
            authApi.setToken(access_token, rememberMe);

            // 更新状态
            set({
              user: user as User,
              isAuthenticated: true,
              isLoading: false,
            });
          } else {
            throw new Error(response.message || '登录失败');
          }
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // 登出
      logout: async () => {
        set({ isLoading: true });

        try {
          // 调用登出 API
          await authApi.logout();
        } catch {
          // 即使 API 调用失败也清除本地状态
        } finally {
          // 清除认证信息
          authApi.clearAuth();
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      // 获取当前用户信息
      fetchCurrentUser: async () => {
        if (!authApi.isAuthenticated()) {
          set({ user: null, isAuthenticated: false });
          return;
        }

        try {
          const response = await authApi.getCurrentUser();
          if (response.success && response.data) {
            set({
              user: response.data as User,
              isAuthenticated: true,
            });
          } else {
            authApi.clearAuth();
            set({ user: null, isAuthenticated: false });
          }
        } catch {
          authApi.clearAuth();
          set({ user: null, isAuthenticated: false });
        }
      },
    }),
    {
      name: 'oc:auth-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// 选择器 hooks
export const useUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useIsLoading = () => useAuthStore((state) => state.isLoading);
export const useAuthActions = () => useAuthStore((state) => ({
  login: state.login,
  logout: state.logout,
  fetchCurrentUser: state.fetchCurrentUser,
}));
