import { create, StateCreator } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  Platform,
  LocalOrder,
  PlatformOrder,
  MatchedOrder,
  ReconciliationTask,
  ReconciliationResult,
  UploadedFile,
  PlatformConfig,
  SystemSettings,
  Alert,
} from '@/types';

// 平台列表
const defaultPlatforms: PlatformConfig[] = [
  {
    platformId: 'shansong',
    fieldMappings: [
      { localField: 'delivery_order_sn', platformField: '三方订单编号', required: true },
      { localField: 'platform_order_id', platformField: '订单编号', required: true },
      { localField: 'free', platformField: '实付金额', required: true },
    ],
    tolerance: 0.01,
    autoSync: true,
    syncInterval: 15,
  },
  {
    platformId: 'dada',
    fieldMappings: [
      { localField: 'delivery_order_sn', platformField: '三方订单编号', required: true },
      { localField: 'platform_order_id', platformField: '订单编号', required: true },
      { localField: 'free', platformField: '实付金额', required: true },
    ],
    tolerance: 0.01,
    autoSync: true,
    syncInterval: 15,
  },
];

// 默认设置
const defaultSettings: SystemSettings = {
  language: 'zh-CN',
  timezone: 'Asia/Shanghai',
  theme: 'light',
  defaultReconciliationPeriod: 7,
  sessionTimeout: 120,
  loginNotifications: true,
  notificationPreferences: [
    { id: 'reconciliation_complete', label: '对账完成', description: '对账任务完成后通知', enabled: true },
    { id: 'reconciliation_error', label: '对账异常', description: '对账过程中出现错误时通知', enabled: true },
    { id: 'platform_sync', label: '平台同步', description: '账单数据同步完成时通知', enabled: false },
    { id: 'daily_report', label: '日报推送', description: '每日对账汇总报告', enabled: true },
  ],
};

// 应用状态管理
interface AppState {
  // 加载状态
  isLoading: boolean;
  setLoading: (loading: boolean) => void;

  // 上传文件
  uploadedFiles: UploadedFile[];
  addFile: (file: UploadedFile) => void;
  updateFile: (id: string, updates: Partial<UploadedFile>) => void;
  removeFile: (id: string) => void;
  clearFiles: () => void;

  // 本地订单数据
  localOrders: LocalOrder[];
  setLocalOrders: (orders: LocalOrder[]) => void;
  addLocalOrders: (orders: LocalOrder[]) => void;
  clearLocalOrders: () => void;

  // 平台订单数据
  platformOrders: Record<Platform, PlatformOrder[]>;
  setPlatformOrders: (platform: Platform, orders: PlatformOrder[]) => void;
  clearPlatformOrders: () => void;

  // 对账任务
  tasks: ReconciliationTask[];
  currentTask: ReconciliationTask | null;
  setCurrentTask: (task: ReconciliationTask | null) => void;
  addTask: (task: ReconciliationTask) => void;
  updateTask: (id: string, updates: Partial<ReconciliationTask>) => void;
  clearTasks: () => void;

  // 对账结果
  reconciliationResults: ReconciliationResult[];
  currentResult: ReconciliationResult | null;
  setCurrentResult: (result: ReconciliationResult | null) => void;
  addResult: (result: ReconciliationResult) => void;
  clearResults: () => void;

  // 平台配置
  platformConfigs: PlatformConfig[];
  updatePlatformConfig: (platformId: Platform, config: Partial<PlatformConfig>) => void;
  resetPlatformConfigs: () => void;

  // 系统设置
  settings: SystemSettings;
  updateSettings: (settings: Partial<SystemSettings>) => void;
  resetSettings: () => void;

  // 预警信息
  alerts: Alert[];
  addAlert: (alert: Alert) => void;
  removeAlert: (id: string) => void;
  clearAlerts: () => void;

  // 重置所有状态
  reset: () => void;
}

