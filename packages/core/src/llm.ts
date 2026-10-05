import type { ILLMBackend, LLMToolDef } from './types.js';

/**
 * Anthropic Claude backend with tool-use support.
 * Requires ANTHROPIC_API_KEY env var.
 */
export function createAnthropicBackend(opts?: { model?: string; baseUrl?: string }): ILLMBackend {
  const model = opts?.model ?? 'claude-sonnet-4-20250514';
  const baseUrl = opts?.baseUrl ?? 'https://api.anthropic.com/v1/messages';

  return {
    async chat(params) {
      const apiKey = process.env['ANTHROPIC_API_KEY'];
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

      const requestBody: Record<string, unknown> = {
        model,
        max_tokens: 4096,
        system: params.systemPrompt,
        messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
      };

      if (params.tools && params.tools.length > 0) {
        requestBody['tools'] = params.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema,
        }));
      }

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = (await res.json()) as {
        content: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>;
        stop_reason?: string;
      };

      const text = data.content
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text!)
        .join('');

      const toolBlocks = data.content.filter((c) => c.type === 'tool_use');
      const toolCalls = toolBlocks.map((t) => ({
        name: t.name ?? '',
        arguments: t.input ?? {},
      }));

      return { content: text, toolCalls };
    },
  };
}

/**
 * OpenAI-compatible backend with function-calling support.
 */
export function createOpenAIBackend(opts?: { model?: string; baseUrl?: string }): ILLMBackend {
  const model = opts?.model ?? 'gpt-4o-mini';
  const baseUrl = opts?.baseUrl ?? 'https://api.openai.com/v1/chat/completions';

  return {
    async chat(params) {
      const apiKey = process.env['OPENAI_API_KEY'];
      if (!apiKey) throw new Error('OPENAI_API_KEY not set');

      const requestBody: Record<string, unknown> = {
        model,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: params.systemPrompt },
          ...params.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      };

      if (params.tools && params.tools.length > 0) {
        requestBody['tools'] = params.tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.inputSchema },
        }));
      }

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`OpenAI API error ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = (await res.json()) as {
        choices: Array<{
          message: {
            content: string | null;
            tool_calls?: Array<{ function: { name: string; arguments: string } }>;
          };
        }>;
      };

      const msg = data.choices[0]?.message;
      const toolCalls = (msg?.tool_calls ?? []).map((tc) => {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments); } catch { /* ignore */ }
        return { name: tc.function.name, arguments: args };
      });

      return { content: msg?.content ?? '', toolCalls };
    },
  };
}

/**
 * Auto-detect available LLM backend from environment.
 */
export function createLLMBackend(opts?: { model?: string }): ILLMBackend | null {
  if (process.env['ANTHROPIC_API_KEY']) return createAnthropicBackend(opts);
  if (process.env['OPENAI_API_KEY']) return createOpenAIBackend(opts);
  return null;
}

export interface EmbeddingProviderOptions {
  env?: NodeJS.ProcessEnv;
  /** Override the warning sink (tests inject a spy here). */
  warn?: (line: string) => void;
}

/**
 * Create an embedding function. Uses OpenAI text-embedding-3-small when
 * OPENAI_API_KEY is set, otherwise falls back to a simple hash-based embedding
 * (deterministic but low quality — suitable for demos).
 *
 * ⚠️ The fallback still applies — demos and tests rely on it — but it now
 * announces itself on stderr instead of degrading silently.
 */
export function createEmbeddingProvider(
  options: EmbeddingProviderOptions = {},
): (texts: string[]) => Promise<number[][]> {
  const env = options.env ?? process.env;
  const apiKey = env['OPENAI_API_KEY'];

  if (apiKey) {
    const model = 'text-embedding-3-small';
    const baseUrl = env['OPENAI_EMBEDDING_URL'] ?? 'https://api.openai.com/v1/embeddings';

    return async (texts: string[]) => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, input: texts }),
      });
      if (!res.ok) throw new Error(`OpenAI embedding error ${res.status}`);
      const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
      return data.data.map((d) => d.embedding);
    };
  }

  // Fallback: simple hash embedding (128-dim, deterministic).
  // Kept deliberately — but it must not be silent, or callers mistake it for
  // real semantic search and read retrieval noise as signal.
  const warn = options.warn ?? ((line: string) => { process.stderr.write(line); });
  warn(
    'Warning: OPENAI_API_KEY is not set — RAG falls back to hash-based embeddings.\n' +
    '         They are deterministic but carry no semantics, so retrieval quality is poor.\n' +
    '         Set OPENAI_API_KEY for real semantic search.\n',
  );

  return async (texts: string[]) => texts.map((t) => hashEmbed(t, 128));
}

function hashEmbed(text: string, dims: number): number[] {
  const emb = new Array<number>(dims).fill(0);
  for (let i = 0; i < text.length; i++) {
    emb[(text.charCodeAt(i) * 31 + i * 7) % dims]! += 1;
  }
  const norm = Math.sqrt(emb.reduce((s, v) => s + v * v, 0));
  if (norm > 0) for (let i = 0; i < dims; i++) emb[i] = emb[i]! / norm;
  return emb;
}
