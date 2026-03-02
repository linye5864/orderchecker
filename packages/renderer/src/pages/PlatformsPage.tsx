import * as React from "react";
import { useEffect, useState } from "react";
import { platformApi, type Platform } from "@/lib/api";

type FieldMapping = {
  localField: string;
  platformField: string;
  required: boolean;
};

type PlatformConfig = {
  platformId: string;
  fieldMappings: FieldMapping[];
  tolerance: number;
  autoSync: boolean;
  syncInterval: number;
};

// 平台图标映射
const platformIcons: Record<string, string> = {
  shansong: "📦",
  dada: "🚴",
  fengniao: "🐦",
  xunfeng: "✈️",
  "xunfeng-c": "🏢",
  guoxiaodi: "📱",
  uu: "🏃",
};

// 平台名称映射
const platformNames: Record<string, string> = {
  shansong: "闪送",
  dada: "达达",
  fengniao: "蜂鸟",
  xunfeng: "顺丰同城",
  "xunfeng-c": "顺丰企业C",
  guoxiaodi: "裹小递",
  uu: "UU跑腿",
};

// Styles object
const styles = {
  page: {
    padding: "24px",
  },
  pageTitle: {
    fontSize: "24px",
    fontWeight: "bold",
    marginBottom: "4px",
  },
  pageSubtitle: {
    color: "#6b7280",
    fontSize: "14px",
    marginBottom: "24px",
  },
  grid: {
    display: "grid",
    gap: "24px",
  },
  card: {
    backgroundColor: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    overflow: "hidden",
  },
  cardHeader: {
    padding: "16px 20px",
    borderBottom: "1px solid #e5e7eb",
  },
  cardTitle: {
    fontSize: "16px",
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  cardContent: {
    padding: "20px",
  },
  spaceY2: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "8px",
  },
  platformItem: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "all 0.2s",
    border: "1px solid transparent",
  },
  platformItemSelected: {
    backgroundColor: "#f0fdf4",
    borderLeft: "4px solid #22c55e",
  },
  platformItemDefault: {
    border: "1px solid transparent",
  },
  platformIcon: {
    fontSize: "24px",
  },
  platformInfo: {
    flex: 1,
    minWidth: 0,
  },
  platformNameRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  platformName: {
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  platformStats: {
    fontSize: "12px",
    color: "#6b7280",
  },
  chevron: {
    width: "16px",
    height: "16px",
    color: "#6b7280",
    transition: "transform 0.2s",
  },
  chevronRotated: {
    transform: "rotate(90deg)",
  },
  platformDetailHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  platformDetailTitle: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  platformLargeIcon: {
    fontSize: "36px",
  },
  platformDetailName: {
    fontSize: "20px",
    fontWeight: 600,
  },
  platformDetailDesc: {
    fontSize: "14px",
    color: "#6b7280",
  },
  tabsList: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    width: "100%",
    backgroundColor: "#f3f4f6",
    borderRadius: "8px",
    padding: "4px",
  },
  tabTrigger: {
    padding: "8px 16px",
    borderRadius: "6px",
    fontSize: "14px",
    cursor: "pointer",
    transition: "all 0.2s",
    border: "none",
    backgroundColor: "transparent",
  },
  tabTriggerActive: {
    backgroundColor: "#fff",
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  },
  tabContent: {
    marginTop: "16px",
  },
  section: {
    marginBottom: "24px",
  },
  sectionTitle: {
    fontSize: "16px",
    fontWeight: 600,
    marginBottom: "4px",
  },
  sectionDesc: {
    fontSize: "14px",
    color: "#6b7280",
    marginBottom: "16px",
  },
  settingRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    marginBottom: "12px",
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    fontWeight: 500,
    marginBottom: "4px",
  },
  settingDesc: {
    fontSize: "14px",
    color: "#6b7280",
  },
  input: {
    width: "100%",
    padding: "8px 12px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    fontSize: "14px",
  },
  fieldRow: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    padding: "12px",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    marginBottom: "12px",
  },
  fieldInput: {
    flex: 1,
    padding: "8px 12px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    fontSize: "14px",
  },
  fieldArrow: {
    width: "16px",
    height: "16px",
    color: "#6b7280",
  },
  label: {
    fontSize: "14px",
    fontWeight: 500,
    marginBottom: "8px",
    display: "block",
  },
  helpText: {
    fontSize: "12px",
    color: "#6b7280",
    marginTop: "4px",
  },
  actionBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "16px",
    paddingTop: "16px",
    borderTop: "1px solid #e5e7eb",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    padding: "48px",
    textAlign: "center" as const,
  },
  emptyIcon: {
    width: "48px",
    height: "48px",
    color: "#6b7280",
    marginBottom: "16px",
  },
  emptyTitle: {
    fontSize: "18px",
    fontWeight: 600,
    marginBottom: "4px",
  },
  emptyDesc: {
    color: "#6b7280",
    fontSize: "14px",
  },
  buttonPrimary: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 16px",
    backgroundColor: "#22c55e",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  buttonOutline: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 16px",
    backgroundColor: "transparent",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    fontSize: "14px",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    fontSize: "12px",
    borderRadius: "9999px",
  },
  badgeEnabled: {
    backgroundColor: "#dcfce7",
    color: "#16a34a",
  },
  badgeDisabled: {
    backgroundColor: "#f3f4f6",
    color: "#6b7280",
  },
  badgeDanger: {
    backgroundColor: "#fee2e2",
    color: "#dc2626",
    fontSize: "12px",
    padding: "2px 8px",
    borderRadius: "4px",
  },
  inputNumber: {
    width: "200px",
    padding: "8px 12px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    fontSize: "14px",
  },
  loadingState: {
    textAlign: "center" as const,
    padding: "48px",
    color: "#6b7280",
  },
  errorState: {
    textAlign: "center" as const,
    padding: "48px",
    color: "#dc2626",
  },
};

