import type { AuthConfig, AuthType } from '@api2mcp/core';

export class AuthManager {
  private configs: Map<string, AuthConfig> = new Map();

  /** Register auth config for a source (e.g. "github", "notion"). */
  register(sourceName: string, config: AuthConfig): void {
    this.configs.set(sourceName, config);
  }

  /** Resolve auth headers for a source by reading the configured env var. */
  getHeaders(sourceName: string): Record<string, string> {
    const config = this.configs.get(sourceName);
    if (!config || config.type === 'none') {
      return {};
    }

    const token = process.env[config.envVar];
    if (!token || token.length === 0) {
      return {};
    }

    return this.buildHeaders(config, token);
  }

  /** Check whether a source has auth configured. */
  hasAuth(sourceName: string): boolean {
    const config = this.configs.get(sourceName);
    return config !== undefined && config.type !== 'none';
  }

  /** Return configs without exposing token values. */
  describe(): Array<{ source: string; type: AuthType; envVar: string }> {
    return Array.from(this.configs.entries())
      .filter(([_, c]) => c.type !== 'none')
      .map(([source, c]) => ({ source, type: c.type, envVar: c.envVar }));
  }

  private buildHeaders(config: AuthConfig, token: string): Record<string, string> {
    switch (config.type) {
      case 'bearer':
        return {
          Authorization: (config.tokenPrefix ?? 'Bearer ') + token,
        };
      case 'api_key':
        return {
          [config.headerName ?? 'X-API-Key']: (config.tokenPrefix ?? '') + token,
        };
      case 'oauth2':
        return {
          Authorization: 'Bearer ' + token,
        };
      default:
        return {};
    }
  }
}
