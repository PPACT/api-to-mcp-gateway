import { describe, it, expect, vi } from 'vitest';
import { createEmbeddingProvider } from '../llm.js';

describe('createEmbeddingProvider', () => {
  it('warns when it degrades to hash embeddings', () => {
    const warn = vi.fn();

    createEmbeddingProvider({ env: {}, warn });

    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]![0]);
    expect(line).toContain('OPENAI_API_KEY');
    expect(line).toContain('hash-based');
  });

  it('stays quiet when a key is present', () => {
    const warn = vi.fn();

    createEmbeddingProvider({ env: { OPENAI_API_KEY: 'sk-test' }, warn });

    expect(warn).not.toHaveBeenCalled();
  });

  it('still returns a deterministic embedder without a key', async () => {
    const embed = createEmbeddingProvider({ env: {}, warn: () => {} });

    const [first] = await embed(['hello world']);
    const [second] = await embed(['hello world']);

    expect(first).toHaveLength(128);
    expect(first).toEqual(second);
  });

  it('never prints the key value itself', () => {
    const warn = vi.fn();

    createEmbeddingProvider({ env: {}, warn });
    createEmbeddingProvider({ env: { OPENAI_API_KEY: 'sk-super-secret' }, warn });

    const printed = warn.mock.calls.map((c) => String(c[0])).join('\n');

    expect(printed).not.toContain('sk-super-secret');
  });
});
