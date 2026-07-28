import type { ILLMBackend } from './types.js';

/**
 * Anthropic Claude backend via Anthropic API.
 * Requires ANTHROPIC_API_KEY env var.
 */
export function createAnthropicBackend(opts?: { model?: string; baseUrl?: string }): ILLMBackend {
  const model = opts?.model ?? 'claude-sonnet-4-20250514';
  const baseUrl = opts?.baseUrl ?? 'https://api.anthropic.com/v1/messages';

  return {
    async chat(params) {
      const apiKey = process.env['ANTHROPIC_API_KEY'];
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY not set');
      }

      const body = JSON.stringify({
        model,
        max_tokens: 1024,
        system: params.systemPrompt,
        messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
      });

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = (await res.json()) as {
        content: Array<{ type: string; text: string }>;
      };

      const text = data.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('');

      return { content: text };
    },
  };
}

/**
 * OpenAI-compatible backend.
 * Requires OPENAI_API_KEY env var, works with any OpenAI-compatible endpoint.
 */
export function createOpenAIBackend(opts?: { model?: string; baseUrl?: string }): ILLMBackend {
  const model = opts?.model ?? 'gpt-4o-mini';
  const baseUrl = opts?.baseUrl ?? 'https://api.openai.com/v1/chat/completions';

  return {
    async chat(params) {
      const apiKey = process.env['OPENAI_API_KEY'];
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY not set');
      }

      const body = JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: params.systemPrompt },
          ...params.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      });

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`OpenAI API error ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = (await res.json()) as {
        choices: Array<{ message: { content: string } }>;
      };

      return { content: data.choices[0]?.message?.content ?? '' };
    },
  };
}

/**
 * Auto-detect available LLM backend from environment.
 * Priority: Anthropic > OpenAI
 */
export function createLLMBackend(opts?: { model?: string }): ILLMBackend | null {
  if (process.env['ANTHROPIC_API_KEY']) {
    return createAnthropicBackend(opts);
  }
  if (process.env['OPENAI_API_KEY']) {
    return createOpenAIBackend(opts);
  }
  return null;
}
