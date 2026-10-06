import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DashboardSpec, SavedDashboard } from '../lib/dashboard/types';
import type { ProviderConfig, ProviderId } from '../lib/ai/types';
import { DEFAULT_AI_SETTINGS } from '../lib/ai/client';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Analyst' | 'Security Officer' | 'Viewer';
  isAuthenticated: boolean;
}

export interface GovernanceLog {
  id: string;
  timestamp: string;
  agentId: string;
  agentName: string;
  action: string;
  riskScore: number;
  status: 'allowed' | 'blocked' | 'flagged';
  details: string;
  promptExposed?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
  agentName?: string;
  confidenceScore?: number;
  metadata?: any;
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface VisualInsight {
  id?: string;
  title?: string;
  description?: string;
  type?: string;
  metric?: string;
  trend?: string;
  value?: string | number;
  kpis?: { label: string; value: string | number; trend?: string }[];
  charts?: { title: string; type: string; xAxisField: string; yAxisField: string; color?: string }[];
}

export interface Space {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  isFavorite: boolean;
  uploadedFiles: UploadedFile[];
  parsedData: any[];
  columns: { name: string; type: 'numeric' | 'categorical' | 'date' | 'boolean' }[];
  aiSummary: string;
  governanceLogs: GovernanceLog[];
  securityEvents: any[];
  chatMessages: ChatMessage[];
  topologyNodes: any[];
  topologyEdges: any[];
  visualInsights: VisualInsight[];
  dashboardSpec?: DashboardSpec;
  savedDashboards?: SavedDashboard[];
  activeDashboardId?: string;
  globalFilters?: { field: string; op: string; value: string }[];
  generationRuns?: {
    at: string;
    source: 'ai' | 'fallback';
    model?: string;
    provider?: string;
    keySource?: 'user' | 'env' | 'none';
    fallbackReason?: string;
    attempts?: { step: string; status?: number; ms: number; error?: string; model?: string; keySource?: 'user' | 'env' | 'none' }[];
  }[];
  topologyLayout?: Record<string, { x: number; y: number }>;
  
  // Execution Context
  executionState: 'idle' | 'running' | 'completed';
  generatedCode: string;
  executionTimeline: { id: string; agent: string; action: string; status: 'pending' | 'running' | 'success' | 'failed'; timestamp: string; details?: string }[];
  datasets: { 
    id: string; 
    name: string; 
    type: string; 
    data: any[]; 
    columns: { name: string; type: string; role?: string }[];
    semanticRole: 'fact' | 'dimension' | 'lookup' | 'staging' | 'derived';
    refreshStatus: 'pending' | 'success' | 'failed';
    versionNumber: number;
    lastSyncTimestamp: string;
    relationshipCandidates: string[];
    embeddingsRecomputed: boolean;
    qualityScore: number;
  }[];
  promptContext: string;
  // Executive Reporting
  executiveReport?: {
    summary: string;
    datasetOverview: string;
    kpiAnalysis: string;
    trends: string;
    anomalies: string;
    segments: string;
    forecasts: string;
    recommendations: string;
    governance: string;
    source?: 'ai' | 'fallback';
    fallbackReason?: string;
    error?: string;
    generatedBy?: string;
    generatedAt?: string;
    markdown?: string;
  };
  // Policies Engine Configuration
  policies?: {
    securityLevel: 'Standard' | 'Strict' | 'Zero-Trust';
    piiRedaction: boolean;
    requireHumanReviewThreshold: number; // 0-100 risk score
    maxExportRows: number;
    allowExecutiveExport: boolean;
    allowDatasetJoins?: boolean;
    forbiddenActions?: string;
    writerGuidelines?: string;
  };
}

export interface AppAppearance {
  mode: 'light' | 'dark';
}

export interface AppState {
  user: User | null;
  spaces: Space[];
  appearance: AppAppearance;
  aiSettings: ProviderConfig;

  login: (user: Omit<User, 'isAuthenticated'>) => void;
  logout: () => void;
  setAppearance: (appearance: AppAppearance) => void;
  setAiSettings: (settings: Partial<ProviderConfig> & { provider?: ProviderId }) => void;

  createSpace: (space: Space) => void;
  deleteSpace: (id: string) => void;
  updateSpace: (id: string, updates: Partial<Space>) => void;
  toggleFavoriteSpace: (id: string) => void;
  saveDashboard: (spaceId: string, name: string, spec: DashboardSpec) => void;
  applySavedDashboard: (spaceId: string, dashboardId: string) => void;
  deleteSavedDashboard: (spaceId: string, dashboardId: string) => void;

