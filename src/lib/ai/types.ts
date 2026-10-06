export type ProviderId =
  | 'gemini'
  | 'openrouter'
  | 'openai'
  | 'groq'
  | 'together'
  | 'deepseek'
  | 'mistral'
  | 'ollama'
  | 'lmstudio'
  | 'custom';

export interface ProviderDefinition {
  id: ProviderId;
  label: string;
  description: string;
  defaultBaseUrl: string;
  defaultModel: string;
  envKey: string;
  supportsModelList: boolean;
  requiresApiKey: boolean;
  compatible: 'gemini' | 'openai';
  extraHeaders?: Record<string, string>;
  curatedModels: { id: string; label: string }[];
}

export interface ProviderConfig {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  apiKey: string;
  stream: boolean;
}

export interface ResolvedProviderConfig {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  apiKey: string;
  stream: boolean;
  compatible: 'gemini' | 'openai';
  extraHeaders: Record<string, string>;
  source: {
    baseUrl: 'user' | 'provider' | 'env';
    model: 'user' | 'provider' | 'env';
    apiKey: 'user' | 'env' | 'none';
  };
}

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateRequest {
  provider?: ProviderId;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  stream?: boolean;
  json?: boolean;
  contents?: unknown;
  messages?: ChatTurn[];
  temperature?: number;
  maxTokens?: number;
}

export interface ModelInfo {
  id: string;
  label: string;
  ownedBy?: string;
  structuredOutputs?: boolean;
}

export class AIProviderError extends Error {
  status: number;
  code: string;
  provider: string;
  retryable: boolean;

  constructor(opts: { message: string; status?: number; code?: string; provider?: string; retryable?: boolean }) {
    super(opts.message);
    this.name = 'AIProviderError';
    this.status = opts.status ?? 500;
    this.code = opts.code ?? 'provider_error';
    this.provider = opts.provider ?? 'unknown';
    this.retryable = opts.retryable ?? false;
  }
}