const initialState = {
  isLoading: false,
  uploadedFiles: [],
  localOrders: [],
  platformOrders: {} as Record<Platform, PlatformOrder[]>,
  tasks: [],
  currentTask: null,
  reconciliationResults: [],
  currentResult: null,
  platformConfigs: defaultPlatforms,
  settings: defaultSettings,
  alerts: [],
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialState,

      // 加载状态
      setLoading: (loading) => set({ isLoading: loading }),

      // 上传文件管理
      addFile: (file) =>
        set((state) => ({
          uploadedFiles: [...state.uploadedFiles, file],
        })),
      updateFile: (id, updates) =>
        set((state) => ({
          uploadedFiles: state.uploadedFiles.map((f) =>
            f.id === id ? { ...f, ...updates } : f
          ),
        })),
      removeFile: (id) =>
        set((state) => ({
          uploadedFiles: state.uploadedFiles.filter((f) => f.id !== id),
        })),
      clearFiles: () => set({ uploadedFiles: [] }),

      // 本地订单
      setLocalOrders: (orders) => set({ localOrders: orders }),
      addLocalOrders: (orders) =>
        set((state) => ({
          localOrders: [...state.localOrders, ...orders],
        })),
      clearLocalOrders: () => set({ localOrders: [] }),

      // 平台订单
      setPlatformOrders: (platform, orders) =>
        set((state) => ({
          platformOrders: {
            ...state.platformOrders,
            [platform]: orders,
          },
        })),
      clearPlatformOrders: () => set({ platformOrders: {} as Record<Platform, PlatformOrder[]> }),

      // 对账任务
      setCurrentTask: (task) => set({ currentTask: task }),
      addTask: (task) =>
        set((state) => ({
          tasks: [...state.tasks, task],
        })),
      updateTask: (id, updates) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
          currentTask:
            state.currentTask?.id === id
              ? { ...state.currentTask, ...updates }
              : state.currentTask,
        })),
      clearTasks: () => set({ tasks: [], currentTask: null }),

      // 对账结果
      setCurrentResult: (result) => set({ currentResult: result }),
      addResult: (result) =>
        set((state) => ({
          reconciliationResults: [...state.reconciliationResults, result],
        })),
      clearResults: () => set({ reconciliationResults: [], currentResult: null }),

      // 平台配置
      updatePlatformConfig: (platformId, config) =>
        set((state) => ({
          platformConfigs: state.platformConfigs.map((c) =>
            c.platformId === platformId ? { ...c, ...config } : c
          ),
        })),
      resetPlatformConfigs: () => set({ platformConfigs: defaultPlatforms }),

      // 系统设置
      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),
      resetSettings: () => set({ settings: defaultSettings }),

      // 预警信息
      addAlert: (alert) =>
        set((state) => ({
          alerts: [alert, ...state.alerts].slice(0, 50), // 最多保留50条
        })),
      removeAlert: (id) =>
        set((state) => ({
          alerts: state.alerts.filter((a) => a.id !== id),
        })),
      clearAlerts: () => set({ alerts: [] }),

      // 重置所有
      reset: () => set(initialState),
    }),
    {
      name: 'ordercomparer-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        settings: state.settings,
        platformConfigs: state.platformConfigs,
        tasks: state.tasks,
        alerts: state.alerts,
      }),
    }
  )
);

// 选择器 hooks（性能优化）
export const useUploadedFiles = () => useAppStore((state) => state.uploadedFiles);
export const useLocalOrders = () => useAppStore((state) => state.localOrders);
export const usePlatformOrders = (platform?: Platform) =>
  useAppStore((state) =>
    platform ? state.platformOrders[platform] || [] : state.platformOrders
  );
export const useCurrentTask = () => useAppStore((state) => state.currentTask);
export const useCurrentResult = () => useAppStore((state) => state.currentResult);
export const useSettings = () => useAppStore((state) => state.settings);
export const usePlatformConfigs = () => useAppStore((state) => state.platformConfigs);
export const useAlerts = () => useAppStore((state) => state.alerts);
export const useIsLoading = () => useAppStore((state) => state.isLoading);
