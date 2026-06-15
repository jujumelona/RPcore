﻿// src/api/ServerAPI.ts
//  DEPRECATED — /conversation 엔드포인트는 서버에서 삭제됨 (AI 서버 미사용)
// 이 파일은 사용되지 않습니다. import하는 곳이 없으며 향후 제거 예정.

/* eslint-disable @typescript-eslint/no-unused-vars */

import { z } from 'zod';
// import { ActionNode } from '../core/langgraph/StateGraph';
import { SERVER_BASE } from '../config/ApiConfig';
import { useAuthStore } from '../store/authStore';

// ── Zod 스키마 ─────────────────────────────────────────────────
//  ✅ [FIX] 서버 응답을 런타임에 검증 — 잘못된 응답이 앱 내부까지
//     조용히 전파되는 것을 방지합니다.

const ActionNodeSchema = z.object({
  type:  z.enum(['character', 'narration', 'state_update']),
  id:    z.string(),
  guide: z.string().optional() });

const ServerResponseSchema = z.object({
  nextSequence: z.array(ActionNodeSchema),
  stateUpdate:  z.object({
    location:         z.string().optional(),
    newCharacterJoined: z.string().optional() }) });

export type ServerResponseValidated = z.infer<typeof ServerResponseSchema>;

// ── 요청/응답 타입 ─────────────────────────────────────────────

export interface ServerRequest {
  userInput:      string;
  contextSummary: string;
  localState: {
    currentLocation:  string;
    nearbyCharacters: string[];
    metrics:          Record<string, number>;
  };
}

export type ServerResponse = ServerResponseValidated;

const TIMEOUT_MS  = 10_000;
const MAX_RETRIES = 2;

/** AbortController 기반 타임아웃 fetch */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export class ServerAPI {
  private static instance: ServerAPI;
  private serverUrl: string = SERVER_BASE;

  static getInstance(): ServerAPI {
    if (!ServerAPI.instance) {
      ServerAPI.instance = new ServerAPI();
    }
    return ServerAPI.instance;
  }

  async sendRequest(req: ServerRequest): Promise<ServerResponse> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // ✅ [BUG FIX] /conversation은 mustAuth 필수 — Authorization 헤더 없으면 항상 401
        const token = useAuthStore.getState().user?.jwtToken;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const response = await fetchWithTimeout(
          `${this.serverUrl}/conversation`,
          {
            method:  'POST',
            headers,
            body:    JSON.stringify(req) },
          TIMEOUT_MS,
        );

        if (!response.ok) {
          throw new Error(`Server error ${response.status}: ${response.statusText}`);
        }

        const raw = await response.json();

        // ✅ [FIX] Zod 런타임 검증 — parse() 는 실패 시 ZodError throw
        const validated = ServerResponseSchema.parse(raw);
        return validated;

      } catch (error: unknown) {
        lastError = error;

        // Zod 검증 실패는 재시도해도 동일하므로 즉시 중단
        if (error instanceof z.ZodError) {
          console.error('[API] Response validation failed:', error.flatten());
          break;
        }

        const isAbort    = (error as { name?: string })?.name === 'AbortError';
        const isNetwork  = (error as { message?: string })?.message?.includes('Network request failed');
        const isRetryable = isAbort || isNetwork;

        if (!isRetryable || attempt === MAX_RETRIES) break;

        // 지수 백오프: 1s, 2s
        await new Promise<void>(resolve => setTimeout(() => resolve(), 1_000 * (attempt + 1)));
      }
    }

    console.error('[API] Request failed after retries:', lastError);
    // 로컬 fallback — Worker 장애 시 앱이 조용히 멈추지 않도록
    return {
      nextSequence: [
        { type: 'character', id: 'char_1', guide: 'Respond naturally' },
      ],
      stateUpdate: {} };
  }
}

export const serverAPI = ServerAPI.getInstance();