interface PlatformListProps {
  platforms: Platform[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function PlatformList({ platforms, selectedId, onSelect }: PlatformListProps) {
  return (
    <div style={styles.spaceY2}>
      {platforms.map((platform) => (
        <div
          key={platform.id}
          onClick={() => onSelect(platform.id)}
          style={{
            ...styles.platformItem,
            ...(selectedId === platform.id
              ? styles.platformItemSelected
              : styles.platformItemDefault),
          }}
          onMouseEnter={(e) => {
            if (selectedId !== platform.id) {
              e.currentTarget.style.backgroundColor = "#f9fafb";
            }
          }}
          onMouseLeave={(e) => {
            if (selectedId !== platform.id) {
              e.currentTarget.style.backgroundColor = "transparent";
            }
          }}
        >
          <span style={styles.platformIcon}>
            {platformIcons[platform.platformId] || "📦"}
          </span>
          <div style={styles.platformInfo}>
            <div style={styles.platformNameRow}>
              <span style={styles.platformName}>{platformNames[platform.platformId] || platform.name}</span>
              {platform.enabled ? (
                <span style={{ color: "#22c55e", fontSize: "16px" }}>✓</span>
              ) : (
                <span style={{ color: "#9ca3af", fontSize: "16px" }}>✗</span>
              )}
            </div>
            <p style={styles.platformStats}>
              {platform.enabled ? "已启用" : "已禁用"}
            </p>
          </div>
          <span
            style={{
              ...styles.chevron,
              ...(selectedId === platform.id ? styles.chevronRotated : {}),
            }}
          >
            ›
          </span>
        </div>
      ))}
    </div>
  );
}

interface PlatformDetailProps {
  platformId: string;
}

function PlatformDetail({ platformId }: PlatformDetailProps) {
  const [activeTab, setActiveTab] = React.useState("basic");
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<PlatformConfig>({
    platformId,
    fieldMappings: [],
    tolerance: 0.01,
    autoSync: true,
    syncInterval: 15,
  });
  const [hasChanges, setHasChanges] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // 加载平台详情
  useEffect(() => {
    const fetchPlatform = async () => {
      try {
        setLoading(true);
        const platformData = await platformApi.getById(platformId);

        if (!platformData) {
          alert('加载平台详情失败');
          setPlatform(null);
          return;
        }

        setPlatform(platformData);

        // 解析 fieldMappings
        const fieldMappings =
          typeof platformData.fieldMappings === "string"
            ? JSON.parse(platformData.fieldMappings)
            : Array.isArray(platformData.fieldMappings)
            ? platformData.fieldMappings
            : [];

        setConfig({
          platformId: platformData.platformId,
          fieldMappings,
          tolerance: platformData.tolerance || 0.01,
          autoSync: platformData.autoSync || false,
          syncInterval: platformData.syncInterval || 15,
        });
      } catch (err) {
        console.error("加载平台详情失败:", err);
        alert("加载平台详情失败：" + (err instanceof Error ? err.message : "未知错误"));
      } finally {
        setLoading(false);
      }
    };

    fetchPlatform();
  }, [platformId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await platformApi.update(platformId, {
        enabled: platform?.enabled,
        fieldMappings: config.fieldMappings,
        tolerance: config.tolerance,
        autoSync: config.autoSync,
        syncInterval: config.syncInterval,
      });

      if (result) {
        setHasChanges(false);
        alert("保存成功！");
        // 刷新平台详情以获取最新数据
        const updatedPlatform = await platformApi.getById(platformId);
        if (updatedPlatform) {
          setPlatform(updatedPlatform);
        }
      } else {
        alert("保存失败，请重试");
      }
    } catch (err) {
      console.error("保存失败:", err);
      alert("保存失败：" + (err instanceof Error ? err.message : "未知错误"));
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: "basic", label: "基本信息" },
    { id: "mapping", label: "字段映射" },
    { id: "rules", label: "对账规则" },
  ];

  if (loading) {
    return (
      <div style={styles.loadingState}>
        <div>⏳ 加载中...</div>
      </div>
    );
  }

  if (!platform) {
    return (
      <div style={styles.errorState}>
        <div>❌ 加载失败</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: "24px" }}>
      {/* 平台基本信息 */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.platformDetailHeader}>
            <div style={styles.platformDetailTitle}>
              <span style={styles.platformLargeIcon}>
                {platformIcons[platform.platformId] || "📦"}
              </span>
              <div>
                <div style={styles.platformDetailName}>
                  {platformNames[platform.platformId] || platform.name}
                </div>
                <div style={styles.platformDetailDesc}>
                  {platform.enabled ? `已启用` : "已禁用"}
                </div>
              </div>
            </div>
            <div
              style={{
                ...styles.badge,
                ...(platform.enabled ? styles.badgeEnabled : styles.badgeDisabled),
              }}
            >
              {platform.enabled ? "已启用" : "已禁用"}
            </div>
          </div>
        </div>
      </div>

      {/* 配置面板 */}
      <div>
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
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={styles.tabContent}>
          {activeTab === "basic" && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: "16px" }}>
              {/* 启用状态 */}
              <div style={styles.settingRow}>
                <div style={styles.settingInfo}>
                  <p style={styles.settingTitle}>启用平台</p>
                  <p style={styles.settingDesc}>启用后系统将自动拉取该平台账单</p>
                </div>
                <button
                  style={{
                    ...styles.buttonOutline,
                    ...(platform.enabled ? styles.buttonPrimary : {}),
                  }}
                  onClick={() => {
                    setPlatform({ ...platform, enabled: !platform.enabled });
                    setHasChanges(true);
                  }}
                >
                  {platform.enabled ? "已启用" : "已禁用"}
                </button>
              </div>

              {/* 自动同步 */}
              <div style={styles.settingRow}>
                <div style={styles.settingInfo}>
                  <p style={styles.settingTitle}>自动同步</p>
                  <p style={styles.settingDesc}>定期自动拉取最新账单数据</p>
                </div>
                <button
                  style={{
                    ...styles.buttonOutline,
                    ...(config.autoSync ? styles.buttonPrimary : {}),
                  }}
                  onClick={() => {
                    setConfig({ ...config, autoSync: !config.autoSync });
                    setHasChanges(true);
                  }}
                >
                  {config.autoSync ? "已开启" : "已关闭"}
                </button>
              </div>

              {/* 同步间隔 */}
              <div style={styles.settingRow}>
                <div style={styles.settingInfo}>
                  <p style={styles.settingTitle}>同步间隔</p>
                  <p style={styles.settingDesc}>自动拉取账单的时间间隔</p>
                </div>
                <input
                  type="number"
                  style={styles.inputNumber}
                  value={config.syncInterval}
                  onChange={(e) => {
                    setConfig({ ...config, syncInterval: parseInt(e.target.value) });
                    setHasChanges(true);
                  }}
                  min={5}
                  max={1440}
                />
              </div>
            </div>
          )}

          {activeTab === "mapping" && (
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardTitle}>字段映射</div>
                <p style={{ fontSize: "14px", color: "#6b7280", marginTop: "4px" }}>
                  配置本地字段与平台字段的对应关系
                </p>
              </div>
              <div style={styles.cardContent}>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: "12px" }}>
                  {config.fieldMappings.length > 0 ? (
                    config.fieldMappings.map((mapping, index) => (
                      <div key={index} style={styles.fieldRow}>
                        <input
                          style={styles.fieldInput}
                          value={mapping.localField}
                          onChange={(e) => {
                            const newMappings = [...config.fieldMappings];
                            newMappings[index].localField = e.target.value;
                            setConfig({ ...config, fieldMappings: newMappings });
                            setHasChanges(true);
                          }}
                          placeholder="本地字段"
                        />
                        <span style={styles.fieldArrow}>→</span>
                        <input
                          style={styles.fieldInput}
                          value={mapping.platformField}
                          onChange={(e) => {
                            const newMappings = [...config.fieldMappings];
                            newMappings[index].platformField = e.target.value;
                            setConfig({ ...config, fieldMappings: newMappings });
                            setHasChanges(true);
                          }}
                          placeholder="平台字段"
                        />
                        {mapping.required && <span style={styles.badgeDanger}>必填</span>}
                      </div>
                    ))
                  ) : (
                    <div style={{ color: "#9ca3af", textAlign: "center", padding: "20px" }}>
                      暂无字段映射配置
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "rules" && (
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardTitle}>对账规则</div>
                <p style={{ fontSize: "14px", color: "#6b7280", marginTop: "4px" }}>
                  配置该平台的对账参数
                </p>
              </div>
              <div style={styles.cardContent}>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: "16px" }}>
                  <div>
                    <label style={styles.label}>金额容差 (元)</label>
                    <input
                      type="number"
                      style={styles.inputNumber}
                      value={config.tolerance}
                      onChange={(e) => {
                        setConfig({ ...config, tolerance: parseFloat(e.target.value) });
                        setHasChanges(true);
                      }}
                      step="0.01"
                      min={0}
                    />
                    <p style={styles.helpText}>金额差异小于此值时视为匹配成功</p>
                  </div>

                  <div>
                    <label style={styles.label}>同步间隔 (分钟)</label>
                    <input
                      type="number"
                      style={styles.inputNumber}
                      value={config.syncInterval}
                      onChange={(e) => {
                        setConfig({ ...config, syncInterval: parseInt(e.target.value) });
                        setHasChanges(true);
                      }}
                      min={5}
                      max={1440}
                    />
                    <p style={styles.helpText}>自动拉取账单的时间间隔，最小5分钟</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 底部操作栏 */}
      <div style={styles.actionBar}>
        <button style={styles.buttonOutline}>取消</button>
        <button
          style={{
            ...styles.buttonPrimary,
            ...(!hasChanges ? styles.buttonDisabled : {}),
          }}
          onClick={handleSave}
          disabled={!hasChanges || saving}
        >
          {saving ? "保存中..." : "保存配置"}
        </button>
      </div>
    </div>
  );
}

