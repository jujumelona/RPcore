// src/core/llama/PrefixKVManager.ts
// ════════════════════════════════════════════════════════════════════
// 접두사 KV 고정 + 캐릭터별 슬롯 포킹 관리자
//
// ┌─── llama.cpp 서버 API 대응표 ────────────────────────────────────┐
// │ C++ API                      │ 이 파일에서의 구현                 │
// ├──────────────────────────────┼────────────────────────────────────┤
// │ llama_kv_cache_seq_cp(0,N)   │ saveSession(prefixPath)            │
// │   접두사 KV를 슬롯 N으로 복사│   -> loadSession(prefixPath) in     │
// │                              │     target slot via slot_id=N      │
// ├──────────────────────────────┼────────────────────────────────────┤
// │ llama_kv_cache_seq_rm(N,p1)  │ softReset(slotId) 패턴             │
// │   접미사(p1 이후)만 삭제     │   n_predict:0 + cache_prompt:false │
// │                              │   -> 접두사 이후 KV만 제거         │
// ├──────────────────────────────┼────────────────────────────────────┤
// │ --ctx-checkpoints N          │ _checkpoints Map<slotId, path>     │
// │   슬롯별 KV 스냅샷 (최대 N)  │   저장경로 관리 + TTL 만료         │
// ├──────────────────────────────┼────────────────────────────────────┤
// │ id_slot (서버 요청 파라미터) │ slot_id 파라미터로 completion 전달 │
// │   (구 slot_id 와 동일)       │   (llama.rn은 내부적으로 동일 처리)│
// ├──────────────────────────────┼────────────────────────────────────┤
// │ n_cache_reuse                │ completion params에 명시           │
// │   KV 재사용 최소 청크 크기   │   기본값: 256 (tokens)             │
// ├──────────────────────────────┼────────────────────────────────────┤
// │ cache_prompt: true (default) │ 모든 completion에 항상 true 유지   │
// │   (최신 버전 기본값 변경됨)  │                                    │
// └──────────────────────────────┴────────────────────────────────────┘
//
// 작동 흐름:
//   1. lockWorldPrefix(systemPrompt)
//      - slot 0에 세계관+캐릭터 프롬프트 prefill
//      - n_predict:0 (토큰 생성 없이 KV만 채움)
//      - saveSession(prefixCheckpointPath) -> 스냅샷 저장
//      - _prefixTokenCount 기록 -> 이후 suffix rm 기준점
//
//   2. forkToCharacterSlot(charId)
//      - charId -> slot 번호 매핑 (2->slot1, 3->slot2 ...)
//      - 프리픽스 체크포인트를 해당 슬롯에 로드
//      - 각 캐릭터가 독립적인 suffix KV를 가짐
//
//   3. resetCharacterSuffix(charId)
//      - 해당 슬롯의 suffix(접두사 이후 KV) 제거
//      - 프리픽스 체크포인트에서 재로드
//      - 새 스토리 분기 시 사용
//
//   4. 슬롯 번호 매핑 (RAM 티어별):
//      - slot 0 : 세계관 프리픽스 + 단일 슬롯 기기용 생성
//      - slot 1 : 캐릭터 2 (첫 번째 캐릭터)
//      - slot 2 : 캐릭터 3
//      - slot 3 : 캐릭터 4
//      ※ n_parallel(최대 4)을 초과하면 slot 0으로 fallback
//
// 왜 saveSession/loadSession으로 seq_cp를 에뮬레이션하는가?
//   llama.rn은 C++ llama_kv_cache_seq_cp()를 JS에 직접 노출하지 않음.
//   대신 saveSession/loadSession이 동일한 결과(KV 상태 복원)를 달성함.
//   서버 --slot-save-path 옵션의 JS 레벨 구현과 동일한 원리.
// ════════════════════════════════════════════════════════════════════

import RNFS from '../../utils/fileSystemCompat';
import { logger } from '../../utils/logger';
import type { LlamaContextExtended, LlamaCompletionParams } from '../../types/llama.types';
import { hashString } from '../../utils/hash';
import { buildBasePrefillMessages } from '../../utils/PromptEngine';
import { DEFAULT_N_CACHE_REUSE } from './kv-spec-constants';

// ── 상수 ─────────────────────────────────────────────────────────

/** 프리픽스 체크포인트 저장 디렉토리 */
function checkpointDir(): string { return `${RNFS.DocumentDirectoryPath}/kv_prefix_checkpoints`; }

