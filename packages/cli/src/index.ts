#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { existsSync, readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseOpenApiSpec, Scorer, Enhancer, createLLMBackend, type ApiSource, type ScoreReport } from '@api2mcp/core';
import {
  ToolRegistry,
  ApiProxy,
  createMCPServer,
  AuthManager,
} from '@api2mcp/server';

const HELP = `api2mcp — Convert OpenAPI specs to MCP Servers

Usage:
  api2mcp serve --spec <path-or-url> [options]

Options:
  --spec, -s    Path to OpenAPI spec file or remote URL (required)
  --port, -p    Server port (default: 3000)
  --host, -H    Server host (default: 127.0.0.1)
  --score       Score API documentation quality before serving
  --enhance     Auto-enhance poor descriptions (requires --score or standalone)
  --help, -h    Show this help message

Examples:
  api2mcp serve --spec ./specs/petstore.yaml
  api2mcp serve --spec ./specs/petstore.yaml --score
  api2mcp serve --spec https://petstore.swagger.io/v2/swagger.json --port 8080 --score --enhance
`;

function isUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

function sanitizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50);
}

function autoDetectAuth(auth: AuthManager, sourceName: string): void {
  const normalized = sourceName.toLowerCase();
  const envVars: Record<string, string> = {
    github: 'GITHUB_TOKEN',
    notion: 'NOTION_API_KEY',
    feishu: 'FEISHU_APP_TOKEN',
    wechat: 'WECHAT_TOKEN',
    slack: 'SLACK_TOKEN',
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
  };

  for (const [key, envVar] of Object.entries(envVars)) {
    if (normalized.includes(key) && process.env[envVar]) {
      auth.register(sourceName, { type: 'bearer', envVar });
      return;
    }
  }
}

function printScoreReport(report: ScoreReport): void {
  process.stdout.write('\n=== API Quality Score ===\n');
  process.stdout.write('Overall: ' + report.overall + '/100\n');
  process.stdout.write(
    '  Expose: ' + report.summary.expose +
    ' | Enhance First: ' + report.summary.enhanceFirst +
    ' | Do Not Expose: ' + report.summary.doNotExpose + '\n',
  );

  for (const op of report.operations) {
    const icon = op.level === 'expose' ? '+' : op.level === 'enhance_first' ? '~' : '!';
    const dimSummary = op.dimensions
      .map((d: { name: string; score: number }) => d.name.slice(0, 2) + ':' + d.score)
      .join(' ');
    process.stdout.write(
      '  ' + icon + ' ' + op.operationId + ' [' + op.totalScore + '] (' + dimSummary + ')\n',
    );
    for (const issue of op.issues) {
      if (issue.severity === 'info') continue;
      process.stdout.write('    [' + issue.severity + '] ' + issue.message + '\n');
    }
  }

  const badOnes = report.operations.filter((o) => o.level === 'do_not_expose');
  if (badOnes.length > 0) {
    process.stdout.write(
      '\nWarning: ' + badOnes.length + ' operation(s) should NOT be exposed to AI.\n',
    );
  }
  process.stdout.write('\n');
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      spec: { type: 'string', short: 's', multiple: true },
      port: { type: 'string', short: 'p' },
      host: { type: 'string', short: 'H' },
      score: { type: 'boolean', default: false },
      enhance: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: false,
    allowPositionals: true,
  });

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

  const portVal = values.port as string | undefined;
  const port = portVal ? parseInt(portVal, 10) : 3000;
  if (isNaN(port) || port < 1 || port > 65535) {
    process.stderr.write('Error: --port must be between 1 and 65535\n');
    process.exit(1);
  }

  const hostVal = values.host as string | boolean | undefined;
  const host = typeof hostVal === 'string' ? hostVal : '127.0.0.1';
  const doScore = values.score as boolean;
  const doEnhance = values.enhance as boolean;

  const auth = new AuthManager();
  const proxy = new ApiProxy();
  const registry = new ToolRegistry(proxy, auth);
  const allOperations: import('@api2mcp/core').ApiOperation[] = [];

  for (const spec of specArgs) {
    let specPath: string;
    let tmpDir: string | null = null;

    try {
      if (isUrl(spec)) {
        process.stdout.write('Fetching spec from ' + spec + '...\n');
        const response = await fetch(spec);
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
      } else {
        specPath = spec;
        if (!existsSync(specPath)) {
          process.stderr.write('Error: Spec file not found: ' + specPath + '\n');
          process.exit(1);
        }
      }

      process.stdout.write('Parsing OpenAPI spec...\n');
      const operations = await parseOpenApiSpec(specPath);
      process.stdout.write('Found ' + operations.length + ' operation(s).\n');

      const { parse } = await import('yaml');
      const raw = readFileSync(specPath, 'utf-8');
      let specObj: Record<string, unknown>;
      try {
        specObj = JSON.parse(raw);
      } catch {
        specObj = parse(raw);
      }
      const servers = (specObj.servers ?? []) as Array<{ url: string; description?: string }>;
      const baseUrl = servers.length > 0 ? servers[0]!.url : 'http://localhost';

      const info = (specObj.info ?? {}) as Record<string, unknown>;
      const sourceName = sanitizeName((info.title as string) ?? 'api');

      const source: ApiSource = {
        name: sourceName,
        baseUrl: baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl,
        description: info.description as string | undefined,
      };

      autoDetectAuth(auth, sourceName);

      for (const op of operations) {
        registry.register(op, source);
        allOperations.push(op);
      }
    } finally {
      if (tmpDir) {
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    }
  }

  // ---- Score & Enhance ----
  if (doScore || doEnhance) {
    const scorer = new Scorer();
    const report = await scorer.score(allOperations);
    printScoreReport(report);

    if (doEnhance) {
      const llm = createLLMBackend();
      if (!llm) {
        process.stdout.write('\nEnhance requires ANTHROPIC_API_KEY or OPENAI_API_KEY env var.\n');
        process.stdout.write(report.operations.filter((o) => o.level === 'enhance_first').length + ' operation(s) could benefit.\n');
      } else {
        process.stdout.write('\nEnhancing with LLM...\n');
        const enhancer = new Enhancer(llm);
        const { results } = await enhancer.enhanceBatch(report.operations
          .filter((o) => o.level !== 'expose')
          .map((o) => allOperations.find((a) => a.operationId === o.operationId)!)
          .filter(Boolean),
        );
        process.stdout.write('Enhanced ' + results.filter((r) => r.changes.length > 0).length + ' operation(s).\n');
        // Re-register enhanced operations
        for (const r of results) {
          const op = allOperations.find((a) => a.operationId === r.operationId);
          if (op && r.changes.length > 0) {
            if (r.after.summary) op.summary = r.after.summary;
            if (r.after.description) op.description = r.after.description;
          }
        }
      }
    }
  }

  // ---- Start Server ----
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
}

main().catch((err) => {
  process.stderr.write('Fatal error: ' + (err instanceof Error ? err.message : String(err)) + '\n');
  process.exit(1);
});