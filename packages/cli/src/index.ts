#!/usr/bin/env node
#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseOpenApiSpec, type ApiSource } from '@api2mcp/core';
import {
  ToolRegistry,
  ApiProxy,
  createMCPServer,
  AuthManager,
} from '@api2mcp/server';

const HELP = `api2mcp — Convert OpenAPI specs to MCP Servers

Usage:
  api2mcp serve --spec <path-or-url> [--port <port>] [--host <host>]

Options:
  --spec, -s   Path to OpenAPI spec file or remote URL (required)
  --port, -p   Server port (default: 3000)
  --host, -H   Server host (default: 127.0.0.1)
  --help, -h   Show this help message

Examples:
  api2mcp serve --spec ./specs/petstore.yaml
  api2mcp serve --spec https://petstore.swagger.io/v2/swagger.json --port 8080
`;

function isUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      spec: { type: 'string', short: 's', multiple: true },
      port: { type: 'string', short: 'p' },
      host: { type: 'string', short: 'H' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: false,
    allowPositionals: true,
  });
  // Validate positionals: only "serve" is accepted (or none at all)
  if (positionals.length > 0) {
    const sub = positionals[0];
    if (sub !== 'serve') {
      process.stderr.write('Unknown command: ' + sub + '\nUse --help for usage.\n');
      process.exit(1);
    }
  }

  if (values.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  const specArg = values.spec as string | string[] | undefined;
  const specArgs: string[] = Array.isArray(specArg) ? specArg : specArg ? [specArg] : [];
  if (specArgs.length === 0) {
    process.stderr.write('Error: --spec is required. Use --help for usage.\n');
    process.exit(1);
  }

  const port = values.port ? parseInt(values.port, 10) : 3000;
  if (isNaN(port) || port < 1 || port > 65535) {
    process.stderr.write('Error: --port must be between 1 and 65535\n');
    process.exit(1);
  }

  const host = values.host ?? '127.0.0.1';

  const auth = new AuthManager();
  const proxy = new ApiProxy();
  const registry = new ToolRegistry(proxy, auth);
  const allOperations: unknown[] = [];

  for (const spec of specArgs) {
    let specPath: string;
    let tmpDir: string | null = null;

  // Handle remote URL: download to temp file
  if (isUrl(specArg)) {
    process.stdout.write('Fetching spec from ' + specArg + '...\n');
    try {
      const response = await fetch(specArg);
      if (!response.ok) {
        process.stderr.write(
          'Error: Failed to fetch spec: HTTP ' + response.status + ' ' + response.statusText + '\n',
        );
        process.exit(1);
      }
      const text = await response.text();
      tmpDir = mkdtempSync(join(tmpdir(), 'api2mcp-'));
      specPath = join(tmpDir, 'spec.yaml');
      writeFileSync(specPath, text, 'utf-8');
    } catch (err) {
      process.stderr.write(
        'Error: Could not fetch spec: ' + (err instanceof Error ? err.message : 'Unknown error') + '\n',
      );
      process.exit(1);
    }
  } else {
    specPath = specArg;
    if (!existsSync(specPath)) {
      process.stderr.write('Error: Spec file not found: ' + specPath + '\n');
      process.exit(1);
    }
  }

  try {
    // Parse the spec
    process.stdout.write('Parsing OpenAPI spec...\n');
    const operations = await parseOpenApiSpec(specPath);
    process.stdout.write('Found ' + operations.length + ' operation(s).\n');

    // Extract base URL from spec (use the first server URL or derive from the spec file)
    const { parse } = await import('yaml');
    const { readFileSync } = await import('node:fs');
    const raw = readFileSync(specPath, 'utf-8');
    let specObj: Record<string, unknown>;
    try {
      specObj = JSON.parse(raw);
    } catch {
      specObj = parse(raw);
    }
    const servers = (specObj.servers ?? []) as Array<{ url: string; description?: string }>;
    const baseUrl = servers.length > 0 ? servers[0]!.url : 'http://localhost';

    // Derive source name from spec title
    const info = (specObj.info ?? {}) as Record<string, unknown>;
    const sourceName = sanitizeName((info.title as string) ?? 'api');

    const source: ApiSource = {
      name: sourceName,
      baseUrl: baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl,
      description: info.description as string | undefined,
    };

    // Auto-detect auth for this source
    autoDetectAuth(auth, sourceName);

    for (const op of operations) {
      registry.register(op, source);
      allOperations.push(op);
    }

      // Clean up temp dir for this spec
      if (tmpDir) {
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    } catch (specErr) {
      process.stderr.write('Error processing spec: ' + (specErr instanceof Error ? specErr.message : String(specErr)) + '\n');
      if (tmpDir) {
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
      process.exit(1);
    }
  }

  // Start server
  const server = createMCPServer({
    proxy,
    parser: { parse: async () => allOperations as never[] },
    registry,
    port,
    host,
  });

  await server.start();

    process.stdout.write('\nMCP Server running at http://' + host + ':' + port + '/mcp\n');
    process.stdout.write('Registered tools (' + registry.list().length + '):\n');
    for (const tool of registry.list()) {
      process.stdout.write('  - ' + tool.name + ': ' + tool.description + '\n');
    }
    process.stdout.write('\nPress Ctrl+C to stop.\n');
  } finally {
    // Clean up temp directory
    if (tmpDir) {
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Best effort cleanup
      }
    }
  }
}

function sanitizeName(raw: string): string {
}

function autoDetectAuth(auth: AuthManager, sourceName: string): void {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50);
}

main().catch((err) => {
  process.stderr.write('Fatal error: ' + (err instanceof Error ? err.message : String(err)) + '\n');
  process.exit(1);
});