/** 체크포인트 유효 기간: 48시간 (세계관 변경 빈도 기준) */
const CHECKPOINT_TTL_MS = 48 * 60 * 60 * 1000;

/** 슬롯당 최대 체크포인트 수 (--ctx-checkpoints 기본값 8 참조) */
const MAX_CHECKPOINTS_PER_SLOT = 4;

import kvOffsetTracker from './KVOffsetTracker';


// ── 타입 ─────────────────────────────────────────────────────────

export interface PrefixCheckpoint {
  /** 체크포인트 파일 경로 */
  path: string;
  /** 이 체크포인트에 해당하는 시스템 프롬프트 해시 */
  promptHash: string;
  /** 저장 시각 */
  savedAt: number;
  /** prefill된 토큰 수 (suffix rm 기준점) */
  prefixTokenCount: number;
  /** 사용된 슬롯 ID */
  slotId: number;
}

export interface SlotAssignment {
  /** 캐릭터 ID (2 이상) */
  charId: number;
  /** 할당된 슬롯 번호 */
  slotId: number;
}

// ── PrefixKVManager ───────────────────────────────────────────────

class PrefixKVManager {
  /**
   * 슬롯별 현재 체크포인트 정보
   * key: slotId, value: 현재 활성 체크포인트
   */
  private _checkpoints = new Map<number, PrefixCheckpoint>();

  /**
   * 캐릭터 ID -> 슬롯 번호 매핑
   * charId 2 -> slot 1, charId 3 -> slot 2 ...
   * nParallelSlots 초과 시 slot 0 fallback
   */
  private _charSlotMap = new Map<number, number>();

  /** 현재 세계관 프리픽스 해시 (변경 감지용) */
  private _currentPrefixHash: string = '';

  /** 초기화된 병렬 슬롯 수 */
  private _nParallelSlots: number = 1;

  /** 전체 context 크기 */
  private _nCtx: number = 8192;

  /** 현재 llama context 참조 */
  private _ctx: LlamaContextExtended | null = null;

  // ── 초기화 ──────────────────────────────────────────────────────

  /**
   * LlamaEngine 초기화 후 반드시 호출.
   *
   *  TODO: llama.rn이 llama_kv_cache_seq_cp()를 JS에 노출하면 멀티슬롯 활성화
   *   현재 loadSession()은 항상 slot 0에 복원하므로
   *   slot_id 파라미터를 넘겨도 slot 1~3에는 KV가 실제로 주입되지 않음.
   *   -> 안전하게 nParallelSlots=1로 고정하여 모든 캐릭터가 slot 0을 공유.
   */
  async init(ctx: LlamaContextExtended, _nParallelSlots: number, nCtx: number): Promise<void> {
    this._ctx             = ctx;
    this._nParallelSlots  = 1;  // TODO: seq_cp 노출 시 _nParallelSlots로 교체
    this._nCtx            = nCtx;
    this._charSlotMap.clear();
    this._checkpoints.clear();
    this._currentPrefixHash = '';

    await this._ensureDir();
    await this._gcExpiredCheckpoints();
    logger.log(`[PrefixKVManager] 초기화: n_parallel=1 (멀티슬롯 비활성 — TODO: seq_cp 대기)`);
  }

  /** 모델 언로드 시 컨텍스트 참조 해제 */
  release(): void {
    this._ctx             = null;
    this._checkpoints.clear();
    this._charSlotMap.clear();
    this._currentPrefixHash = '';
  }

  // ── 세계관 프리픽스 고정 ─────────────────────────────────────────

