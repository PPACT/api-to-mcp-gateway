import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthManager } from '../auth.js';

const ENV_VAR = 'API2MCP_TEST_TOKEN';
const TOKEN = 's3cret-token';

describe('AuthManager', () => {
  beforeEach(() => {
    process.env[ENV_VAR] = TOKEN;
  });

  afterEach(() => {
    delete process.env[ENV_VAR];
  });

  it('builds a Bearer header from the configured env var', () => {
    const auth = new AuthManager();
    auth.register('github', { type: 'bearer', envVar: ENV_VAR });

    expect(auth.getHeaders('github')).toEqual({ Authorization: `Bearer ${TOKEN}` });
  });

  it('honours a custom token prefix', () => {
    const auth = new AuthManager();
    auth.register('custom', { type: 'bearer', envVar: ENV_VAR, tokenPrefix: 'token ' });

    expect(auth.getHeaders('custom')).toEqual({ Authorization: `token ${TOKEN}` });
  });

  it('uses the configured header name for api_key auth', () => {
    const auth = new AuthManager();
    auth.register('notion', { type: 'api_key', envVar: ENV_VAR, headerName: 'X-Notion-Key' });

    expect(auth.getHeaders('notion')).toEqual({ 'X-Notion-Key': TOKEN });
  });

  it('returns no headers for an unregistered source', () => {
    const auth = new AuthManager();

    expect(auth.getHeaders('unknown')).toEqual({});
    expect(auth.hasAuth('unknown')).toBe(false);
  });

  it('returns no headers when the env var is not set', () => {
    delete process.env[ENV_VAR];
    const auth = new AuthManager();
    auth.register('github', { type: 'bearer', envVar: ENV_VAR });

    expect(auth.getHeaders('github')).toEqual({});
  });

  it('returns no headers for sources explicitly configured as "none"', () => {
    const auth = new AuthManager();
    auth.register('public', { type: 'none', envVar: ENV_VAR });

    expect(auth.getHeaders('public')).toEqual({});
    expect(auth.hasAuth('public')).toBe(false);
  });

  it('describe() lists configured sources without leaking token values', () => {
    const auth = new AuthManager();
    auth.register('github', { type: 'bearer', envVar: ENV_VAR });
    auth.register('public', { type: 'none', envVar: ENV_VAR });

    const described = auth.describe();

    expect(described).toEqual([{ source: 'github', type: 'bearer', envVar: ENV_VAR }]);
    expect(JSON.stringify(described)).not.toContain(TOKEN);
  });
});
