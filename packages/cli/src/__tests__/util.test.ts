import { describe, it, expect } from 'vitest';
import { isUrl, sanitizeName } from '../util.js';

describe('isUrl', () => {
  it('accepts http(s) URLs', () => {
    expect(isUrl('https://example.com/openapi.json')).toBe(true);
    expect(isUrl('http://127.0.0.1:3000/spec.yaml')).toBe(true);
  });

  it('rejects relative and bare paths', () => {
    expect(isUrl('./specs/petstore.yaml')).toBe(false);
    expect(isUrl('specs/petstore.yaml')).toBe(false);
  });

  // ⚠️ 已知缺陷（已记入交流区，待派工单）：`new URL()` 把盘符读成 `d:` 协议，
  //    所以 Windows 绝对路径被判成 URL —— CLI 会把本地文件当远程地址去下载。
  //    用 `it.fails` 而非断言 true：缺陷修好时本用例会翻红，逼人做出明确决定。
  it.fails('rejects Windows drive paths (known defect: currently misread as a URL)', () => {
    expect(isUrl('D:/specs/petstore.yaml')).toBe(false);
  });
});

describe('sanitizeName', () => {
  it('lowercases and replaces non-alphanumerics with underscores', () => {
    expect(sanitizeName('GitHub REST API')).toBe('github_rest_api');
  });

  it('collapses runs of separators and trims the edges', () => {
    expect(sanitizeName('  --Notion / API--  ')).toBe('notion_api');
  });

  it('truncates to 50 characters', () => {
    expect(sanitizeName('a'.repeat(80))).toHaveLength(50);
  });
});