  /**
   * 세계관/시스템 프롬프트를 슬롯 0에 prefill 후 KV 스냅샷 저장.
   *
   * llama_kv_cache_seq_cp(0, dst, 0, prefixLen) 의 JS 에뮬레이션.
   * completion(n_predict:0, cache_prompt:true) -> KV 채움 -> saveSession()
   *
   * @param systemPrompt  세계관+캐릭터+규칙 통합 프롬프트
   * @param prefixTokenEstimate  예상 접두사 토큰 수 (기본: 512)
   * @returns 저장된 체크포인트 정보
   */
  async lockWorldPrefix(
    systemPrompt: string,
    prefixTokenEstimate: number = 512,
  ): Promise<PrefixCheckpoint | null> {
    if (!this._ctx) return null;

    const hash = this._hashPrompt(systemPrompt);

    // 이미 동일 해시의 체크포인트가 있으면 재사용
    const existing = this._checkpoints.get(0);
    if (existing && existing.promptHash === hash) {
      logger.log('[PrefixKVManager] 동일 프리픽스 체크포인트 재사용');
      return existing;
    }

    try {
      // ── 단계 1: slot 0에 prefill (토큰 생성 없이 KV만 구성) ────
      // n_predict:0 = prefill only, cache_prompt:true = KV 저장
      // 이것이 llama_kv_cache_seq_cp의 JS 에뮬레이션 핵심
      // [BUG FIX #16] completion 실패를 무시하지 않고 throw로 전파
      // 이전: .catch(() => {}) -> prefill 실패 시에도 _atomicSaveSession 진행
      //       -> 시스템 프롬프트가 반영되지 않은 빈/이전 KV 상태를 스냅샷으로 저장
      //       -> 이후 loadSession(checkpointPath)으로 복원 시 세계관 없는 KV로 대화 시작
      // 수정: 실패 시 outer catch 블록으로 전파 -> lockWorldPrefix가 null 반환
      //       caller(useKVSession._buildBaseKV)에서 _buildBaseKV=false -> 풀 prefill 폴백
      // [BUG FIX #16] n_keep 전달 객체(completion param)에 누락
      // 전역 initLlama의 nKeep(512 등)이 사용되어 시스템 프롬프트가 이보다 길면 
      // prefill 도중 잘려나가고 shiftKV가 발생해 불완전한 베이스 KV가 저장됨.
      // prefixTokenEstimate(또는 최소 512)를 n_keep으로 전달하여 프리픽스 영구 보존 보장.
      const safeNKeep = Math.max(prefixTokenEstimate, 512);

      const prefillResult = await this._ctx.completion({
        messages: buildBasePrefillMessages(systemPrompt),
        n_predict:    0,           // 생성 없이 KV만 채움
        temperature:  1.0,
        top_p:        1.0,
        cache_prompt: true,        // KV 캐시에 저장
        slot_id:      0,           // 슬롯 0 = 세계관 전용
        n_keep:       safeNKeep,   // [BUG FIX] 긴 프리픽스 절단 방어
        n_cache_reuse: DEFAULT_N_CACHE_REUSE,  // 최소 256토큰 공통 prefix 재사용
        kv_unified: true,          // 필수
        flash_attn_type: 'off',    // 필수
      } as LlamaCompletionParams);

      // ── 단계 2: KV 스냅샷 저장 (--slot-save-path 동일 원리) ────
      const checkpointPath = `${checkpointDir()}/prefix_slot0_${hash.slice(0, 12)}.bin`;
      // ✅ [FIX] atomic 저장 — app kill 시 .bin 손상 방지
      await this._atomicSaveSession(checkpointPath);

      // [BUG-ITEM53 FIX] lockWorldPrefix() 내부에서 직접 measureBase를 수행해
      // prefixTokenCount: 0 sentinel로 저장되는 레이스 컨디션을 근본적으로 해결.
      const promptTokens = prefillResult.tokens_evaluated ?? prefillResult.timings?.prompt_n ?? 0;
      const predictedTokens = prefillResult.tokens_predicted ?? prefillResult.timings?.predicted_n ?? 0;
      const cachedTokens = prefillResult.tokens_cached ?? 0;
      const exactPrefixTokens = promptTokens + predictedTokens + cachedTokens;
      const actualCount = exactPrefixTokens > 0
        ? kvOffsetTracker.applyMeasuredBaseEnd(exactPrefixTokens)
        : await kvOffsetTracker.measureBase(systemPrompt);

      const checkpoint: PrefixCheckpoint = {
        path:             checkpointPath,
        promptHash:       hash,
        savedAt:          Date.now(),
        prefixTokenCount: actualCount,
        slotId:           0 };

      this._checkpoints.set(0, checkpoint);
      this._currentPrefixHash = hash;

      // 체크포인트 메타 저장 (재시작 후 복원용)
      await this._saveCheckpointMeta(0, checkpoint);

      logger.log(
        `[PrefixKVManager] ✅ 세계관 프리픽스 고정: ` +
        `hash=${hash.slice(0, 8)} tokens≈${prefixTokenEstimate}`,
      );
      return checkpoint;

    } catch (e) {
      logger.warn('[PrefixKVManager] lockWorldPrefix 실패:', e);
      return null;
    }
  }

  /**
   * [BUG FIX #17] 캡슐화 위반 방지용 공식 API 추가
   * LlamaEngine._doLockWorldPrefix()에서 measureBase 완료 후 얻은
   * 실제 token count를 안전하게 업데이트 (객체 직접 수정 회피).
   */
  async updateCheckpointTokenCount(slotId: number, tokenCount: number): Promise<void> {
    const checkpoint = this._checkpoints.get(slotId);
    if (!checkpoint) return;
    
    checkpoint.prefixTokenCount = tokenCount;
    await this._saveCheckpointMeta(slotId, checkpoint).catch(() => {});
  }

