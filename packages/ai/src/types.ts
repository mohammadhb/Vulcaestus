export type AiProviderKind =
  | 'OLLAMA'
  | 'OPENAI'
  | 'ANTHROPIC'
  | 'OPENROUTER'
  | 'OPENCODE'
  | 'CUSTOM_OPENAI';

export interface AiProviderConfig {
  kind: AiProviderKind;
  model: string;
  baseUrl?: string | null;
  apiKey?: string | null;
  timeoutMs?: number;
  settings?: Record<string, unknown>;
}

export interface AiRequest {
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}

export interface AiRawResult {
  text: string;
  model: string;
  latencyMs: number;
  usage?: Record<string, number>;
}

export interface AiProvider {
  readonly kind: AiProviderKind;
  readonly model: string;
  generate(request: AiRequest): Promise<AiRawResult>;
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'PROVIDER_ERROR'
      | 'PARSE_ERROR'
      | 'VALIDATION_ERROR'
      | 'TIMEOUT'
      | 'CONFIG_ERROR',
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export interface AiJsonResult<T> {
  data: T;
  raw: string;
  model: string;
  latencyMs: number;
}
