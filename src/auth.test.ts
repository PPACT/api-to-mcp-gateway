import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthManager } from '../packages/server/src/auth.js';

describe('AuthManager', () => {
  let auth: AuthManager;

  beforeEach(() => {
    auth = new AuthManager();
    process.env.TEST_API_KEY = 'sk-test-123';
    process.env.TEST_BEARER = 'bearer-token-abc';
  });

  afterEach(() => {
    delete process.env.TEST_API_KEY;
    delete process.env.TEST_BEARER;
  });

  it('returns empty headers when no auth registered', () => {
    expect(auth.getHeaders('unknown')).toEqual({});
  });

  it('returns empty headers for "none" auth type', () => {
    auth.register('none-api', { type: 'none', envVar: 'NOT_SET' });
    expect(auth.getHeaders('none-api')).toEqual({});
  });

  it('injects API Key header with default header name', () => {
    auth.register('test-api', { type: 'api_key', envVar: 'TEST_API_KEY' });
    const headers = auth.getHeaders('test-api');
    expect(headers['X-API-Key']).toBe('sk-test-123');
  });

  it('injects API Key header with custom header name', () => {
    auth.register('custom-api', {
      type: 'api_key',
      envVar: 'TEST_API_KEY',
      headerName: 'X-Custom-Key',
    });
    const headers = auth.getHeaders('custom-api');
    expect(headers['X-Custom-Key']).toBe('sk-test-123');
  });

  it('injects Bearer token with default prefix', () => {
    auth.register('bearer-api', { type: 'bearer', envVar: 'TEST_BEARER' });
    const headers = auth.getHeaders('bearer-api');
    expect(headers['Authorization']).toBe('Bearer bearer-token-abc');
  });

  it('injects Bearer token with custom prefix', () => {
    auth.register('custom-bearer', {
      type: 'bearer',
      envVar: 'TEST_BEARER',
      tokenPrefix: 'Token ',
    });
    const headers = auth.getHeaders('custom-bearer');
    expect(headers['Authorization']).toBe('Token bearer-token-abc');
  });

  it('injects API Key with custom prefix', () => {
    auth.register('prefixed-key', {
      type: 'api_key',
      envVar: 'TEST_API_KEY',
      headerName: 'Authorization',
      tokenPrefix: 'ApiKey ',
    });
    const headers = auth.getHeaders('prefixed-key');
    expect(headers['Authorization']).toBe('ApiKey sk-test-123');
  });

  it('supports oauth2 type', () => {
    auth.register('oauth-api', { type: 'oauth2', envVar: 'TEST_BEARER' });
    const headers = auth.getHeaders('oauth-api');
    expect(headers['Authorization']).toBe('Bearer bearer-token-abc');
  });

  it('returns empty headers when env var is not set', () => {
    auth.register('missing-api', { type: 'api_key', envVar: 'NONEXISTENT_VAR' });
    const headers = auth.getHeaders('missing-api');
    expect(headers).toEqual({});
  });

  it('hasAuth returns false for unregistered source', () => {
    expect(auth.hasAuth('nobody')).toBe(false);
  });

  it('hasAuth returns false for "none" auth', () => {
    auth.register('none-api', { type: 'none', envVar: 'X' });
    expect(auth.hasAuth('none-api')).toBe(false);
  });

  it('hasAuth returns true for api_key', () => {
    auth.register('my-api', { type: 'api_key', envVar: 'TEST_API_KEY' });
    expect(auth.hasAuth('my-api')).toBe(true);
  });

  it('describe does not expose token values', () => {
    auth.register('safe-api', { type: 'bearer', envVar: 'TEST_BEARER' });
    auth.register('none-api', { type: 'none', envVar: 'IGNORED' });
    const desc = auth.describe();
    expect(desc).toHaveLength(1);
    expect(desc[0]!.source).toBe('safe-api');
    expect(desc[0]!.type).toBe('bearer');
    expect(desc[0]!.envVar).toBe('TEST_BEARER');
    // No token value in description
    expect(JSON.stringify(desc)).not.toContain('bearer-token-abc');
  });

  it('multiple sources can coexist with different auth types', () => {
    auth.register('github', { type: 'bearer', envVar: 'TEST_BEARER' });
    auth.register('notion', { type: 'api_key', envVar: 'TEST_API_KEY', headerName: 'Notion-Version' });

    const ghHeaders = auth.getHeaders('github');
    const notionHeaders = auth.getHeaders('notion');

    expect(ghHeaders['Authorization']).toBe('Bearer bearer-token-abc');
    expect(notionHeaders['Notion-Version']).toBe('sk-test-123');
    // Keys don't leak across sources
    expect(notionHeaders['Authorization']).toBeUndefined();
    expect(ghHeaders['Notion-Version']).toBeUndefined();
  });
});