  // ── 캐릭터별 슬롯 포킹 ──────────────────────────────────────────

  /**
   * 특정 캐릭터에게 전용 슬롯을 할당하고 세계관 프리픽스를 복사.
   *
   * llama_kv_cache_seq_cp(0, charSlot, 0, prefixLen) 의 JS 에뮬레이션.
   * 프리픽스 체크포인트 로드 -> 해당 슬롯의 starting KV = 세계관 고정
   *
   * @param charId  캐릭터 ID (2 이상)
   * @returns       할당된 슬롯 번호 (0 = fallback)
   */
  async forkToCharacterSlot(charId: number): Promise<number> {
    if (!this._ctx) return 0;

    const slotId = this._assignSlot(charId);
    if (slotId === 0) {
      // 단일 슬롯 기기 — 슬롯 0에서 모든 캐릭터 처리 (기존 방식)
      return 0;
    }

    const prefixCheckpoint = this._checkpoints.get(0);
    if (!prefixCheckpoint) {
      logger.warn(`[PrefixKVManager] 슬롯 ${slotId}에 프리픽스 체크포인트 없음 — slot 0 fallback`);
      return 0;
    }

    try {
      // ── seq_cp(0 -> slotId) 에뮬레이션 ──────────────────────────
      // llama.rn은 llama_kv_cache_seq_cp()를 JS에 직접 노출하지 않으므로
      // 아래 2단계로 동일 효과를 달성:
      //
      //   1. loadSession(prefixPath)  -> 엔진 내부 KV에 프리픽스 상태 복원
      //   2. completion(n_predict=0, slot_id=slotId, cache_prompt=true)
      //      -> 복원된 KV를 대상 슬롯에 re-prefill (슬롯 지정 없이 loadSession만 하면
      //        내부적으로 slot 0에만 반영되어 실제 charSlot에는 도달하지 않음)
      // [BUG-33 FIX] loadSession은 slot 0의 현재 대화 KV를 prefix 상태로 덮어씀.
      // nParallelSlots=1(단일 슬롯)인 경우 포킹 자체를 스킵해 대화 KV 손실 방지.
      // nParallelSlots>1이어야 멀티슬롯 포킹이 유효함.
      if (this._nParallelSlots <= 1) {
        this._charSlotMap.set(charId, 0);
        return 0;
      }
      await this._ctx.loadSession(prefixCheckpoint.path);

      // ── 포인터: 대상 슬롯에 프리픽스 KV 주입 ─────────────────────
      // n_keep = baseEnd -> 슬롯 priming 중에도 Base KV 절대 보호
      // n_cache_reuse = baseEnd -> slot 0(base)이 공통 prefix임을 엔진에 알림
      // [BUG FIX #1] n_cache_reuse도 별도 구조분해 (n_keep ≠ n_cache_reuse 하한)
      const { n_keep: forkNKeep, n_cache_reuse: forkNCacheReuse } = kvOffsetTracker.getBaseOnlyOffsets(this._nCtx);

      // ✅ [FIX] completion 실패 시 KV desync 방지
      // loadSession은 slot 0에 KV를 복원. completion(slot_id=slotId) 실패 시
      // slotId의 KV는 미설정 상태 — checkpoint를 등록하면 desync 발생.
      // 실패 시: slot 0으로 fallback (loadSession으로 slot 0은 이미 유효한 상태)
      let completionOk = false;
      try {
        await this._ctx.completion({
          messages:      [{ role: 'system', content: '' }],
          n_predict:     0,
          temperature:   1.0,
          top_p:         1.0,
          cache_prompt:  true,
          slot_id:       slotId,
          id_slot:       slotId,
          n_keep:        forkNKeep,
          n_cache_reuse: forkNCacheReuse } as LlamaCompletionParams);
        completionOk = true;
      } catch (e) {
        logger.warn(
          `[PrefixKVManager] 슬롯 ${slotId} priming completion 실패 — slot 0 fallback:`, e,
        );
      }

      if (!completionOk) {
        // slot 0은 loadSession으로 이미 복원됨 -> charId를 slot 0으로 재매핑
        this._charSlotMap.set(charId, 0);
        logger.log(`[PrefixKVManager] charId=${charId} -> slot 0 fallback (priming 실패)`);
        return 0;
      }

      // 슬롯 체크포인트 저장
      const slotCheckpointPath = `${checkpointDir()}/prefix_slot${slotId}_${prefixCheckpoint.promptHash.slice(0, 12)}.bin`;
      // ✅ [FIX] atomic 저장 — app kill 시 슬롯 체크포인트 손상 방지
      await this._atomicSaveSession(slotCheckpointPath).catch(() => {});

      this._checkpoints.set(slotId, {
        ...prefixCheckpoint,
        path:   slotCheckpointPath,
        slotId });

      logger.log(`[PrefixKVManager] 캐릭터 ${charId} -> 슬롯 ${slotId} 포킹 완료`);
      return slotId;

    } catch (e) {
      logger.warn(`[PrefixKVManager] 슬롯 ${slotId} 포킹 실패, slot 0 fallback:`, e);
      return 0;
    }
  }

