import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

export interface AppState {
  user: User | null;
  spaces: Space[];

  login: (user: Omit<User, 'isAuthenticated'>) => void;
  logout: () => void;

  createSpace: (space: Space) => void;
  deleteSpace: (id: string) => void;
  updateSpace: (id: string, updates: Partial<Space>) => void;
  toggleFavoriteSpace: (id: string) => void;

  addGovernanceLog: (spaceId: string, log: Omit<GovernanceLog, 'id' | 'timestamp'>) => void;
  addSecurityEvent: (spaceId: string, event: Omit<GovernanceLog, 'id' | 'timestamp'>) => void;
  addChatMessage: (spaceId: string, msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  saveTopology: (spaceId: string, nodes: any[], edges: any[]) => void;
  clearAllData: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      spaces: [],

      login: (userData) => set({ user: { ...userData, isAuthenticated: true } }),
      logout: () => set({ user: null, spaces: [] }),
      clearAllData: () => {
        localStorage.removeItem('sentinel-bi-state');
        set({ user: null, spaces: [] });
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
        set((state) => ({
          spaces: state.spaces.map(s => s.id === spaceId ? { ...s, topologyNodes: nodes, topologyEdges: edges } : s)
        }));
      }
    }),
    {
      name: 'sentinel-bi-state',
    }
  )
);
