import { describe, it, expect, vi, afterEach } from 'vitest';
import { AuthManager } from '@api2mcp/server';
import {
  autoDetectAuth,
  missingAuthWarning,
  applyAutoDetectAuth,
} from '../auth-detect.js';

const ENV_VAR = 'GITHUB_TOKEN';
const TOKEN = 'gh-token-value';

/** An env object with no credential variables set, independent of the machine. */
function emptyEnv(): NodeJS.ProcessEnv {
  return {};
}

describe('autoDetectAuth', () => {
  afterEach(() => {
    delete process.env[ENV_VAR];
  });

  it('registers bearer auth when the credential is present', () => {
    process.env[ENV_VAR] = TOKEN;
    const auth = new AuthManager();

    const result = autoDetectAuth(auth, 'github');

    expect(result).toEqual({ detected: true, envVar: ENV_VAR });
    expect(auth.getHeaders('github')).toEqual({ Authorization: `Bearer ${TOKEN}` });
  });

  it('reports which env var it looked for when the credential is missing', () => {
    const auth = new AuthManager();

    const result = autoDetectAuth(auth, 'github', emptyEnv());

    expect(result).toEqual({ detected: false, envVar: ENV_VAR });
    expect(auth.hasAuth('github')).toBe(false);
  });

  it('reports no env var at all for a source it does not recognise', () => {
    const auth = new AuthManager();

    const result = autoDetectAuth(auth, 'acme-internal', emptyEnv());

    expect(result.detected).toBe(false);
    expect(result.envVar).toBeUndefined();
    expect(auth.hasAuth('acme-internal')).toBe(false);
  });

  it('keeps scanning past a known source whose credential is unset', () => {
    // "github-notion" matches github first; with GITHUB_TOKEN unset the loop
    // must fall through to notion — registering on the first *set* var.
    const auth = new AuthManager();

    const result = autoDetectAuth(auth, 'github-notion', { NOTION_API_KEY: 'notion-token' });

    expect(result).toEqual({ detected: true, envVar: 'NOTION_API_KEY' });
  });
});

describe('missingAuthWarning', () => {
  it('returns null once auth was detected', () => {
    expect(missingAuthWarning('github', { detected: true, envVar: ENV_VAR })).toBeNull();
  });

  it('names the missing env var for a known source', () => {
    const warning = missingAuthWarning('github', { detected: false, envVar: ENV_VAR });

    expect(warning).toContain(`${ENV_VAR} is not set`);
    expect(warning).toContain('WITHOUT credentials');
  });

  it('says the source is unrecognised when no env var is known', () => {
    const warning = missingAuthWarning('acme-internal', { detected: false });

    expect(warning).toContain('no credential env var is known');
    expect(warning).toContain('WITHOUT credentials');
  });
});

describe('applyAutoDetectAuth', () => {
  it('warns, naming the env var, when a known source has no credential', () => {
    const auth = new AuthManager();
    const warn = vi.fn();

    applyAutoDetectAuth(auth, 'github', { env: emptyEnv(), warn });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain(ENV_VAR);
  });

  it('warns for an unrecognised source instead of forwarding silently', () => {
    const auth = new AuthManager();
    const warn = vi.fn();

    applyAutoDetectAuth(auth, 'acme-internal', { env: emptyEnv(), warn });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('acme-internal');
  });

  it('stays quiet when the credential is present', () => {
    const auth = new AuthManager();
    const warn = vi.fn();

    const result = applyAutoDetectAuth(auth, 'github', {
      env: { [ENV_VAR]: TOKEN },
      warn,
    });

    expect(result.detected).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('never prints the secret value itself', () => {
    const auth = new AuthManager();
    const warn = vi.fn();

    // Register a real token, then push a source that has none.
    applyAutoDetectAuth(auth, 'github', { env: { [ENV_VAR]: TOKEN }, warn });
    applyAutoDetectAuth(auth, 'acme-internal', { env: emptyEnv(), warn });

    const printed = warn.mock.calls.map((c) => String(c[0])).join('\n');

    expect(printed).not.toContain(TOKEN);
    expect(printed).not.toContain('Bearer');
  });
});