  /**
   * 캐릭터의 suffix KV를 제거하고 프리픽스로 복원.
   *
   * llama_kv_cache_seq_rm(slotId, prefixLen, ctx_size) 의 JS 에뮬레이션.
   * "다시 해보기" / "분기 탐색" 기능에 사용.
   *
   * @param charId  suffix를 제거할 캐릭터 ID
   */
  async resetCharacterSuffix(charId: number): Promise<void> {
    if (!this._ctx) return;

    const slotId     = this._charSlotMap.get(charId) ?? 0;
    const checkpoint = this._checkpoints.get(slotId);

    if (!checkpoint) {
      logger.warn(`[PrefixKVManager] 슬롯 ${slotId} 체크포인트 없음 — suffix reset 불가`);
      return;
    }

    try {
      // 프리픽스 체크포인트 재로드 (suffix 이후 KV 전부 제거됨)
      // = seq_rm(slotId, prefixTokenCount, -1) 에뮬레이션
      await this._ctx.loadSession(checkpoint.path);

      // [BUG-17 FIX] prefixTokenCount=0(lockWorldPrefix 저장 시 measureBase 미완료 sentinel)
      // 이면 현재 kvOffsetTracker.baseEnd 또는 MIN_N_KEEP(512) 로 fallback.
      const effectivePrefixTokens = checkpoint.prefixTokenCount > 0
        ? checkpoint.prefixTokenCount
        : (kvOffsetTracker.baseEnd > 0 ? kvOffsetTracker.baseEnd : 512);

      logger.log(
        `[PrefixKVManager] 캐릭터 ${charId} suffix reset ` +
        `(슬롯 ${slotId}, prefix=${effectivePrefixTokens}토큰 복원)`,
      );
    } catch (e) {
      logger.warn(`[PrefixKVManager] 슬롯 ${slotId} suffix reset 실패:`, e);
    }
  }

  // ── 슬롯 정보 조회 ───────────────────────────────────────────────

  /**
   * 캐릭터 ID에 할당된 슬롯 번호 반환
   * 할당 이력이 없으면 새로 배정
   */
  getSlotForCharacter(charId: number): number {
    return this._charSlotMap.get(charId) ?? 0;
  }

  /**
   * 현재 프리픽스 체크포인트 정보
   */
  getPrefixCheckpoint(slotId: number = 0): PrefixCheckpoint | undefined {
    return this._checkpoints.get(slotId);
  }

  /**
   * 세계관 프리픽스가 변경되었는지 확인
   * ChatScreen에서 스토리 전환 시 lockWorldPrefix 재호출 필요 여부 판단용
   */
  isPrefixStale(systemPrompt: string): boolean {
    return this._hashPrompt(systemPrompt) !== this._currentPrefixHash;
  }

