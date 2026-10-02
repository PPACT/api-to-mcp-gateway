# 使用

## 安装

```bash
pnpm install
```

## 命令一览

```
api2mcp serve  --spec <路径或 URL> [选项]    启动 MCP Server 并代理 API 调用
api2mcp render --spec <路径或 URL> [选项]    输出 MCP tool 定义（给 AI 读的 JSON）
```

| 选项 | 说明 |
|---|---|
| `--spec, -s` | OpenAPI 文档路径或远程 URL，**可重复** |
| `--port, -p` | 端口（serve，默认 `3000`） |
| `--host, -H` | 监听地址（serve，默认 `127.0.0.1`） |
| `--output, -o` | render 的输出文件（默认 stdout） |
| `--score` | 启动前对 API 文档质量打分 |
| `--enhance` | 自动增强质量欠佳的描述（需 LLM 凭证） |
| `--agent, -a` | 运行一次性 Agent 任务（需 `--task`） |
| `--task, -t` | Agent 任务描述 |
| `--help, -h` | 帮助 |

> ⚠️ **`render` 忽略 `--score` / `--enhance` / `--agent`** —— 这三个选项只在 `serve` 模式下生效。

## 启动 MCP Server

```bash
pnpm start -- --spec ./specs/petstore.yaml
```

监听 `http://127.0.0.1:3000/mcp`。启动后会打印已注册的工具列表。

**多个 API 合到一个 Server**（工具名以 source 前缀区分）：

```bash
pnpm start -- --spec ./github.yaml --spec ./notion.yaml
```

**远程 spec**：`--spec` 可直接给 URL，会先下载再解析：

```bash
pnpm start -- --spec https://example.com/openapi.json
```

## 注入凭证

凭证通过环境变量提供（命名规则见 [security.md](./security.md#自动识别autodetectauth)），**不写进任何文件**：

```bash
export GITHUB_TOKEN=<你的令牌>
pnpm start -- --spec ./github.yaml
```

## 接入 MCP 客户端

在 MCP 客户端（如 Claude Desktop）的配置里指向本 Server：

```json
{
  "mcpServers": {
    "api2mcp": {
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

> 协议面为 JSON-RPC 2.0 的 `initialize` / `tools/list` / `tools/call`，
> 传输为 `POST /mcp` 单次请求—响应（**非** SSE 流式）。
> 若客户端要求 Streamable HTTP 的流式传输，当前版本可能不兼容 —— 见 [能力矩阵](./README.md#能力矩阵)。

## 查看工具定义（render）

不启动 Server，直接把 tool 定义导成 JSON 给 AI 或人看：

```bash
pnpm start -- render --spec ./specs/petstore.yaml --output mcp-tools.json
```

## 质量评分与增强

**打分**（5 个维度、满分 100，输出 `expose` / `enhance_first` / `do_not_expose` 三档）：

```bash
pnpm start -- serve --spec ./specs/petstore.yaml --score
```

输出示例形态：

```
=== API Quality Score ===
Overall: 72/100
  Expose: 8 | Enhance First: 3 | Do Not Expose: 1
  + getPetById [88] (描述:22 Sche:25 示例:20 错误:13 命名:8)
  ! listPets   [54] (描述:12 Sche:15 示例:8 错误:9 命名:10)
      [warning] description 不够详细
```

**增强**（用 LLM 改写欠佳的 `summary` / `description`，需 `ANTHROPIC_API_KEY` 或 `OPENAI_API_KEY`）：

```bash
pnpm start -- serve --spec ./specs/petstore.yaml --enhance
```

## Agent 模式（一次性任务）

让编排器自己检索工具、调用 API、给出结论：

```bash
pnpm start -- serve --spec ./specs/petstore.yaml --agent --task "找出所有可用的宠物并总结"
```

- 最多迭代 **10 轮**，结束后**进程直接退出**（不启动 Server）
- 需要 `ANTHROPIC_API_KEY` 或 `OPENAI_API_KEY`
- 检索优先使用 `OPENAI_API_KEY` 提供的语义向量；**未设置时回退为哈希向量**（仅适合演示，且不会提示）

## 测试

```bash
pnpm --filter @api2mcp/core --filter @api2mcp/agent test
```

> 这是当前**有测试覆盖**的两个包。其余包的测试正在补齐。

## 环境变量汇总

| 变量 | 用途 |
|---|---|
| `GITHUB_TOKEN` / `NOTION_API_KEY` / … | 目标 API 凭证（见 security.md） |
| `ANTHROPIC_API_KEY` | 增强 / Agent 模式的 LLM |
| `OPENAI_API_KEY` | 备用 LLM；以及语义检索的 embedding |
| `OPENAI_EMBEDDING_URL` | 覆盖 embedding 端点（默认 OpenAI 官方地址） |