  addGovernanceLog: (spaceId: string, log: Omit<GovernanceLog, 'id' | 'timestamp'>) => void;
  addSecurityEvent: (spaceId: string, event: Omit<GovernanceLog, 'id' | 'timestamp'>) => void;
  addChatMessage: (spaceId: string, msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  saveTopology: (spaceId: string, nodes: any[], edges: any[]) => void;
  saveTopologyLayout: (spaceId: string, layout: Record<string, { x: number; y: number }>) => void;
  clearAllData: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      spaces: [],
      appearance: { mode: 'light' },
      aiSettings: { ...DEFAULT_AI_SETTINGS },

      login: (userData) => set({ user: { ...userData, isAuthenticated: true } }),
      logout: () => set({ user: null }),
      setAppearance: (appearance) => set({ appearance }),
      setAiSettings: (settings) => set((state) => ({ aiSettings: { ...state.aiSettings, ...settings } })),
      clearAllData: () => {
        localStorage.removeItem('sentinel-bi-state');
        localStorage.removeItem('sentinel_ai_settings');
        localStorage.removeItem('sentinel_api_key');
        set({ user: null, spaces: [], aiSettings: { ...DEFAULT_AI_SETTINGS }, appearance: { mode: 'light' } });
      },

      createSpace: (space) => set((state) => ({ spaces: [space, ...state.spaces] })),
      deleteSpace: (id) => set((state) => ({ spaces: state.spaces.filter(s => s.id !== id) })),
      updateSpace: (id, updates) => set((state) => ({
        spaces: state.spaces.map(s => s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s)
      })),
      toggleFavoriteSpace: (id) => set((state) => ({
        spaces: state.spaces.map(s => s.id === id ? { ...s, isFavorite: !s.isFavorite } : s)
      })),

      addGovernanceLog: (spaceId, log) => {
        const state = get();
        const space = state.spaces.find(s => s.id === spaceId);
        if (!space) return;
        const newLog: GovernanceLog = {
          ...log,
          id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString(),
        };
        set({
          spaces: state.spaces.map(s => s.id === spaceId ? { ...s, governanceLogs: [newLog, ...s.governanceLogs] } : s)
        });
      },
      
      addSecurityEvent: (spaceId, event) => {
        const state = get();
        const space = state.spaces.find(s => s.id === spaceId);
        if (!space) return;
        const newEvent = {
          ...event,
          id: `sec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString(),
        };
        set({
          spaces: state.spaces.map(s => s.id === spaceId ? { ...s, securityEvents: [newEvent, ...s.securityEvents] } : s)
        });
      },

      addChatMessage: (spaceId, msg) => {
        const state = get();
        const space = state.spaces.find(s => s.id === spaceId);
        if (!space) return;
        const newMsg: ChatMessage = {
          ...msg,
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString(),
        };
        set({
          spaces: state.spaces.map(s => s.id === spaceId ? { ...s, chatMessages: [...s.chatMessages, newMsg] } : s)
        });
      },

      saveTopology: (spaceId, nodes, edges) => {
        const layout: Record<string, { x: number; y: number }> = {};
        (nodes || []).forEach((node: { id?: string; position?: { x: number; y: number } }) => {
          if (node?.id && node.position) layout[node.id] = node.position;
        });
        set((state) => ({
          spaces: state.spaces.map(s => s.id === spaceId ? { ...s, topologyNodes: nodes, topologyEdges: edges, topologyLayout: { ...(s.topologyLayout || {}), ...layout } } : s)
        }));
      },
      saveTopologyLayout: (spaceId, layout) => {
        set((state) => ({
          spaces: state.spaces.map((s) => s.id === spaceId ? { ...s, topologyLayout: layout } : s),
        }));
      },

      saveDashboard: (spaceId, name, spec) => {
        const now = new Date().toISOString();
        const saved: SavedDashboard = {
          id: `dash-${Date.now()}`,
          name,
          spec,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          spaces: state.spaces.map((s) =>
            s.id === spaceId
              ? {
                  ...s,
                  savedDashboards: [saved, ...(s.savedDashboards || [])],
                  activeDashboardId: saved.id,
                  dashboardSpec: spec,
                  updatedAt: now,
                }
              : s,
          ),
        }));
      },

      applySavedDashboard: (spaceId, dashboardId) => {
        set((state) => ({
          spaces: state.spaces.map((s) => {
            if (s.id !== spaceId) return s;
            const found = (s.savedDashboards || []).find((d) => d.id === dashboardId);
            if (!found) return s;
            return {
              ...s,
              activeDashboardId: dashboardId,
              dashboardSpec: found.spec,
              visualInsights: [found.spec as unknown as VisualInsight],
              generatedCode: JSON.stringify(found.spec, null, 2),
              updatedAt: new Date().toISOString(),
            };
          }),
        }));
      },

      deleteSavedDashboard: (spaceId, dashboardId) => {
        set((state) => ({
          spaces: state.spaces.map((s) =>
            s.id === spaceId
              ? { ...s, savedDashboards: (s.savedDashboards || []).filter((d) => d.id !== dashboardId) }
              : s,
          ),
        }));
      },
    }),
    {
      name: 'sentinel-bi-state',
    }
  )
);