  /**
   * 앱 재시작 후 체크포인트 메타 복원
   */
  async restoreCheckpointMeta(): Promise<void> {
    try {
      // [BUG FIX #5] _nParallelSlots=1 고정으로 인해 slot 1~3 메타를 복원하지 않는 버그.
      // MAX_CHECKPOINTS_PER_SLOT(4) 개 슬롯까지 스캔해 저장된 메타 파일을 모두 복원 시도.
      // [BUG-34 FIX] _nParallelSlots=1일 때는 slot 0만 스캔 — 불필요한 I/O 방지
      // slot 1~3은 _nParallelSlots=1 고정 상태에서 생성되지 않으므로 스캔 불필요
      const scanSlots = this._nParallelSlots > 1
        ? Math.max(this._nParallelSlots, MAX_CHECKPOINTS_PER_SLOT)
        : 1; // nParallelSlots=1이면 slot 0만 스캔
      for (let slotId = 0; slotId < scanSlots; slotId++) {
        const meta = await this._loadCheckpointMeta(slotId);
        if (!meta) continue;

        const fileExists = await RNFS.exists(meta.path).catch(() => false);
        if (!fileExists) {
          // ✅ [FIX Bug 32] bin 없는 orphaned meta 삭제
          await this._deleteMeta(slotId);
          continue;
        }

        const age = Date.now() - meta.savedAt;
        if (age > CHECKPOINT_TTL_MS) {
          await RNFS.unlink(meta.path).catch(() => {});
          // ✅ [FIX Bug 32/35] meta 파일도 함께 삭제 (_deleteMeta 추가됨)
          await this._deleteMeta(slotId);
          continue;
        }

        this._checkpoints.set(slotId, meta);
        if (slotId === 0) this._currentPrefixHash = meta.promptHash;
      }
      logger.log(`[PrefixKVManager] 체크포인트 메타 복원: ${this._checkpoints.size}개`);
    } catch (e) {
      logger.warn('[PrefixKVManager] 체크포인트 복원 실패:', e);
    }
  }

  // ── 내부: 슬롯 배정 ──────────────────────────────────────────────

  /**
   * charId -> 슬롯 번호 배정
   *
   * charId 의미:
   *   0 = 나레이션(narrator), 1 = 유저(user), 2+ = 등장인물(character)
   *   narrator/user는 독립 슬롯이 불필요하므로 항상 slot 0 반환.
   *
   * 슬롯 배정 전략:
   *   slot 0 — 세계관 프리픽스 전용(lockWorldPrefix) + 저사양 단일 생성
   *   slot 1~3 — 등장인물 전용 (n_parallel ≥ 2)
   *
   *   n_parallel=1 (저사양):  모든 charId -> slot 0
   *   n_parallel=2 (중사양):  narrator/user(0,1) -> slot 0
   *                           등장인물(charId≥2) -> slot 1 고정
   *                           [FIX #4] 기존 charId%2 로직은 charId=2 -> slot 0 배정 ->
   *                           세계관 prefix KV를 등장인물 생성이 덮어쓰는 버그.
   *   n_parallel=4 (고사양):  charId 2->slot1, 3->slot2, 4->slot3, 5->slot1 ...
   */
  private _assignSlot(charId: number): number {
    const existing = this._charSlotMap.get(charId);
    if (existing !== undefined) return existing;

    let slotId: number;

    // narrator(0) / user(1): 독립 슬롯 불필요
    if (charId <= 1) {
      slotId = 0;
    } else if (this._nParallelSlots <= 1) {
      slotId = 0;                              // 저사양: 단일 슬롯
    } else if (this._nParallelSlots === 2) {
      slotId = 1;                              // [FIX] 등장인물 전부 slot 1 — slot 0(세계관) 보호
    } else {
      // 고사양 4슬롯: slot 0 = 세계관, slot 1~3 = 등장인물
      slotId = ((charId - 2) % 3) + 1;        // charId 2->1, 3->2, 4->3, 5->1...
    }

    this._charSlotMap.set(charId, slotId);
    logger.log(`[PrefixKVManager] charId=${charId} -> 슬롯 ${slotId} 배정`);
    return slotId;
  }

  // ── 내부: 디렉토리 / GC / 해시 ──────────────────────────────────

  // ✅ [FIX] tmp->rename atomic 저장 헬퍼 (app kill 시 손상 방지)
  private async _atomicSaveSession(dest: string): Promise<void> {
    // [BUG FIX #5] _ctx null 체크 — lockWorldPrefix await 중 release() 레이스 방어
    if (!this._ctx) throw new Error('[PrefixKVManager] context released during save');
    const tmp = dest + '.tmp';
    try {
      await this._ctx.saveSession(tmp);
      const exists = await RNFS.exists(dest).catch(() => false);
      if (exists) await RNFS.unlink(dest).catch(() => {});
      await RNFS.moveFile(tmp, dest);
    } catch (e) {
      await RNFS.unlink(tmp).catch(() => {});
      throw e;
    }
  }

  private async _ensureDir(): Promise<void> {
    if (!(await RNFS.exists(checkpointDir()))) {
      await RNFS.mkdir(checkpointDir());
    }
  }

