import { read as readStore } from './storage/store';
import { getSecret } from './storage/secrets';
import { PROVIDERS, isProviderId } from './llm/providerRegistry';

export type ApiServiceId = 'brain' | 'tts' | 'stt' | 'realtime';

export interface ApiStatusResult {
  service: ApiServiceId;
  connected: boolean;
  provider: string;
  model: string;
  endpoint: string;
  latencyMs?: number;
  detail: string;
  test: string;
}

type Probe = {
  provider: string;
  model: string;
  endpoint: string;
  key?: string | null;
  url: string;
  headers?: Record<string, string>;
  test: string;
};

function host(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}

function configuredModel(settings: Awaited<ReturnType<typeof readStore>>): string {
  const id = settings.llmProvider ?? 'groq';
  const info = isProviderId(id) ? PROVIDERS[id] : PROVIDERS.groq;
  return settings.llmModel?.trim() || info.defaultModel;
}

async function brainProbe(): Promise<Probe> {
  const settings = await readStore();
  const id = isProviderId(settings.llmProvider ?? '') ? settings.llmProvider : 'groq';
  const model = configuredModel(settings);
  if (id === 'groq') {
    const key = (await getSecret('groq_api_key')) || process.env.GROQ_API_KEY || null;
    return { provider: 'Groq', model, endpoint: 'https://api.groq.com/openai/v1', key, url: 'https://api.groq.com/openai/v1/models', headers: key ? { Authorization: `Bearer ${key}` } : undefined, test: 'GET /models' };
  }
  if (id === 'openrouter') {
    const key = await getSecret('openrouter_api_key');
    return { provider: 'OpenRouter', model, endpoint: 'https://openrouter.ai/api/v1', key, url: 'https://openrouter.ai/api/v1/models', headers: key ? { Authorization: `Bearer ${key}` } : undefined, test: 'GET /models' };
  }
  if (id === 'ollama') {
    const endpoint = (settings.ollamaEndpoint || 'http://localhost:11434/api').replace(/\/+$/, '');
    return { provider: 'Ollama (local)', model, endpoint, url: `${endpoint}/tags`, test: 'GET /tags' };
  }
  if (id === 'minimax') {
    const key = await getSecret('minimax_api_key');
    const endpoint = 'https://api.minimaxi.com/v1';
    return { provider: 'MiniMax', model, endpoint, key, url: `${endpoint}/models`, headers: key ? { Authorization: `Bearer ${key}` } : undefined, test: 'GET /models' };
  }
  const key = await getSecret('hermes_api_key');
  const endpoint = (settings.hermesEndpoint || '').replace(/\/+$/, '');
  return { provider: 'Hermes Agent', model, endpoint, key, url: `${endpoint}/models`, headers: key ? { Authorization: `Bearer ${key}` } : undefined, test: 'GET /models' };
}

async function probe(p: Probe, service: ApiServiceId): Promise<ApiStatusResult> {
  if (!p.endpoint || (p.key === null && service !== 'realtime')) {
    return { service, connected: false, provider: p.provider, model: p.model, endpoint: p.endpoint || 'not configured', detail: 'API key or endpoint is not configured', test: p.test };
  }
  const started = Date.now();
  try {
    const res = await fetch(p.url, { method: 'GET', headers: p.headers, signal: AbortSignal.timeout(8000) });
    const latencyMs = Date.now() - started;
    const body = await res.text().catch(() => '');
    if (!res.ok) {
      return { service, connected: false, provider: p.provider, model: p.model, endpoint: p.endpoint, latencyMs, detail: `HTTP ${res.status}${body ? `: ${body.slice(0, 180)}` : ''}`, test: p.test };
    }
    let modelAvailable = true;
    try {
      const json = JSON.parse(body) as { data?: Array<{ id?: string }>; models?: Array<{ name?: string }> };
      const ids = [...(json.data ?? []).map(x => x.id).filter(Boolean) as string[], ...(json.models ?? []).map(x => x.name).filter(Boolean) as string[]];
      if (ids.length && service === 'brain') modelAvailable = ids.includes(p.model);
    } catch { /* endpoint connectivity is still valid */ }
    return {
      service, connected: modelAvailable, provider: p.provider, model: p.model, endpoint: p.endpoint, latencyMs,
      detail: modelAvailable ? 'Provider reachable; configured model is available' : 'Provider reachable, but configured model was not found',
      test: p.test,
    };
  } catch (err) {
    return { service, connected: false, provider: p.provider, model: p.model, endpoint: p.endpoint, latencyMs: Date.now() - started, detail: err instanceof Error ? err.message : String(err), test: p.test };
  }
}

