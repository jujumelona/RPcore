﻿// src/core/llama/ToolCallHandler.ts
// ═══════════════════════════════════════════════════════════════════
// LlamaEngine에서 Tool Call 관련 책임 분리
//
// 역할:
//   - RPTool / RPToolCall 타입 정의
//   - parseToolCalls(raw)   — 모델 응답 파싱 (pure function)
//   - _tryParseJSON(raw)    — 내부 JSON 파서 헬퍼
//
// LlamaEngine이 import해서 사용.
// generateWithTools / _doGenerateWithTools 는 context 등
// 엔진 내부 상태에 깊이 의존하므로 LlamaEngine에 유지한다.
// ═══════════════════════════════════════════════════════════════════

// ── 타입 ─────────────────────────────────────────────────────────

/** OpenAI 호환 function tool 정의 */
export interface RPTool {
  type: 'function';
  function: {
    name:        string;
    description: string;
    parameters: {
      type:       'object';
      properties: Record<string, { type: string; description?: string; enum?: string[] }>;
      required?:  string[];
    };
  };
}

/** 파싱된 tool call 결과 */
export interface RPToolCall {
  name:      string;
  /** tool arguments — 호출 측에서 필요한 키를 타입 가드로 접근 */
  arguments: Record<string, unknown>;
}

// ── 파서 ─────────────────────────────────────────────────────────

/**
 * 모델 응답에서 tool call 블록을 파싱
 *
 * 지원 포맷:
 *   1. <tool_call>{"name":"...", "arguments":{...}}</tool_call>  (Gemma)
 *   2. {"name":"...", "arguments":{...}}                         (plain JSON)
 *   3. [{"name":"...", "arguments":{...}}]                       (JSON 배열)
 */
export function parseToolCalls(raw: string): RPToolCall[] {
  const results: RPToolCall[] = [];

  // ── 포맷 1: <tool_call> 블록 ─────────────────────────────
  const toolCallRegex = /<tool_call>\s*([\s\S]*?)\s*(?:<\/tool_call>|$)/g;
  let match: RegExpExecArray | null;
  while ((match = toolCallRegex.exec(raw)) !== null) {
    const parsed = _tryParseJSON(match[1]);
    if (parsed) results.push(parsed);
  }
  if (results.length > 0) return results;

  // ── 포맷 2 & 3: plain JSON ────────────────────────────────
  const jsonMatch = raw.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const items  = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        const tc = _tryParseJSON(JSON.stringify(item));
        if (tc) results.push(tc);
      }
    } catch {}
  }

  return results;
}

/** @internal */
function _tryParseJSON(raw: string): RPToolCall | null {
  try {
    const obj  = JSON.parse(raw.trim()) as Record<string, unknown>;
    const name = (obj.name ?? obj.function) as string | undefined;
    const args = (obj.arguments ?? obj.parameters ?? obj.args ?? {}) as Record<string, unknown>;
    if (typeof name !== 'string') return null;
    return { name, arguments: args };
  } catch {
    return null;
  }
}

// ── 하위 호환: 기존 _parseToolCalls 이름으로도 export ────────────
/** @deprecated parseToolCalls 를 사용하세요 */
export const _parseToolCalls = parseToolCalls;
