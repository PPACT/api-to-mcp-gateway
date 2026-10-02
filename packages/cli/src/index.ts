#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { existsSync, readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseOpenApiSpec, Scorer, Enhancer, createLLMBackend, createEmbeddingProvider, type ApiSource, type ScoreReport } from '@api2mcp/core';
import {
  ToolRegistry,
  ApiProxy,
  createMCPServer,
  AuthManager,
} from '@api2mcp/server';
import { isUrl, sanitizeName } from './util.js';
import { RAGIndexer, MemoryVectorStore, RAGRetriever } from '@api2mcp/rag';
import { AgentOrchestrator } from '@api2mcp/agent';

import { convertOperation } from '@api2mcp/core';

const HELP = `api2mcp — Convert OpenAPI specs to MCP Servers

Usage:
  api2mcp serve  --spec <path-or-url> [options]
  api2mcp render --spec <path-or-url> [--output <file>]

Commands:
  serve    Start an MCP Server that proxies API calls
  render   Generate MCP tool definitions file for AI to read

Options:
  --spec, -s    Path to OpenAPI spec file or remote URL (required)
  --output, -o  Output file for render command (default: stdout)
  --port, -p    Server port (serve mode, default: 3000)
  --host, -H    Server host (serve mode, default: 127.0.0.1)
  --score       Score API documentation quality before serving
  --enhance     Auto-enhance poor descriptions
  --agent, -a   Run one-shot agent task
  --task, -t    Task description for agent mode
  --help, -h    Show this help message

Examples:
  api2mcp render --spec ./specs/petstore.yaml
  api2mcp render --spec ./specs/petstore.yaml --output mcp-tools.json
  api2mcp serve  --spec ./specs/petstore.yaml
`;

async function renderCommand(specs: string[], outputFile?: string): Promise<void> {
  const allTools: ReturnType<typeof convertOperation>[] = [];

  for (const spec of specs) {
    const resolved = await resolveSpec(spec);
    const operations = await parseOpenApiSpec(resolved.path);
    const sourceName = sanitizeName(resolved.name);
    for (const op of operations) {
      allTools.push(convertOperation(op, sourceName));
    }
    if (resolved.tmpDir) {
      try { rmSync(resolved.tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  const output = allTools.length === 1
    ? JSON.stringify(allTools[0], null, 2)
    : JSON.stringify(allTools, null, 2);

  if (outputFile) {
    writeFileSync(outputFile, output, 'utf-8');
    process.stdout.write('Generated ' + allTools.length + ' MCP tool(s) → ' + outputFile + '\n');
  } else {
    process.stdout.write(output + '\n');
  }
}

/** resolve a spec path/URL → local file path and source name */
async function resolveSpec(spec: string): Promise<{ path: string; name: string; tmpDir?: string }> {
  if (isUrl(spec)) {
    process.stdout.write('Fetching ' + spec + '...\n');
    const response = await fetch(spec);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const text = await response.text();
    const tmpDir = mkdtempSync(join(tmpdir(), 'api2mcp-'));
    const specPath = join(tmpDir, 'spec.yaml');
    writeFileSync(specPath, text, 'utf-8');

    const { parse } = await import('yaml');
    let specObj: Record<string, unknown>;
    try { specObj = JSON.parse(text); } catch { specObj = parse(text); }
    const info = (specObj.info ?? {}) as Record<string, unknown>;
    return { path: specPath, name: (info.title as string) ?? 'api', tmpDir };
  }

  if (!existsSync(spec)) throw new Error('Spec file not found: ' + spec);
  const raw = readFileSync(spec, 'utf-8');
  const { parse } = await import('yaml');
  let specObj: Record<string, unknown>;
  try { specObj = JSON.parse(raw); } catch { specObj = parse(raw); }
  const info = (specObj.info ?? {}) as Record<string, unknown>;
  return { path: spec, name: (info.title as string) ?? 'api' };
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
      output: { type: 'string', short: 'o' },
      agent: { type: 'boolean', short: 'a', default: false },
      task: { type: 'string', short: 't' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: false,
    allowPositionals: true,
  });

  if (values.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  const specArg = values.spec as string | string[] | undefined;
  const specArgs: string[] = Array.isArray(specArg) ? specArg : specArg ? [specArg] : [];
  if (positionals.length > 0 && positionals[0] !== 'serve') {
    const sub = positionals[0];
    if (sub === 'render') {
      await renderCommand(specArgs, values.output as string | undefined);
      return;
    }
    process.stderr.write('Unknown command: ' + sub + '\nUse --help for usage.\n');
    process.exit(1);
  }
  // no subcommand → default to serve

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
  const doAgent = values.agent as boolean;
  const taskDesc = values.task as string | undefined;

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

  // ---- Agent Mode ----
  if (doAgent) {
    if (!taskDesc) {
      process.stderr.write('Error: --agent requires --task <description>.\n');
      process.exit(1);
    }
    const llm = createLLMBackend();
    if (!llm) {
      process.stderr.write('Error: --agent requires ANTHROPIC_API_KEY or OPENAI_API_KEY.\n');
      process.exit(1);
    }

    // Build RAG index (OpenAI embedding if available, hash fallback otherwise)
    const store = new MemoryVectorStore();
    const indexer = new RAGIndexer(store, createEmbeddingProvider());
    await indexer.index(allOperations, 'spec');
    const retriever = new RAGRetriever(store);

    const orchestrator = new AgentOrchestrator(registry, retriever, llm);
    process.stdout.write('\nAgent executing: ' + taskDesc + '\n\n');

    const result = await orchestrator.execute(taskDesc);
    process.stdout.write('Result: ' + (result.success ? 'Success' : 'Failed') + '\n');
    process.stdout.write('Steps: ' + result.steps.length + '\n');
    for (const step of result.steps) {
      const icon = step.action === 'complete' ? '✓' : step.action === 'error' ? '✗' : '→';
      process.stdout.write('  ' + icon + ' [' + step.action + '] ' + step.detail + '\n');
    }
    process.stdout.write('\n' + result.finalAnswer + '\n');
    process.exit(0);
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