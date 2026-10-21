import { AiError, type AiProvider, type AiProviderConfig, type AiRequest, type AiRawResult } from './types.js';

const DEFAULT_BASE_URLS: Record<string, string> = {
  OLLAMA: 'http://ollama:11434',
  OPENAI: 'https://api.openai.com/v1',
  ANTHROPIC: 'https://api.anthropic.com',
  OPENROUTER: 'https://openrouter.ai/api/v1',
  OPENCODE: 'https://opencode.ai/zen/v1',
  CUSTOM_OPENAI: '',
};

export function defaultBaseUrl(kind: string, explicit?: string | null): string {
  if (explicit && explicit.trim()) return explicit.replace(/\/+$/, '');
  return DEFAULT_BASE_URLS[kind] ?? '';
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AiError(`AI provider timed out after ${timeoutMs}ms`, 'TIMEOUT');
    }
    throw new AiError(`AI provider request failed: ${(error as Error).message}`, 'PROVIDER_ERROR');
  } finally {
    clearTimeout(timer);
  }
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) return String((part as { text: unknown }).text);
        return '';
      })
      .join('');
  }
  return '';
}

class OllamaProvider implements AiProvider {
  readonly kind = 'OLLAMA' as const;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: AiProviderConfig) {
    this.model = config.model;
    this.baseUrl = defaultBaseUrl('OLLAMA', config.baseUrl);
    this.timeoutMs = config.timeoutMs ?? 180_000;
  }

  async generate(request: AiRequest): Promise<AiRawResult> {
    const started = Date.now();
    const messages: Array<{ role: string; content: string }> = [];
    if (request.system) messages.push({ role: 'system', content: request.system });
    messages.push({ role: 'user', content: request.prompt });

    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/chat`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: false,
          format: request.json ? 'json' : undefined,
          options: {
            temperature: request.temperature ?? 0.2,
            num_predict: request.maxTokens ?? 3000,
            num_ctx: 8192,
          },
        }),
      },
      this.timeoutMs,
    );

    if (!response.ok) {
      throw new AiError(
        `Ollama returned ${response.status}: ${(await response.text()).slice(0, 500)}`,
        'PROVIDER_ERROR',
      );
    }
    const payload = (await response.json()) as {
      message?: { content?: string };
      eval_count?: number;
      prompt_eval_count?: number;
    };
    const text = payload.message?.content ?? '';
    if (!text.trim()) throw new AiError('Ollama returned an empty response', 'PROVIDER_ERROR');
    return {
      text,
      model: this.model,
      latencyMs: Date.now() - started,
      usage: {
        outputTokens: payload.eval_count ?? 0,
        inputTokens: payload.prompt_eval_count ?? 0,
      },
    };
  }
}

class OpenAiCompatibleProvider implements AiProvider {
  readonly kind: AiProviderConfig['kind'];
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly extraHeaders: Record<string, string>;
  private readonly supportsJsonMode: boolean;

  constructor(config: AiProviderConfig) {
    this.kind = config.kind;
    this.model = config.model;
    this.baseUrl = defaultBaseUrl(config.kind, config.baseUrl);
    this.apiKey = config.apiKey ?? '';
    this.timeoutMs = (config.settings?.timeoutMs as number | undefined) ?? 180_000;
    this.supportsJsonMode = (config.settings?.supportsJsonMode as boolean | undefined) ?? true;
    this.extraHeaders = (config.settings?.headers as Record<string, string> | undefined) ?? {};
    if (config.kind === 'OPENROUTER') {
      this.extraHeaders['HTTP-Referer'] ??= process.env.WEB_URL ?? 'http://localhost:3000';
      this.extraHeaders['X-Title'] ??= 'Vulcaestus';
    }
  }

  async generate(request: AiRequest): Promise<AiRawResult> {
    if (!this.baseUrl) {
      throw new AiError(`No base URL configured for ${this.kind}`, 'CONFIG_ERROR');
    }
    const started = Date.now();
    const messages: Array<{ role: string; content: string }> = [];
    if (request.system) messages.push({ role: 'system', content: request.system });
    messages.push({ role: 'user', content: request.prompt });

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 4096,
    };
    if (request.json && this.supportsJsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const doFetch = async (includeJsonMode: boolean) => {
      const requestBody = { ...body };
      if (!includeJsonMode) delete requestBody.response_format;
      return fetchWithTimeout(
        `${this.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
            ...this.extraHeaders,
          },
          body: JSON.stringify(requestBody),
        },
        this.timeoutMs,
      );
    };

    let response = await doFetch(Boolean(body.response_format));
    if (!response.ok && body.response_format) {
      const errorText = await response.text();
      if (/response_format|json mode/i.test(errorText)) {
        response = await doFetch(false);
      } else {
        throw new AiError(
          `${this.kind} returned ${response.status}: ${errorText.slice(0, 500)}`,
          'PROVIDER_ERROR',
        );
      }
    }
    if (!response.ok) {
      throw new AiError(
        `${this.kind} returned ${response.status}: ${(await response.text()).slice(0, 500)}`,
        'PROVIDER_ERROR',
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = textFromContent(payload.choices?.[0]?.message?.content);
    if (!text.trim()) throw new AiError(`${this.kind} returned an empty response`, 'PROVIDER_ERROR');
    return {
      text,
      model: this.model,
      latencyMs: Date.now() - started,
      usage: {
        inputTokens: payload.usage?.prompt_tokens ?? 0,
        outputTokens: payload.usage?.completion_tokens ?? 0,
      },
    };
  }
}

class AnthropicProvider implements AiProvider {
  readonly kind = 'ANTHROPIC' as const;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(config: AiProviderConfig) {
    this.model = config.model;
    this.baseUrl = defaultBaseUrl('ANTHROPIC', config.baseUrl);
    this.apiKey = config.apiKey ?? '';
    this.timeoutMs = (config.settings?.timeoutMs as number | undefined) ?? 180_000;
  }

  async generate(request: AiRequest): Promise<AiRawResult> {
    const started = Date.now();
    const response = await fetchWithTimeout(
      `${this.baseUrl}/v1/messages`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: request.maxTokens ?? 4096,
          temperature: request.temperature ?? 0.2,
          system: request.system,
          messages: [{ role: 'user', content: request.prompt }],
        }),
      },
      this.timeoutMs,
    );

    if (!response.ok) {
      throw new AiError(
        `Anthropic returned ${response.status}: ${(await response.text()).slice(0, 500)}`,
        'PROVIDER_ERROR',
      );
    }
    const payload = (await response.json()) as {
      content?: unknown;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = textFromContent(payload.content);
    if (!text.trim()) throw new AiError('Anthropic returned an empty response', 'PROVIDER_ERROR');
    return {
      text,
      model: this.model,
      latencyMs: Date.now() - started,
      usage: {
        inputTokens: payload.usage?.input_tokens ?? 0,
        outputTokens: payload.usage?.output_tokens ?? 0,
      },
    };
  }
}

export function createProvider(config: AiProviderConfig): AiProvider {
  switch (config.kind) {
    case 'OLLAMA':
      return new OllamaProvider(config);
    case 'ANTHROPIC':
      return new AnthropicProvider(config);
    case 'OPENAI':
    case 'OPENROUTER':
    case 'OPENCODE':
    case 'CUSTOM_OPENAI':
      return new OpenAiCompatibleProvider(config);
    default:
      throw new AiError(`Unsupported AI provider: ${String(config.kind)}`, 'CONFIG_ERROR');
  }
}