  /**
   * 만료된 체크포인트 파일 일괄 삭제
   * --ctx-checkpoints 8 에서 MAX_CHECKPOINTS_PER_SLOT로 대응
   *
   * ✅ [FIX] f.mtime이 Date | number 양쪽 가능 — KVStateManager와 동일 패턴 적용
   *    이전: f.mtime?.getTime() — mtime이 number면 getTime() undefined -> 0 반환
   *          -> mtime 체크 무조건 실패 -> 모든 파일 TTL 만료 오판 가능
   *    수정: Date이면 getTime(), number이면 그대로 사용
   */
  private async _gcExpiredCheckpoints(): Promise<void> {
    try {
      const items = await RNFS.readDir(checkpointDir());
      // [BUG FIX #14] .bin.tmp 파일도 GC 대상에 포함
      // 이전: endsWith('.bin')만 필터 -> 앱 kill로 남은 *.bin.tmp 미수거
      //       (SessionManager _gcOrphanBins와 동일한 패턴 버그)
      // 수정: .bin과 .bin.tmp 모두 포함. .bin.tmp는 meta에 절대 참조되지 않으므로
      //       슬롯/TTL 로직을 거치지 않고 즉시 삭제
      const tmpFiles = items.filter(f => f.name.endsWith('.bin.tmp'));
      await Promise.allSettled(tmpFiles.map(f => RNFS.unlink(f.path).catch(() => {})));

      const binFiles = items
        .filter(f => f.name.endsWith('.bin'))
        .sort((a, b) => {
          // ✅ [FIX] mtime Date | number 처리
          // [BUG FIX] inner helper named 'f' shadowed outer sort param -> renamed to 'getMs'
          const getMs = (item: typeof a) => {
            const m = item.mtime;
            if (m instanceof Date) return m.getTime();
            if (typeof m === 'number') return m;
            return 0;
          };
          return getMs(b) - getMs(a);
        });

      // 슬롯별로 분류 후 초과분 삭제
      const bySlot = new Map<number, typeof binFiles>();
      for (const f of binFiles) {
        const match = f.name.match(/prefix_slot(\d+)_/);
        const slot  = match ? parseInt(match[1], 10) : 0;
        const arr   = bySlot.get(slot) ?? [];
        arr.push(f);
        bySlot.set(slot, arr);
      }

      let removed = 0;
      // [FIX #6] 삭제된 경로를 Set으로 추적 → TTL 루프에서 중복 unlink 방지
      const deleted = new Set<string>();
      for (const [_slot, files] of bySlot) {
        // files는 mtime 내림차순(최신→구) 정렬 상태.
        // [BUG FIX] mtime=0인 파일(mtime 읽기 실패)은 정렬 시 맨 뒤(가장 오래된 것으로 오판)에 위치.
        // MAX_CHECKPOINTS_PER_SLOT 초과 삭제에서 mtime=0 파일이 먼저 삭제되면
        // 실제 최신 체크포인트가 지워질 수 있음.
        // 수정: mtime을 신뢰할 수 없는 파일(mtime=0)은 count-based 삭제에서 제외.
        const getMs = (item: typeof files[0]) => {
          const m = item.mtime;
          if (m instanceof Date) return m.getTime();
          if (typeof m === 'number') return m;
          return 0;
        };
        const reliableFiles = files.filter(f => getMs(f) > 0);
        
        // [BUG FIX] mtime=0인 unreliableFiles 중 현재 활성 체크포인트는 삭제에서 제외
        let activePath: string | undefined;
        try {
          const meta = await this._loadCheckpointMeta(_slot);
          if (meta) activePath = meta.path;
        } catch { /* ignore */ }
        
        // [BUG FIX] activePath가 undefined인 경우 활성 체크포인트도 삭제되는 문제 수정
        const unreliableFiles = activePath !== undefined
          ? files.filter(f => getMs(f) === 0 && f.path !== activePath)
          : [];
        // 신뢰 가능한 파일만 MAX 초과분 삭제 (mtime=0 파일 등 보호 대상은 보존)
        const toDelete = reliableFiles.slice(MAX_CHECKPOINTS_PER_SLOT);
        // mtime=0이 너무 많이 누적된 경우 안전하게 일부 정리 (MAX의 2배 초과 시)
        const unreliableToDelete = unreliableFiles.slice(MAX_CHECKPOINTS_PER_SLOT * 2);
        for (const f of [...toDelete, ...unreliableToDelete]) {
          await RNFS.unlink(f.path).catch(() => {});
          deleted.add(f.path);
          removed++;
        }
      }

      // TTL 만료 파일 제거 (이미 삭제된 파일은 건너뜀)
      const now = Date.now();
      for (const f of binFiles) {
        if (deleted.has(f.path)) continue;
        // ✅ [FIX] mtime Date | number 처리
        const mt = f.mtime;
        const mtMs = mt instanceof Date ? mt.getTime()
          : typeof mt === 'number'      ? mt
          : 0;
        // [BUG-35 FIX] mtMs=0(mtime 취득 실패)인 파일은 TTL 판정 불가 → 스킵
        // 이전: mtMs > 0 조건으로 이미 스킵됨 — 정상 동작 확인
        // 단, 슬롯당 MAX 초과분 삭제(위 루프)에서도 mtime=0 파일이 mtime 기준 정렬 시
        // 오래된 것으로 오판될 수 있음. files는 mtime 내림차순이므로 mtMs=0은 최하단.
        if (mtMs > 0 && mtMs < now - CHECKPOINT_TTL_MS) {
          await RNFS.unlink(f.path).catch(() => {});
          // [BUG FIX] TTL 만료 bin 삭제 시 meta 삭제 조건 수정
          // 이전: 항상 _deleteMeta → meta가 살아있는 (TTL 안 만료된) 최신 bin을 가리키는 경우에도 삭제
          // 수정: 해당 슬롯의 meta를 읽어 path가 일치할 때만 삭제 (meta가 다른 파일을 가리키면 유지)
          const slotMatch = f.name.match(/prefix_slot(\d+)_/);
          if (slotMatch) {
            const expiredSlot = parseInt(slotMatch[1], 10);
            const meta = await this._loadCheckpointMeta(expiredSlot);
            if (!meta || meta.path === f.path) {
              // meta가 없거나 이 파일을 가리키고 있으면 같이 삭제
              await this._deleteMeta(expiredSlot);
            }
          }
          removed++;
        }
      }

      if (removed > 0) logger.log(`[PrefixKVManager] GC: ${removed}개 체크포인트 제거`);
    } catch {/* 무시 */}
  }

