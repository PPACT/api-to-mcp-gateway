import type { AuthManager } from '@api2mcp/server';

/**
 * Where to look for a source's credential, keyed by a substring of the source
 * name.
 *
 * ⚠️ This list is deliberately short. Anything outside it — or anything inside
 * it whose env var is unset — gets forwarded WITHOUT credentials, which is why
 * the caller must warn instead of staying silent.
 */
export const KNOWN_AUTH_ENV_VARS: Record<string, string> = {
  github: 'GITHUB_TOKEN',
  notion: 'NOTION_API_KEY',
  feishu: 'FEISHU_APP_TOKEN',
  wechat: 'WECHAT_TOKEN',
  slack: 'SLACK_TOKEN',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

export interface AuthDetection {
  /** True when a credential was found and registered. */
  detected: boolean;
  /** The env var consulted, when the source name matched a known one. */
  envVar?: string;
}

/**
 * Register bearer auth for `sourceName` when its credential is present in the
 * environment.
 *
 * Registration order is unchanged from the original inline loop: the first
 * known source whose env var is actually set wins.
 */
export function autoDetectAuth(
  auth: AuthManager,
  sourceName: string,
  env: NodeJS.ProcessEnv = process.env,
): AuthDetection {
  const normalized = sourceName.toLowerCase();
  let expectedEnvVar: string | undefined;

  for (const [key, envVar] of Object.entries(KNOWN_AUTH_ENV_VARS)) {
    if (!normalized.includes(key)) continue;
    expectedEnvVar ??= envVar;
    if (env[envVar]) {
      auth.register(sourceName, { type: 'bearer', envVar });
      return { detected: true, envVar };
    }
  }

  return { detected: false, envVar: expectedEnvVar };
}

/**
 * The warning to print when `sourceName` is about to be forwarded without
 * credentials, or `null` when auth was detected.
 *
 * ⚠️ Never includes a secret value — only the *name* of the env var.
 */
export function missingAuthWarning(
  sourceName: string,
  detection: AuthDetection,
): string | null {
  if (detection.detected) return null;

  const reason = detection.envVar
    ? `${detection.envVar} is not set`
    : 'no credential env var is known for this source';

  return `Warning: "${sourceName}" — ${reason}; requests will be forwarded WITHOUT credentials.\n`;
}

export interface ApplyAuthOptions {
  env?: NodeJS.ProcessEnv;
  /** Override the warning sink (tests inject a spy here). */
  warn?: (line: string) => void;
}

/**
 * Detect auth for `sourceName` and warn when it will be forwarded without
 * credentials.
 *
 * Silently forwarding an unauthenticated request is the failure mode this
 * exists to prevent — the forwarding itself is still allowed.
 */
export function applyAutoDetectAuth(
  auth: AuthManager,
  sourceName: string,
  options: ApplyAuthOptions = {},
): AuthDetection {
  const detection = autoDetectAuth(auth, sourceName, options.env ?? process.env);
  const warning = missingAuthWarning(sourceName, detection);

  if (warning) {
    const warn = options.warn ?? ((line: string) => { process.stderr.write(line); });
    warn(warning);
  }

  return detection;
}
