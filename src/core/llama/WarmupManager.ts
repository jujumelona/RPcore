// src/core/llama/WarmupManager.ts
// ═══════════════════════════════════════════════════════════════════
// LlamaEngine에서 워밍업 책임만 분리
//
// 역할:
//   - STATIC_FORMAT_WARMUP_PROMPT 상수 관리
//   - setSystemPrompt / getSystemPrompt
//   - sessionPath(modelId) — warmup_session.bin 경로
//   - warmup(modelId, context) — 2단계 워밍업 실행
//   - cleanup(modelId) — 모델 언로드 시 session 파일 삭제
//
// LlamaEngine은 이 클래스 인스턴스를 private 필드로 보유하고 위임한다.
// ═══════════════════════════════════════════════════════════════════

import RNFS from '../../utils/fileSystemCompat';
import { modelDownloader } from './ModelDownloader';
import kvCacheManager from './KVCacheManager';
import { logger } from '../../utils/logger';
import type { LlamaContextExtended } from '../../types/llama.types';
// [BUG FIX] dynamic require 제거 → static import으로 교체 (Metro 번들러 안전성)
import { engineBus } from './EngineEventBus';

// ✅ [FIX] withTimeout 헬퍼 함수 추가
const WARMUP_TIMEOUT_MS = 30_000; // 30초

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[WarmupManager] ${label} timeout (${timeoutMs}ms)`)), timeoutMs)
    ),
  ]);
}

export const STATIC_FORMAT_WARMUP_PROMPT =
  '[Output Format - STRICT]\n' +
  'EVERY response MUST use this exact format.\n\n' +
  '  Narrator : 0: text #action# *thought*\n' +
  '  Character: N: text #action# *thought*  (N = character ID >= 2)\n' +
  '  LAST LINE: [L: location] [N: state] [Ev: event]\n\n' +
  'Story Log is mandatory. Always the last line. Nothing after it.';

export class WarmupManager {
  private _systemPrompt: string = STATIC_FORMAT_WARMUP_PROMPT;

  /** LlamaEngine에서 워밍업 전 미설정 경고 판단에 사용 */
  hasSystemPrompt(): boolean {
    return this._hasRealPrompt;
  }

  /**
   * 실제 RP 시스템 프롬프트로 교체.
   * load() 호출 전에 세팅하면 워밍업 prefill = 실제 게임 컨텍스트가 되어
   * 첫 응답에서 cache_prompt 재사용 효과를 얻을 수 있다.
   *
   * [BUG FIX] 빈 문자열 전달 시 STATIC_FORMAT_WARMUP_PROMPT로 fallback하면
   * hasSystemPrompt() === false가 되어 외부에서 "미설정" 상태로 잘못 인식.
   * 수정: 빈 문자열 전달 시에도 상태를 명확히 구분하기 위해
   *   _hasRealPrompt 플래그를 별도 관리.
   */
  private _hasRealPrompt = false;

  setSystemPrompt(prompt: string): void {
    if (prompt?.trim()) {
      this._systemPrompt = prompt;
      this._hasRealPrompt = true;
    } else {
      this._systemPrompt = STATIC_FORMAT_WARMUP_PROMPT;
      this._hasRealPrompt = false;
    }
  }

  getSystemPrompt(): string {
    return this._systemPrompt;
  }

  /** warmup_session.bin 저장 경로 */
  sessionPath(modelId: string): string {
    return `${modelDownloader.getModelDir(modelId)}/warmup_session.bin`;
  }

  /**
   * 2단계 워밍업
   *
   * [CI base.bin 있음]
   *   loadSession(base.bin) -> 1토큰 생성 -> 셰이더 컴파일
   *   TTFT 최소화 (KV prefill 이미 완료된 상태에서 시작)
   *   [BUG FIX] base.bin 손상 시: 즉시 삭제 -> 서버 재다운로드 플래그 설정
   *   -> 손상된 상태를 session.bin에 절대 덮어쓰지 않음
   *
   * [warmup_session.bin 있음]
   *   loadSession -> 1토큰 생성 -> 셰이더 컴파일 (< 500ms)
   *
   * [최초 실행]
   *   시스템 프롬프트 prefill -> session 저장
   */
  async warmup(modelId: string, context: LlamaContextExtended): Promise<void> {
    if (!context) return;
    const t0 = Date.now();

    // ── CI base.bin 우선 시도 ──────────────────────────────────
    const baseKVPath = kvCacheManager.getBaseKVPath(modelId);
    const hasBaseKV  = await RNFS.exists(baseKVPath).catch(() => false);

    // [BUG FIX #1] sessionPath를 try/catch 범위 밖에 선언 → catch 블록 TDZ 방지
    const sessionPath = this.sessionPath(modelId);

    if (hasBaseKV) {
      try {
        await context.loadSession(baseKVPath);
        // [BUG-12 FIX] base.bin 로드 후 실제 시스템 프롬프트를 prefill하여 session에 저장
        // n_predict: 0, cache_prompt: true 조합으로 현재 시스템 프롬프트를 KV에 고착화
        await context.completion({
          messages: [
            { role: 'system', content: this._systemPrompt },
          ],
          n_predict:    0,
          temperature:  1.0,
          top_p:        1.0,
          cache_prompt: true });
        // [BUG FIX] 로드 + 생성 모두 성공한 경우에만 session.bin 저장.
        await this._atomicSaveSession(context, sessionPath);
        logger.log(`[WarmupManager] base.bin 재사용 ${Date.now() - t0}ms`);
        return;
      } catch (e) {
        // [BUG FIX] base.bin 손상/포맷 불일치 → 즉시 삭제 후 서버 재다운로드 예약
        // [BUG-18 FIX] warmup_session.bin도 함께 삭제.
        //   base.bin이 손상됐다면 이전 실행에서 base.bin 기반으로 저장된 warmup_session.bin도
        //   동일한 구버전 KV 포맷이므로 두 번째 경로(loadSession(sessionPath))도 실패함.
        //   미리 삭제해 불필요한 실패 사이클을 제거.
        // [BUG-36 FIX] doFreshPrefill 전에 systemPrompt가 실제 RP 프롬프트인지 확인
        // this._systemPrompt가 STATIC_FORMAT_WARMUP_PROMPT(기본값)인 경우
        // 실제 스토리 시스템 프롬프트 없이 저장됨 → 다음 실행에서 잘못된 세션 재사용
        // 로그로 경고하되 doFreshPrefill은 그대로 진행 (STATIC_FORMAT도 유효한 워밍업)
        logger.warn('[WarmupManager] base.bin 로드/생성 실패 → 손상 파일 + session 삭제 (서버 재다운로드 필요):', e);
        if (!this.hasSystemPrompt()) {
          logger.warn('[WarmupManager]  systemPrompt가 기본값 — 실제 RP 프롬프트로 교체 전에 setSystemPrompt() 호출 필요');
        }
        await RNFS.unlink(baseKVPath).catch(() => {});
        await RNFS.unlink(sessionPath).catch(() => {});
        // [BUG FIX #66] modelId를 페이로드에 포함 -> AppBootstrap에서 정확한 모델 재다운로드 가능
        engineBus.emitCacheCorrupted({ cacheType: 'base', modelId });
      }
    }

    // ── warmup_session.bin ────────────────────────────────────
    const hasSession  = await RNFS.exists(sessionPath).catch(() => false);

    // ✅ [FIX] 손상된 session 파일 자동 복구
    // loadSession 실패(포맷 불일치, 손상 등) 시 파일을 즉시 삭제하고
    // fresh prefill로 fallback. 이전에는 오류만 로그하고 다음 실행에도
    // 같은 손상 파일을 반복 시도하는 문제가 있었음.
    const doFreshPrefill = async (): Promise<void> => {
      // ✅ [BUG FIX #1] n_predict:0 completion에 timeout 추가
      await withTimeout(context.completion({
        messages: [
          { role: 'system', content: this._systemPrompt },
        ],
        n_predict:    0,
        temperature:  1.0,
        top_p:        1.0,
        cache_prompt: true }), WARMUP_TIMEOUT_MS, 'fresh-prefill');
      // [BUG FIX #10] _atomicSaveSession 실패를 무시 — 디스크 공간 부족 등으로 실패해도
      // 워밍업 자체는 성공(KV 채워짐)이므로 prefill 결과는 유효하게 유지.
      await this._atomicSaveSession(context, sessionPath).catch(e =>
        logger.warn('[WarmupManager] session 저장 실패 (무시, 다음 실행에서 재시도):', e),
      );
      logger.log(`[WarmupManager] 최초 prefill ${Date.now() - t0}ms`);
    };

    try {
      if (hasSession) {
        try {
          await withTimeout(context.loadSession(sessionPath), WARMUP_TIMEOUT_MS, 'loadSession(session)');
          // ✅ [BUG FIX #1] n_predict:0 completion에 timeout 추가
          await withTimeout(context.completion({
            messages:     [{ role: 'user', content: 'test' }], // [BUG-ITEM51 FIX] 'hi' -> 'test' for minimal pollution
            n_predict:    0,
            temperature:  1.0,
            top_p:        1.0,
            cache_prompt: false }), WARMUP_TIMEOUT_MS, 'warmup-check');
          // [BUG-11 FIX] loadSession(sessionPath) 성공 시에는 saveSession 불필요
          logger.log(`[WarmupManager] session 재사용 ${Date.now() - t0}ms (save 스킵)`);
        } catch (sessionErr) {
          // 손상 파일 즉시 삭제 → 다음 실행에서 반복 시도 방지
          logger.warn('[WarmupManager] session 손상 감지 — 삭제 후 재prefill:', sessionErr);
          await RNFS.unlink(sessionPath).catch(() => {});
          await doFreshPrefill();
        }
      } else {
        await doFreshPrefill();
      }
    } catch (e) {
      logger.warn('[WarmupManager] 워밍업 실패 (첫 응답이 느릴 수 있음):', e);
    }
  }

  /**
   * ✅ [FIX] tmp->rename atomic 저장 헬퍼
   * app kill 시 부분 쓰기 손상 방지 (SessionManager/KVStateManager와 동일 패턴)
   */
  private async _atomicSaveSession(context: LlamaContextExtended, dest: string): Promise<void> {
    const tmp = dest + '.tmp';
    try {
      await context.saveSession(tmp);
      const exists = await RNFS.exists(dest).catch(() => false);
      if (exists) await RNFS.unlink(dest).catch(() => {});
      await RNFS.moveFile(tmp, dest);
    } catch (e) {
      await RNFS.unlink(tmp).catch(() => {});
      logger.warn('[WarmupManager] session 저장 실패 (무시):', e);
      throw e; // [BUG FIX] 예외를 전파하여 호출자가 저장 실패를 인지하게 함
    }
  }

  /** 모델 언로드 시 session 파일 삭제 */
  async cleanup(modelId: string): Promise<void> {
    const sessionPath = this.sessionPath(modelId);
    // [BUG FIX] await 누락 수정 — cleanup()을 await하는 호출자가 완료 전에 다음 작업 진행 방지
    // [BUG FIX #9] _atomicSaveSession이 tmp→rename 도중 kill 되면 .tmp 잔류.
    // [BUG-37 FIX] cleanup()과 _atomicSaveSession()이 동시에 실행되면 .tmp 충돌 가능.
    // LlamaEngine.release() → cleanup() 순서는 보장되지만 방어적으로 처리.
    // allSettled: 파일 없음(unlink 실패)도 정상 케이스로 처리.
    await Promise.allSettled([
      RNFS.unlink(sessionPath),
      RNFS.unlink(sessionPath + '.tmp'),
    ]);
  }
}