export default function PlatformsPage() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);

  // 加载平台列表
  useEffect(() => {
    const fetchPlatforms = async () => {
      try {
        setLoading(true);
        setError(null);
        const platforms = await platformApi.getList();

        if (platforms.length === 0) {
          alert('暂无平台数据，请联系管理员');
        } else {
          setPlatforms(platforms);
          if (!selectedPlatform) {
            setSelectedPlatform(platforms[0].id);
          }
        }
      } catch (err) {
        alert("加载平台失败：" + (err instanceof Error ? err.message : "未知错误"));
      } finally {
        setLoading(false);
      }
    };

    fetchPlatforms();
  }, []);

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.pageTitle}>平台配置</div>
        <div style={styles.pageSubtitle}>管理第三方配送平台配置</div>
        <div style={styles.loadingState}>
          <div>⏳ 加载中...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.page}>
        <div style={styles.pageTitle}>平台配置</div>
        <div style={styles.pageSubtitle}>管理第三方配送平台配置</div>
        <div style={styles.errorState}>
          <div>❌ {error}</div>
          <button
            onClick={() => window.location.reload()}
            style={{ ...styles.buttonPrimary, marginTop: "16px" }}
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={styles.pageTitle}>平台配置</h1>
        <p style={styles.pageSubtitle}>管理第三方配送平台配置</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px" }}>
        {/* 左侧平台列表 */}
        <div style={{ gridColumn: "span 1" }}>
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div style={styles.cardTitle}>
                <span>⚙️</span>
                配送平台
              </div>
            </div>
            <div style={styles.cardContent}>
              <PlatformList
                platforms={platforms}
                selectedId={selectedPlatform}
                onSelect={setSelectedPlatform}
              />
            </div>
          </div>
        </div>

        {/* 右侧详情面板 */}
        <div style={{ gridColumn: "span 2" }}>
          {selectedPlatform ? (
            <PlatformDetail platformId={selectedPlatform} />
          ) : (
            <div
              style={{
                ...styles.card,
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={styles.emptyState}>
                <span style={{ fontSize: "48px", marginBottom: "16px" }}>⚙️</span>
                <h3 style={styles.emptyTitle}>选择平台</h3>
                <p style={styles.emptyDesc}>请从左侧列表选择一个平台进行配置</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