export async function testApiService(service: ApiServiceId): Promise<ApiStatusResult> {
  if (service === 'brain') return probe(await brainProbe(), service);

  const settings = await readStore();
  if (service === 'stt') {
    const key = (await getSecret('groq_api_key')) || process.env.GROQ_API_KEY || null;
    return probe({ provider: 'Groq', model: 'whisper-large-v3-turbo', endpoint: 'https://api.groq.com/openai/v1', key, url: 'https://api.groq.com/openai/v1/models', headers: key ? { Authorization: `Bearer ${key}` } : undefined, test: 'GET /models (STT provider/key)' }, service);
  }

  if (service === 'tts') {
    const engine = settings.voiceEngine ?? 'off';
    if (engine === 'groq') {
      const key = (await getSecret('groq_api_key')) || process.env.GROQ_API_KEY || null;
      return probe({ provider: 'Groq', model: 'canopylabs/orpheus-v1-english', endpoint: 'https://api.groq.com/openai/v1/audio/speech', key, url: 'https://api.groq.com/openai/v1/models', headers: key ? { Authorization: `Bearer ${key}` } : undefined, test: 'GET /models (TTS provider/key)' }, service);
    }
    if (engine === 'openrouter') {
      const key = await getSecret('openrouter_api_key');
      return probe({ provider: 'OpenRouter', model: 'openai/gpt-4o-mini-tts-2025-12-15', endpoint: 'https://openrouter.ai/api/v1/audio/speech', key, url: 'https://openrouter.ai/api/v1/models', headers: key ? { Authorization: `Bearer ${key}` } : undefined, test: 'GET /models (TTS provider/key)' }, service);
    }
    if (engine === 'elevenlabs') {
      const key = await getSecret('elevenlabs_api_key');
      return probe({ provider: 'ElevenLabs', model: 'eleven_turbo_v2_5', endpoint: 'https://api.elevenlabs.io/v1/text-to-speech', key, url: 'https://api.elevenlabs.io/v1/user', headers: key ? { 'xi-api-key': key } : undefined, test: 'GET /user' }, service);
    }
    if (engine === 'edge') return { service, connected: true, provider: 'Microsoft Edge TTS', model: settings.voiceName || 'default neural voice', endpoint: 'Microsoft Edge TTS service', detail: 'Configured local Edge TTS path; no API key', test: 'configuration check' };
    if (engine === 'sapi') return { service, connected: true, provider: 'Windows SAPI', model: settings.voiceName || 'Windows voice', endpoint: 'Local Windows Speech API', detail: 'Local/offline engine; no API connection', test: 'configuration check' };
    return { service, connected: false, provider: 'None', model: '—', endpoint: '—', detail: 'TTS is disabled', test: 'configuration check' };
  }

  return { service: 'realtime', connected: false, provider: 'Not configured', model: '—', endpoint: '—', detail: 'No Realtime API runtime is configured in this Saeedoo build', test: 'runtime route check' };
}

export async function testAllApiServices(): Promise<ApiStatusResult[]> {
  return Promise.all((['brain', 'tts', 'stt', 'realtime'] as ApiServiceId[]).map(testApiService));
}

export function endpointHost(url: string): string { return host(url); }
