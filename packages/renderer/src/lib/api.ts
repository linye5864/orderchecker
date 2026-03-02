/**
 * API 客户端模块
 * 基于 Axios 的 HTTP 客户端，带有自动 Token 管理和错误处理
 */

import axios, { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { ReconciliationSummary } from './reconciliation';

// API 基础配置
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000/api/v1`;
const TOKEN_KEY = 'oc:auth:token';
const REFRESH_TOKEN_KEY = 'oc:auth:refresh-token';

// 响应数据类型
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  code?: number;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// 创建 Axios 实例
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 辅助函数：解包后端响应
function unwrapApiResponse<T>(response: AxiosResponse<ApiResponse<T>>): T {
  // 后端返回的格式是 { success, data, message }
  // axios 会将其包装在 response.data 中
  if (response.data?.success && response.data.data !== undefined) {
    return response.data.data as T;
  }
  throw new Error(response.data?.message || '请求失败');
}

function unwrapApiResponseList<T>(response: AxiosResponse<ApiResponse<T[]>>): T[] {
  // 解包列表数据
  if (response.data?.success && Array.isArray(response.data.data)) {
    return response.data.data as T[];
  }
  throw new Error(response.data?.message || '请求失败');
}

// 请求拦截器 - 自动添加 Token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 统一错误处理和 Token 刷新
apiClient.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    // 直接返回 data，让调用方处理
    return response;
  },
  async (error: AxiosError<ApiResponse>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // 处理 401 错误 - 尝试刷新 Token
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = getRefreshToken();
      if (refreshToken) {
        try {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            token: refreshToken
          });

          if (response.data.success && response.data.data?.access_token) {
            setToken(response.data.data.access_token, false);
            originalRequest.headers.Authorization = `Bearer ${response.data.data.access_token}`;
            return apiClient(originalRequest);
          }
        } catch (refreshError) {
          // 刷新失败，清除 Token 并跳转到登录页
          clearAuth();
          window.location.hash = '#/login';
          return Promise.reject(refreshError);
        }
      } else {
        // 没有刷新 Token，直接去登录
        clearAuth();
        window.location.hash = '#/login';
      }
    }

    // 返回结构化的错误信息
    const errorMessage =
      error.response?.data?.message ||
      error.message ||
      '请求失败，请稍后重试';

    return Promise.reject(new Error(errorMessage));
  }
);

// ==================== Token 管理 ====================
// ==================== HTTP 方法封装 ====================

/**
 * GET 请求
 */
export function get<T = unknown>(url: string, params?: Record<string, unknown>): Promise<AxiosResponse<ApiResponse<T>>> {
  return apiClient.get<ApiResponse<T>>(url, { params });
}

/**
 * POST 请求
 */
export function post<T = unknown>(url: string, data?: unknown): Promise<AxiosResponse<ApiResponse<T>>> {
  return apiClient.post<ApiResponse<T>>(url, data);
}

/**
 * PUT 请求
 */
export function put<T = unknown>(url: string, data?: unknown): Promise<AxiosResponse<ApiResponse<T>>> {
  return apiClient.put<ApiResponse<T>>(url, data);
}

/**
 * PATCH 请求
 */
export function patch<T = unknown>(url: string, data?: unknown): Promise<AxiosResponse<ApiResponse<T>>> {
  return apiClient.patch<ApiResponse<T>>(url, data);
}

/**
 * DELETE 请求
 */
export function del<T = unknown>(url: string): Promise<AxiosResponse<ApiResponse<T>>> {
  return apiClient.delete<ApiResponse<T>>(url);
}

// ==================== 认证 API ====================

export interface LoginParams {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  user: {
    id: string;
    username: string;
    email: string | null;
    role: string;
    status: string;
  };
}

export interface User {
  id: string;
  username: string;
  email: string | null;
  role: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Platform {
  id: string;
  platformId: string;
  name: string;
  icon: string;
  enabled: boolean;
  tolerance: number;
  fieldMappings: string | Record<string, unknown>;
  autoSync?: boolean;
  syncInterval?: number;
  createdAt: string;
}

export interface Task {
  id: string;
  name: string;
  platformId: string;
  userId: string;
  startDate: string;
  endDate: string;
  status: string;
  progress: number;
  localOrderCount: number;
  platformOrderCount: number;
  matchedCount: number;
  exceptionCount: number;
  totalAmount: number;
  matchedAmount: number;
  createdAt: string;
}

export interface TaskStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

export interface CreateTaskParams {
  name: string;
  platformId: string;
  startDate: string;
  endDate: string;
}

// 认证相关 API
export const authApi = {
  login: (params: LoginParams) =>
    post<LoginResponse>('/auth/login', params).then((res) => res.data),

  logout: () =>
    post('/auth/logout').then((res) => res.data),

  refresh: () =>
    post<{ token: string }>('/auth/refresh').then((res) => res.data),

  getCurrentUser: () =>
    get<User>('/auth/me').then((res) => res.data),

  // Token 管理
  setToken: (token: string, _rememberMe: boolean, refreshToken?: string): void => {
    localStorage.setItem(TOKEN_KEY, token);
    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }
  },

  getToken: (): string | null => {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  },

  getRefreshToken: (): string | null => {
    return localStorage.getItem(REFRESH_TOKEN_KEY) || null;
  },

  clearAuth: (): void => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  },

  isAuthenticated: (): boolean => {
    const token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
    return !!token;
  },
};

// ==================== 导出独立的 Token 管理函数（向后兼容） ====================

/**
 * 获取存储的 Token
 */
export function getToken(): string | null {
  return authApi.getToken();
}

/**
 * 获取刷新 Token
 */
export function getRefreshToken(): string | null {
  return authApi.getRefreshToken();
}

/**
 * 设置认证信息
 */
export function setToken(token: string, _rememberMe: boolean, refreshToken?: string): void {
  authApi.setToken(token, _rememberMe, refreshToken);
}

/**
 * 清除认证信息
 */
export function clearAuth(): void {
  authApi.clearAuth();
}

/**
 * 检查是否已登录
 */
export function isAuthenticated(): boolean {
  return authApi.isAuthenticated();
}
export const userApi = {
  getList: (params?: { page?: number; pageSize?: number; keyword?: string }) =>
    get<PaginatedResponse<User>>('/users', params).then((res) => res.data),

  getById: (id: string) =>
    get<User>(`/users/${id}`).then((res) => res.data),

  getRoles: () =>
    get<Array<{ value: string; label: string }>>('/users/roles').then((res) => res.data),
};

// 平台相关 API
export const platformApi = {
  getList: () =>
    get<Platform[]>('/platforms').then((res) => {
      const response = res.data as unknown as { code: number; data: Platform[] };
      if (response.code === 200 && Array.isArray(response.data)) {
        return response.data;
      }
      return [] as Platform[];
    }),

  getById: (id: string) =>
    get<Platform>(`/platforms/${id}`).then((res) => {
      const response = res.data as unknown as { code: number; data: Platform; message?: string };
      if (response.code === 200 && response.data) {
        return response.data;
      }
      throw new Error(response.message || '获取平台信息失败');
    }),

  update: (id: string, data: any) =>
    put<Platform>(`/platforms/${id}`, data).then((res) => {
      const response = res.data as unknown as { code: number; data: Platform; message?: string };
      if (response.code === 200 && response.data) {
        return response.data;
      }
      throw new Error(response.message || '更新平台失败');
    }),

  getStatsOverview: () =>
    get<{
      totalPlatforms: number;
      enabledPlatforms: number;
      totalOrders: number;
      matchedOrders: number;
      matchRate: number;
    }>('/platforms/stats/overview').then((res) => {
      const response = res.data as unknown as {
        code: number;
        data: {
          totalPlatforms: number;
          enabledPlatforms: number;
          totalOrders: number;
          matchedOrders: number;
          matchRate: number;
        };
        message?: string;
      };
      if (response.code === 200 && response.data) {
        return response.data;
      }
      throw new Error(response.message || '获取统计信息失败');
    }),
};

// 任务相关 API
export const taskApi = {
  getList: (params?: { page?: number; pageSize?: number }) =>
    get<PaginatedResponse<Task>>('/tasks', params).then((res) => res.data),

  getStats: () =>
    get<TaskStats>('/tasks/stats').then((res) => res.data),

  create: (params: CreateTaskParams) =>
    post<Task>('/tasks', params).then((res) => res.data),
};

// ==================== 文件上传 API ====================

export interface UploadedFile {
  id: string;
  name: string;
  originalName: string;
  size: number;
  type: string;
  path: string;
  kind: 'dispatch' | 'platform' | 'fund';
  platformId?: string;
  createdAt: string;
}

export interface FileUploadResponse {
  success: boolean;
  data?: {
    id: string;
    filename: string;
    size: string;
    file_size_bytes?: number;
    file_type: string;
    created_at: string;
  };
  message?: string;
}

// 文件类型映射 (前端类型 -> 后端类型)
const FILE_TYPE_MAP: Record<string, string> = {
  'dispatch': 'delivery',
  'platform': 'platform',
  'fund': 'flow',
  // 兼容旧类型
  'LOCAL': 'delivery',
  'PLATFORM': 'platform',
  'FLOW': 'flow',
};

export interface FileListResponse {
  success: boolean;
  data: UploadedFile[];
}

export const fileApi = {
  /**
   * 上传文件 (适配后端 API)
   * 后端 API: POST /api/v1/files/upload
   * 请求参数: file, file_type (delivery | platform | flow)
   */
  upload: (file: File, kind: 'dispatch' | 'platform' | 'fund'): Promise<UploadedFile> => {
    const formData = new FormData();
    formData.append('file', file);
    // 转换文件类型
    const fileType = FILE_TYPE_MAP[kind] || kind;
    formData.append('file_type', fileType);

    return apiClient
      .post<FileUploadResponse>('/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      .then((res) => {
        if (res.data.success && res.data.data) {
          const fileSize = res.data.data.file_size_bytes || 0;
          return {
            id: res.data.data.id,
            name: res.data.data.filename,
            originalName: res.data.data.filename,
            size: fileSize,
            type: res.data.data.file_type,
            path: '',
            kind: fileType,
            createdAt: res.data.data.created_at,
          } as UploadedFile;
        }
        throw new Error(res.data.message || '上传失败');
      });
  },

  /**
   * 上传文件（带进度）
   */
  uploadWithProgress: (
    file: File,
    kind: 'dispatch' | 'platform' | 'fund',
    onProgress?: (event: { loaded: number; total: number }) => void
  ): Promise<UploadedFile> => {
    const fileType = FILE_TYPE_MAP[kind] || kind;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('file_type', fileType);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress({ loaded: e.loaded, total: e.total });
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.code === 200 && response.data) {
              const fileSize = response.data.file_size_bytes || 0;
              resolve({
                id: response.data.id,
                name: response.data.filename,
                originalName: response.data.filename,
                size: fileSize,
                type: response.data.file_type,
                path: '',
                kind: fileType,
                createdAt: response.data.created_at,
              } as UploadedFile);
            } else {
              reject(new Error(response.detail || '上传失败'));
            }
          } catch (e) {
            reject(new Error('解析响应失败'));
          }
        } else {
          try {
            const response = JSON.parse(xhr.responseText);
            reject(new Error(response.detail || `上传失败 (${xhr.status})`));
          } catch (e) {
            reject(new Error(`上传失败 (${xhr.status})`));
          }
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('网络错误，上传失败'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('上传已取消'));
      });

      const token = getToken();
      xhr.open('POST', `${API_BASE_URL}/files/upload`);
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      xhr.send(formData);
    });
  },

  /**
   * 验证文件（不上传）
   */
  validate: (files: File[]): Promise<any> => {
    const formData = new FormData();
    files.forEach((file) => formData.append('file', file));

    return apiClient
      .post('/files/upload/validate', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      .then((res) => res.data as any);
  },

  /**
   * 获取文件列表
   */
  getList: (params?: { kind?: string; page?: number; pageSize?: number; search?: string }): Promise<UploadedFile[]> => {
    return get<UploadedFile[]>('/files', params).then((res) => {
      if (res.data && res.data.success && res.data.data) {
        return res.data.data;
      }
      return [] as UploadedFile[];
    });
  },

  /**
   * 获取文件列表 (别名)
   */
  list: (params?: { kind?: string; page?: number; pageSize?: number; search?: string }): Promise<UploadedFile[]> => {
    return get<UploadedFile[]>('/files', params).then((res) => {
      if (res.data && res.data.success && res.data.data) {
        return res.data.data;
      }
      return [] as UploadedFile[];
    });
  },

  /**
   * 获取上传配置
   */
  getUploadStatus: (): Promise<{
    maxFileSize: number;
    maxConcurrent: number;
    allowedExtensions: string[];
    largeFileThreshold: number;
  }> => {
    return get<{
      maxFileSize: number;
      maxConcurrent: number;
      allowedExtensions: string[];
      largeFileThreshold: number;
    }>('/files/upload/status').then((res) => {
      const response = res.data as unknown as {
        code: number;
        data: {
          maxFileSize: number;
          maxConcurrent: number;
          allowedExtensions: string[];
          largeFileThreshold: number;
        };
      };
      if (response.code === 200 && response.data) {
        return response.data;
      }
      return {
        maxFileSize: 50 * 1024 * 1024,
        maxConcurrent: 3,
        allowedExtensions: ['.xlsx', '.xls', '.csv'],
        largeFileThreshold: 10 * 1024 * 1024,
      };
    });
  },

  /**
   * 获取单个文件信息
   */
  getById: (id: string): Promise<UploadedFile> => {
    return get<FileListResponse>(`/files/${id}`).then((res) => (res.data as unknown as FileListResponse).data?.[0] as UploadedFile);
  },

  /**
   * 删除文件
   */
  delete: (id: string): Promise<void> => {
    return del(`/files/${id}`).then(() => undefined);
  },

  /**
   * 批量删除文件
   */
  deleteMany: (ids: string[]): Promise<any> => {
    return apiClient.delete('/files', { data: { ids } }).then((res) => res.data);
  },
};

// ==================== 对账任务 API ====================

export interface ReconciliationTask {
  id: string;
  name: string;
  platformId: string;
  platformName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  startDate: string;
  endDate: string;
  localFileId: string;
  platformFileId: string;
  fundFileId?: string;
  localOrderCount: number;
  platformOrderCount: number;
  matchedCount: number;
  exceptionCount: number;
  totalAmount: number;
  matchedAmount: number;
  exceptionAmount: number;
  result?: ReconciliationSummary;
  createdAt: string;
  completedAt?: string;
}

export interface CreateReconciliationTaskParams {
  name: string;
  platformId: string;
  localFileId: string;
  platformFileId: string;
  fundFileId?: string;
  startDate: string;
  endDate: string;
  tolerance?: number;
}

export interface ReconciliationTaskResponse {
  success: boolean;
  data: ReconciliationTask;
}

export interface ReconciliationTaskListResponse {
  success: boolean;
  data: ReconciliationTask[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export const reconciliationApi = {
  /**
   * 创建对账任务
   */
  create: (params: CreateReconciliationTaskParams): Promise<ReconciliationTask> => {
    return post<ReconciliationTaskResponse>('/reconciliation/tasks', params).then(
      (res) => res.data.data as unknown as ReconciliationTask
    );
  },

  /**
   * 获取对账任务列表
   */
  getList: (params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    platformId?: string;
  }): Promise<{ tasks: ReconciliationTask[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }> => {
    return get<ReconciliationTaskListResponse>('/reconciliation/tasks', params).then((res) => res.data as unknown as {
      tasks: ReconciliationTask[];
      pagination: { page: number; pageSize: number; total: number; totalPages: number };
    });
  },

  /**
   * 获取单个对账任务
   */
  getById: (id: string): Promise<ReconciliationTask> => {
    return get<ApiResponse<ReconciliationTask>>(`/reconciliation/tasks/${id}`).then((res) => res.data as unknown as ReconciliationTask);
  },

  /**
   * 获取对账结果
   */
  getResult: (id: string): Promise<ReconciliationSummary> => {
    return get<ApiResponse<ReconciliationSummary>>(
      `/reconciliation/tasks/${id}/result`
    ).then((res) => res.data as unknown as ReconciliationSummary);
  },

  /**
   * 取消对账任务
   */
  cancel: (id: string): Promise<void> => {
    return post(`/reconciliation/cancel/${id}`).then(() => undefined);
  },

  /**
   * 删除对账任务
   */
  delete: (id: string): Promise<void> => {
    return del(`/reconciliation/tasks/${id}`).then(() => undefined);
  },

  /**
   * 执行对账（真实对账引擎）
   * 后端 API: POST /api/v1/reconciliation/execute
   */
  executeReal: (params: {
    name?: string;
    delivery_file_id: string;
    flow_file_id: string;
    platform_id: string;
    platform_file_id: string;
  }): Promise<{ taskId: string; status: string }> => {
    return post<{ taskId: string; status: string }>('/reconciliation/execute', {
      name: params.name || `对账任务-${new Date().toISOString()}`,
      delivery_file_id: params.delivery_file_id,
      flow_file_id: params.flow_file_id,
      platform_id: params.platform_id,
      platform_file_id: params.platform_file_id,
    }).then((res) => {
      const response = res.data as unknown as { code: number; data: { taskId: string; status: string }; detail?: string; message?: string };
      if (response.code === 200 && response.data) {
        return response.data;
      }
      throw new Error(response.detail || response.message || '执行对账失败');
    });
  },

  /**
   * 获取对账结果（真实对账引擎）
   */
  getResultReal: (taskId: string): Promise<{
    task: ReconciliationTask;
    results: any;
    files: UploadedFile[];
  }> => {
    return get<{ task: ReconciliationTask; results: any; files: UploadedFile[] }>(
      `/reconciliation/results/${taskId}`
    ).then((res) => {
      const response = res.data as unknown as { code: number; data: { task: ReconciliationTask; results: any; files: UploadedFile[] }; message?: string };
      if (response.code === 200 && response.data) {
        return response.data;
      }
      throw new Error(response.message || '获取对账结果失败');
    });
  },

  /**
   * 获取对账进度
   */
  getProgress: (taskId: string): Promise<{
    id: string;
    name: string;
    status: string;
    progress: number;
    errorMessage?: string;
  }> => {
    return get<{
      id: string;
      name: string;
      status: string;
      progress: number;
      errorMessage?: string;
    }>(`/reconciliation/progress/${taskId}`).then((res) => {
      const response = res.data as unknown as {
        code: number;
        data: {
          id: string;
          name: string;
          status: string;
          progress: number;
          errorMessage?: string;
        };
        message?: string;
      };
      if (response.code === 200 && response.data) {
        return response.data;
      }
      throw new Error(response.message || '获取进度失败');
    });
  },

  /**
   * 获取配送单平台汇总
   */
  getPlatformSummary: (localFileId: string): Promise<{
    platformSummary: { platform: string; orderCount: number; totalAmount: number }[];
    cancelledSummary: { platform: string; cancelledCount: number }[];
    totalOrders: number;
  }> => {
    return post<{
      platformSummary: { platform: string; orderCount: number; totalAmount: number }[];
      cancelledSummary: { platform: string; cancelledCount: number }[];
      totalOrders: number;
    }>('/reconciliation/platform-summary', { localFileId }).then((res) => {
      const response = res.data as unknown as {
        code: number;
        data: {
          platformSummary: { platform: string; orderCount: number; totalAmount: number }[];
          cancelledSummary: { platform: string; cancelledCount: number }[];
          totalOrders: number;
        };
        message?: string;
      };
      if (response.code === 200 && response.data) {
        return response.data;
      }
      throw new Error(response.message || '获取平台汇总失败');
    });
  },

  /**
   * 获取对账历史列表
   */
  getHistory: (params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    platformId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }): Promise<{
    items: {
      id: string;
      name: string;
      platformId: string;
      status: string;
      progress: number;
      localOrderCount: number;
      platformOrderCount: number;
      matchedCount: number;
      exceptionCount: number;
      totalAmount: number;
      matchedAmount: number;
      createdAt: string;
      completedAt?: string;
      totalOrders?: number;
      matchedOrders?: number;
      matchRate?: number;
      amountDiff?: number;
    }[];
    total: number;
    totalPages: number;
  }> => {
    return get<{
      items: any[];
      total: number;
      totalPages: number;
    }>('/reconciliation/history', params).then((res) => {
      const response = res.data as unknown as {
        code: number;
        data: {
          items: any[];
          total: number;
          totalPages: number;
        };
        message?: string;
      };
      if (response.code === 200 && response.data) {
        return response.data;
      }
      throw new Error(response.message || '获取历史失败');
    });
  },

  /**
   * 获取对账历史统计
   */
  getHistoryStats: (): Promise<{
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
    totalOrders: number;
    totalMatchedOrders: number;
    totalAmount: number;
    totalMatchedAmount: number;
  }> => {
    return get<{
      total: number;
      completed: number;
      failed: number;
      cancelled: number;
      totalOrders: number;
      totalMatchedOrders: number;
      totalAmount: number;
      totalMatchedAmount: number;
    }>('/reconciliation/history/stats').then((res) => {
      const response = res.data as unknown as {
        code: number;
        data: {
          total: number;
          completed: number;
          failed: number;
          cancelled: number;
          totalOrders: number;
          totalMatchedOrders: number;
          totalAmount: number;
          totalMatchedAmount: number;
        };
        message?: string;
      };
      if (response.code === 200 && response.data) {
        return response.data;
      }
      throw new Error(response.message || '获取历史统计失败');
    });
  },
};

// 导出 API 客户端实例
export default apiClient;