  private _metaPath(slotId: number): string {
    return `${checkpointDir()}/meta_slot${slotId}.json`;
  }

  /**
   * ✅ [FIX] 체크포인트 메타 저장 실패 시 로그 추가
   * 이전: .catch(() => {}) 로만 처리 -> 저장 실패 원인 파악 불가
   */
  /** @internal — LlamaEngine에서 measureBase 완료 후 meta 갱신에 사용 */
  async _saveCheckpointMetaPublic(slotId: number, cp: PrefixCheckpoint): Promise<void> {
    return this._saveCheckpointMeta(slotId, cp);
  }

  private async _saveCheckpointMeta(slotId: number, cp: PrefixCheckpoint): Promise<void> {
    try {
      await RNFS.writeFile(this._metaPath(slotId), JSON.stringify(cp), 'utf8');
    } catch (e) {
      logger.warn(`[PrefixKVManager] 체크포인트 메타 저장 실패 (slot ${slotId}):`, e);
    }
  }

  private async _loadCheckpointMeta(slotId: number): Promise<PrefixCheckpoint | null> {
    try {
      const raw = await RNFS.readFile(this._metaPath(slotId), 'utf8');
      const meta = JSON.parse(raw) as PrefixCheckpoint;
      // [BUG-9 FIX] prefixTokenCount가 0(sentinel)이면 안전한 512로 보정하여 복원
      if (meta && meta.prefixTokenCount <= 0) {
        meta.prefixTokenCount = 512;
      }
      return meta;
    } catch {
      return null;
    }
  }

  /** ✅ [FIX Bug 32/35] meta JSON 삭제 헬퍼 — TTL 만료·orphaned bin 정리에 사용 */
  private async _deleteMeta(slotId: number): Promise<void> {
    await RNFS.unlink(this._metaPath(slotId)).catch(() => {});
  }

  /**
   * djb2 + FNV-1a 64비트 복합 해시 -> utils/hash.ts 공통 구현 위임
   */
  private _hashPrompt(str: string): string { return hashString(str); }
}

let _prefixKVInstance: PrefixKVManager | null = null;
function getPrefixKVInstance(): PrefixKVManager {
  if (!_prefixKVInstance) _prefixKVInstance = new PrefixKVManager();
  return _prefixKVInstance;
}
export const prefixKVManager = new Proxy({} as PrefixKVManager, {
  get(_t, p) {
    const instance = getPrefixKVInstance();
    if (typeof p === 'symbol') return Reflect.get(instance, p);
    const value = (instance as unknown as Record<string | symbol, unknown>)[p];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
  set(_t, p, v) { (getPrefixKVInstance() as unknown as Record<string | symbol, unknown>)[p] = v; return true; } });
export default prefixKVManager;
