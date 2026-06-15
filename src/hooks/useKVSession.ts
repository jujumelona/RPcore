// src/hooks/useKVSession.ts
// KV Session Manager
//
// KV cache structure (layered):
// ┌────────────────────────────────────────────────
// | [base KV]        initial world config prefill       -> kv_base.bin
// | [story KV]       systemPrompt prefill              -> base.bin (per story)
// | [chapterN prefix] prevSummary + chapterInfo        -> chapter_N.bin
// | [turns]          LlamaEngine.generate() KV growth
// └────────────────────────────────────────────────
//
// Flow: [first entry] 1. loadBase -> 2. lockWorldPrefix -> 3. initChapter(0)
// Flow: [chapter N] 1. loadChapter(idx) -> 2. prevSummary prefill -> 3. saveChapter
// Flow: [chapter change] 1. changeChapter -> 2. kvSession.initChapter(newIdx)

import { useRef, useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import llamaEngine                   from '../core/llama/LlamaEngine';
import kvOffsetTracker                from '../core/llama/KVOffsetTracker';
import kvCacheManager                from '../core/llama/KVCacheManager';
import { kvPath, kvStateManager } from '../core/llama/KVStateManager';
// [BUG FIX] dynamic import 제거 → static import으로 교체 (Metro 번들러 안전성 향상)
import prefixKVManager               from '../core/llama/PrefixKVManager';
import { logger } from '../utils/logger';
import RNFS                          from '../utils/fileSystemCompat';
import type { StoryConfig }          from '../types/StoryContract';
import {
  buildBasePrefillMessages,
  buildKVChapterPrompt,
  buildKVReusablePrefixPayload,
  buildKVPromptLayers,
  getPromptFingerprint,
} from '../utils/PromptEngine';
import {
  MODEL_GENERATION_BUDGET,
  DEFAULT_N_PREDICT,
  type ModelGenerationBudgetKey,
} from '../core/ai/RPGenerationConfig';
// [BUG FIX] ChapterLogTracker 파일 복원: 앱 재시작 후 storyLog 소실 방지
import { chapterLogTracker } from '../utils/ChapterLogTracker';
// [BUG FIX] require('../store/chatStore') → static import.
// 동적 require는 Metro 모듈 로딩 중 빈 객체를 반환할 수 있어
// useChatStore.getState()가 실패 → headChapterIdx=-1 → sentinel 오설정 →
// 복원된 session.bin이 initChapter에 의해 덮어씌워지는 버그.
import { useChatStore } from '../store/chatStore';

import { StoryAPI } from '../api/StoryAPI';
import { authedFetch, useAuthStore } from '../store/authStore';

// ── 타입 ──────────────────────────────────────────────────────────────────────

export type KVPhase =
  | 'idle'
  | 'loading'
  | 'base_ready'
  | 'chapter_ready'
  | 'error';

export interface KVSessionParams {
  modelId:    string;
  storyId:    string;
  serverUrl:  string;
  config:     StoryConfig;
  userName:   string;
  resumeMode?: boolean;
}

export interface UseKVSessionReturn {
  kvPhase:       KVPhase;
  /**
   * session.bin 복원 후 실제 KV 상태의 chapterIdx (React state).
   * -1이면 복원 없었음. 렌더 사이클 이후 최신값 반영.
   */
  restoredChapterIdx: number;
  /**
   * restoredChapterIdx의 ref 버전. initStory() await 직후 동기로 읽을 수 있음.
   * React re-render를 기다리지 않아도 최신값 보장.
   */
  restoredChapterIdxRef: import('react').MutableRefObject<number>;
  currentBasePromptRef: import('react').MutableRefObject<string>;
  currentChapterPromptRef: import('react').MutableRefObject<string>;
  /** initStory pre-init call - model session start */
  initStory:     (params: KVSessionParams) => Promise<void>;
  /** initChapter call (after initStory) */
  initChapter:   (storyId: string, chapterIdx: number, config: StoryConfig, storyLogBlock?: string) => Promise<void>;
  /** changeChapter call */
  changeChapter: (storyId: string, newChapterIdx: number, config: StoryConfig, storyLogBlock?: string) => Promise<void>;
  /** forceRebuildChapterFromBase - rolling KV rebuild */
  rebuildBase:   (params: KVSessionParams) => Promise<void>;
  /**
   * 단챕터 롤맵 요약 전용.
   * loadChapter 캐시를 우회하고 base.bin → prevSummary 포함 chapter prefix 강제 재빌드.
   * config.chapters[chapterIdx].prevSummary 가 이미 업데이트된 상태로 호출할 것.
   */
  forceRebuildChapterFromBase: (storyId: string, chapterIdx: number, config: StoryConfig, storyLogBlock?: string) => Promise<void>;
}

export function shouldUseExactChapterMeasurement(
  exactPrefixTokens?: number,
  nCtx = 0,
): boolean {
  if (typeof exactPrefixTokens !== 'number' || !Number.isFinite(exactPrefixTokens)) {
    return false;
  }
  if (exactPrefixTokens <= 0) return false;
  if (nCtx > 0 && exactPrefixTokens >= nCtx) return false;
  return true;
}

// ── hook ───────────────────────────────────────────────────────────────────────

export function useKVSession(): UseKVSessionReturn {
  // ✅ [FIX] phaseRef(ref) + kvPhaseState(state) 이중 관리
  // phaseRef: 비동기 콜백 내부에서 동기적으로 최신 값 참조 (stale closure 방지)
  // kvPhaseState: React 렌더링 구독 용도 (get kvPhase getter 대신 state 반환)
  const phaseRef       = useRef<KVPhase>('idle');
  const [kvPhaseState, setKvPhaseState] = useState<KVPhase>('idle');

  const currentStoryId = useRef<string | null>(null);
  const isInitializingStoryRef = useRef(false);
  const isChapterInitializingRef = useRef(false);
  const isMountedRef = useRef(true);
  const readyChapterKeyRef = useRef('');
  const baseOffsetKeyRef = useRef('');

  /** phaseRef + state를 동시에 업데이트하는 헬퍼 */
  const setPhase = useCallback((p: KVPhase) => {
    phaseRef.current = p;
    setKvPhaseState(p);
  }, []);


  const waitForStoryInit = useCallback(async (storyId: string, timeoutMs = 12000): Promise<boolean> => {
    const start = Date.now();
    while (isInitializingStoryRef.current && currentStoryId.current === storyId) {
      if (Date.now() - start >= timeoutMs) {
        logger.warn(`[useKVSession] waitForStoryInit timeout: ${storyId}`);
        return false;
      }
      await new Promise<void>(resolve => setTimeout(() => resolve(), 50));
    }
    return !isInitializingStoryRef.current;
  }, [currentStoryId]);

  const appStateSub    = useRef<ReturnType<typeof AppState.addEventListener> | null>(null);
  // [BUG-M2 FIX] session 복원 시 실제 KV chapterIdx를 호출자에게 노출하기 위한 ref
  // [BUG-17 FIX] ref를 직접 반환하면 initStory 완료 후 ref 갱신 시 호출자가 이전 렌더 값(-1)을
  // 읽을 수 있음. state와 ref를 모두 관리:
  //   - ref: initStory/initChapter 내부에서 동기적으로 즉시 접근
  //   - state: React 렌더 사이클에 맞춰 호출자에게 최신값 전달 보장
  const restoredChapterIdxRef = useRef<number>(-1);
  const [restoredChapterIdxState, setRestoredChapterIdxState] = useState<number>(-1);
  const resumeModeRef = useRef(true);
  const currentBasePromptRef = useRef('');
  const currentChapterPromptRef = useRef('');
  // Stored at initStory — available to initChapter for chapter KV download
  const modelIdRef     = useRef<string>('');
  const serverUrlRef   = useRef<string>('');
  const userNameRef    = useRef<string>('');

  // AppState background/inactive: save session hooks
  const mountedStoryIdRef = useRef<string>('');
  const mountedModelIdRef = useRef<string>('');

  const _mountAppStateListener = useCallback((storyId: string, modelId: string) => {
    // [FIX] HTP에서도 autosave 시도 (실패 시 로그로 확인)
    
    // [Bug-6 FIX] 동일 storyId/modelId인 경우 unmount 생략 — 진행 중인 session.bin 저장 보호.
    // story/model이 바뀐 경우에만 unmount 후 re-mount하여 중복 등록을 방지.
    if (mountedStoryIdRef.current === storyId && mountedModelIdRef.current === modelId) {
      return; // 이미 동일 컨텍스트로 마운트됨 — 세션 저장 중단 없이 재사용
    }
    kvStateManager.unmount();
    mountedStoryIdRef.current = storyId;
    mountedModelIdRef.current = modelId;
    kvStateManager.mount(storyId, modelId);
    appStateSub.current = null;
  }, []);

  useEffect(() => {
    return () => {
      kvStateManager.unmount();
    };
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ── 내부: 불변 KV 구성 ──────────────────────────────────────────────────────
  // Build base KV from system prompt
  const _buildBaseKV = useCallback(async (
    storyId: string,
    config:  StoryConfig,
    userName: string,
    modelId: string,
  ): Promise<boolean> => {
    try {
      const layers = buildKVPromptLayers(config, { chapterIndex: 0, userName });
      const systemPrompt = layers.basePrompt;

      // lockWorldPrefix: n_predict:0 completion → KV에 systemPrompt prefill
      // Build base prefix KV in slot 0
      // [BUG FIX] prefixTokenEstimate를 전달하여 n_keep이 충분하도록 설정
      const estimatedTokens = Math.max(Math.ceil(systemPrompt.length / 3.5), 1024);
      await llamaEngine.lockWorldPrefix(systemPrompt, estimatedTokens);

      // [BUG FIX #6] lockWorldPrefix가 이미 measureBase를 호출함 (중복 방지)
      // _doLockWorldPrefix 내부에서 measureBase가 실행됐으므로 baseEnd가 이미 설정됨.
      // baseOffsetKeyRef만 갱신해 _ensureBaseOffsets의 재측정 방지.
      if (kvOffsetTracker.baseEnd <= 0) {
        await kvOffsetTracker.measureBase(systemPrompt).catch(() => {});
      }
      if (kvOffsetTracker.baseEnd > 0) {
        llamaEngine.setUsedTokens(kvOffsetTracker.baseEnd);
      }
      baseOffsetKeyRef.current = `${storyId}:${userName}`;

      // 불변 KV를 base.bin으로 저장 (챕터 전환 시 여기서 복원)


      // [BUG FIX] dynamic import 제거 → static import 사용
      const prefixCheckpoint = prefixKVManager.getPrefixCheckpoint(0);

      if (prefixCheckpoint?.path) {
        await kvStateManager.installBase(storyId, prefixCheckpoint.path, modelId);
        logger.log(`[useKVSession] ✅ 불변 KV 구성 완료 — base.bin 저장: ${storyId}`);
        return true;
      }

      logger.warn('[useKVSession] lockWorldPrefix: model load not ready, skip');
      return false;
    } catch (e) {
      logger.warn('[useKVSession] 불변 KV 구성 실패:', e);
      return false;
    }
  }, []);

  const _buildChapterPrefixText = useCallback((
    chapterIdx: number,
    config: StoryConfig,
    storyLogBlock?: string,   // ChapterLogTracker.toKVBlock() — 런타임 누적 로그 (선택)
  ): string => {
    return buildKVChapterPrompt(config.chapters[chapterIdx], {
      chapterIndex: chapterIdx,
      storyLogBlock,
    });
  }, []);

  const _getKvContentBudget = useCallback((modelId: string): number => {
    return MODEL_GENERATION_BUDGET[modelId as ModelGenerationBudgetKey]?.contentBudget
      ?? (DEFAULT_N_PREDICT - 80);
  }, []);

  const _buildReusableChapterPayload = useCallback((
    chapterIdx: number,
    config: StoryConfig,
    storyLogBlock?: string,
  ) => {
    const basePrompt = buildKVPromptLayers(config, {
      chapterIndex: chapterIdx,
      storyLogBlock,
      userName: userNameRef.current,
    }).basePrompt;
    const chapterPrompt = _buildChapterPrefixText(chapterIdx, config, storyLogBlock);

    return buildKVReusablePrefixPayload({
      config,
      chapterIndex: chapterIdx,
      userName: userNameRef.current,
      context: '',
      contentBudget: _getKvContentBudget(modelIdRef.current),
      basePromptOverride: basePrompt,
      chapterPromptOverride: chapterPrompt,
    });
  }, [_buildChapterPrefixText, _getKvContentBudget]);

  const _ensureBaseOffsets = useCallback(async (
    storyId: string,
    config: StoryConfig,
  ): Promise<void> => {
    const baseOffsetKey = storyId;
    if (baseOffsetKeyRef.current === baseOffsetKey && kvOffsetTracker.baseEnd > 0) return;

    const canReuseLoadedBase =
      currentStoryId.current === storyId &&
      phaseRef.current === 'base_ready' &&
      kvOffsetTracker.baseEnd > 0;
    if (canReuseLoadedBase) {
      if (llamaEngine.getUsedTokens() < kvOffsetTracker.baseEnd) {
        llamaEngine.setUsedTokens(kvOffsetTracker.baseEnd);
      }
      baseOffsetKeyRef.current = baseOffsetKey;
      logger.log(`[useKVSession] 🔍 기존 exact base offset 재사용: ${kvOffsetTracker.baseEnd}`);
      return;
    }

    const systemPrompt = buildKVPromptLayers(config, {
      chapterIndex: 0,
      userName: userNameRef.current,
    }).basePrompt;
    await kvOffsetTracker.measureBase(systemPrompt).catch(() => {});
    if (kvOffsetTracker.baseEnd > 0) {
      llamaEngine.setUsedTokens(kvOffsetTracker.baseEnd);
    }
    baseOffsetKeyRef.current = baseOffsetKey;
  }, []);

  const _measureLoadedChapterOffsets = useCallback(async (
    storyId: string,
    chapterIdx: number,
    config: StoryConfig,
    storyLogBlock?: string,
    exactPrefixTokens?: number,
  ): Promise<void> => {
    await _ensureBaseOffsets(storyId, config);
    const nCtx = llamaEngine.getNCtx();
    const useExactMeasurement = shouldUseExactChapterMeasurement(exactPrefixTokens, nCtx);
    if (useExactMeasurement) {
      kvOffsetTracker.applyMeasuredChapterEnd(exactPrefixTokens, chapterIdx);
      logger.log(
        `[useKVSession] 🔍 actual chapterEnd 적용: ${exactPrefixTokens} ` +
        `(chapter ${chapterIdx})`,
      );
    } else {
      if (typeof exactPrefixTokens === 'number' && exactPrefixTokens > 0) {
        logger.warn(
          `[useKVSession] exact chapterEnd 측정값 거부 — ` +
          `measured=${exactPrefixTokens}, nCtx=${nCtx}. text 기반 측정으로 fallback`,
        );
      }
      // [BUG FIX #20] Unify text builder logic
      const fullPrefixText = _buildChapterPrefixText(chapterIdx, config, storyLogBlock);
      await kvOffsetTracker.measureChapter(fullPrefixText, chapterIdx).catch(() => {});
    }
    await kvOffsetTracker.saveOffsets(storyId).catch(() => {});
    const measuredTokens = kvOffsetTracker.chapterEnd > 0
      ? kvOffsetTracker.chapterEnd
      : kvOffsetTracker.baseEnd;
    if (measuredTokens > 0) {
      llamaEngine.setUsedTokens(measuredTokens);
      logger.log(
        `[useKVSession] 🔍 _usedTokens 동기화: ${measuredTokens} ` +
        `(${kvOffsetTracker.chapterEnd > 0 ? 'chapterEnd' : 'baseEnd'})`,
      );
    }
  }, [_buildChapterPrefixText, _ensureBaseOffsets]);

  // ── 내부: 챕터 prefix prefill ──────────────────────────────────────────────
  // Tags match server _buildKVChapterPrompt exactly (STORY SO FAR/SCENE/GOALS/INTRO)
  const _prefillChapterPrefix = useCallback(async (
    chapterIdx: number,
    config: StoryConfig,
    storyLogBlock?: string,
  ): Promise<number> => {
    const reusablePayload = _buildReusableChapterPayload(chapterIdx, config, storyLogBlock);
    if (!reusablePayload.reusableUserPrefix) {
      logger.log(`[useKVSession] chapter ${chapterIdx} reusable prefix 없음 — baseEnd 유지`);
      return kvOffsetTracker.baseEnd;
    }

    try {
      const exactPrefixTokens = await llamaEngine.prefillMessagesOnly(
        reusablePayload.messages,
        chapterIdx,
      );
      logger.log(
        `[useKVSession] chapter ${chapterIdx} reusable prefix prefilled ` +
        `(${reusablePayload.reusableUserPrefix.length} chars, exact=${exactPrefixTokens})`,
      );
      return exactPrefixTokens;
    } catch (e) {
      logger.warn(`[useKVSession] chapter ${chapterIdx} prefix prefill failed:`, e);
      return 0;
    }
  }, [_buildReusableChapterPayload]);

  const initControllerRef = useRef<AbortController | null>(null);

  // ── initStory ────────────────────────────────────────────────────────────────
  const initStory = useCallback(async (params: KVSessionParams) => {
    // 동일 storyId 중복 차단
    if (isInitializingStoryRef.current) {
      if (currentStoryId.current === params.storyId) {
        logger.warn('[useKVSession] initStory 이미 진행 중 (동일 storyId) — 스킵');
        return;
      }
      logger.warn('[useKVSession] 다른 storyId 전환 — 이전 초기화 강제 중단 후 진행');
    }

    // [Bug-2 FIX] initChapter가 진행 중이면 완료 대기 (KV 동시 수정 방지)
    if (isChapterInitializingRef.current) {
      logger.warn('[useKVSession] initStory: chapter init 진행 중 — 완료 대기');
      const deadline = Date.now() + 5000;
      while (isChapterInitializingRef.current && Date.now() < deadline) {
        await new Promise<void>(r => setTimeout(r, 50));
      }
      if (isChapterInitializingRef.current) {
        logger.warn('[useKVSession] initStory: chapter init timeout — 중단');
        return;
      }
    }

    // 이전 작업 취소
    if (initControllerRef.current) {
      initControllerRef.current.abort();
    }
    const controller = new AbortController();
    initControllerRef.current = controller;
    const signal = controller.signal;

    isInitializingStoryRef.current = true;

    const { modelId, storyId, serverUrl, config, userName, resumeMode = true } = params;
    const shouldResume = resumeMode !== false;
    resumeModeRef.current = shouldResume;
    const safeSetPhase = (p: KVPhase) => {
      if (currentStoryId.current === storyId) setPhase(p);
    };
    currentStoryId.current = storyId;
    safeSetPhase('loading');
    
    userNameRef.current   = userName;
    modelIdRef.current    = modelId;
    serverUrlRef.current  = serverUrl;
    baseOffsetKeyRef.current = '';
    restoredChapterIdxRef.current = -1;
    setRestoredChapterIdxState(-1);

    logger.log(`[useKVSession] initStory 시작: ${storyId}`);
    const releaseAutoSave = kvStateManager.suspendAutoSave('initStory');

    try {
      if (signal.aborted) return;

      const initialLayers = buildKVPromptLayers(config, {
        chapterIndex: 0,
        userName,
      });
      const initialReusablePayload = buildKVReusablePrefixPayload({
        config,
        chapterIndex: 0,
        userName,
        context: '',
        contentBudget: _getKvContentBudget(modelId),
        basePromptOverride: initialLayers.basePrompt,
        chapterPromptOverride: initialLayers.chapterPrompt,
      });
      currentBasePromptRef.current = initialLayers.basePrompt;
      logger.log('[KVPromptCheck] layer fingerprints:', {
        fixedSystemPrompt: getPromptFingerprint(initialLayers.fixedSystemPrompt),
        storyBasePrompt: getPromptFingerprint(initialLayers.storyBasePrompt),
        chapterPrompt: getPromptFingerprint(initialLayers.chapterPrompt),
        userNameOverlay: getPromptFingerprint(initialLayers.userNameOverlay),
        basePrompt: getPromptFingerprint(initialLayers.basePrompt),
        reusableUserPrefix: getPromptFingerprint(initialReusablePayload.reusableUserPrefix),
      });

      // [FIX] 버전 체크를 다운로드 전에 하면 스토리별 KV가 삭제됨
      // 다운로드 후 installBase가 실행되기 전에 파일이 없어지는 문제 방지
      // 버전 체크는 loadBase 시점에서 자동으로 처리됨
      // await kvCacheManager.checkVersionAndPurgeIfNeeded(modelId).catch(e =>
      //   logger.warn('[useKVSession] KV version purge failed (ignored):', e),
      // );

      const _headSession = useChatStore.getState().sessions[storyId];
      const _headChapterIdx = _headSession?.currentChapterIndex ?? 0;
      const _currentChapterId = config.chapters?.[_headChapterIdx]?.id ?? config.chapters?.[0]?.id;
      if (_currentChapterId) {
        chapterLogTracker.loadFromFile(storyId, _currentChapterId).catch(() => {});
      }

      _mountAppStateListener(storyId, modelId);

      let _playRecorded = false;
      const _recordOnce = () => {
        if (_playRecorded) return;
        _playRecorded = true;
        const token = useAuthStore.getState().user?.jwtToken;
        StoryAPI.recordPlay(storyId, token || undefined).catch(() => {});
      };

      const _tryLocalFirstChapterFastPath = async (): Promise<boolean> => {
        const firstChapterId = config.chapters?.[0]?.id;
        if (!firstChapterId) return false;

        if (shouldResume) {
          const hasSessionSnapshot =
            await RNFS.exists(kvPath.session(storyId, modelId)).catch(() => false) ||
            await RNFS.exists(kvPath.sessionPrev(storyId, modelId)).catch(() => false);
          if (hasSessionSnapshot) {
            logger.log('[useKVSession] 🔍 빠른 경로 스킵 — session snapshot 우선');
            return false;
          }
        } else {
          logger.log('[useKVSession] 🔍 새 시작 모드 — session snapshot 무시하고 chapter_1 직로드 우선');
        }

        logger.log(`[useKVSession] 🔍 빠른 경로: 로컬 ${firstChapterId}.bin 직로드 시도`);
        const chapterLoaded = await kvStateManager.loadChapter(storyId, firstChapterId, modelId);
        if (chapterLoaded !== 'ok') {
          logger.log(`[useKVSession] 🔍 빠른 경로 실패 — ${firstChapterId}.bin 결과: ${chapterLoaded}`);
          return false;
        }

        await chapterLogTracker.loadFromFile(storyId, firstChapterId).catch(() => {});
        const storyLogBlock = chapterLogTracker.toKVBlock(storyId, firstChapterId);
        currentChapterPromptRef.current = _buildChapterPrefixText(0, config, storyLogBlock);
        const offsetsLoaded = await kvOffsetTracker.loadOffsets(storyId, 0);
        if (!offsetsLoaded) {
          await _measureLoadedChapterOffsets(storyId, 0, config, storyLogBlock);
        }

        restoredChapterIdxRef.current = 0;
        setRestoredChapterIdxState(0);
        readyChapterKeyRef.current = `${storyId}:0`;
        safeSetPhase('chapter_ready');
        logger.log(`[useKVSession] ✅ 빠른 경로 성공 — ${firstChapterId}.bin 직로드 완료`);
        return true;
      };

      if (shouldResume) {
        if (await _tryLocalFirstChapterFastPath()) {
          return;
        }
      } else {
        logger.log('[useKVSession] 🔍 새 시작 모드 — chapter_1 direct load 비활성화, base -> story base -> chapter 순서 유지');
      }

      // 글로벌 base KV만 확보하고, story/chapter prefix는 모두 로컬 prefill로 구성한다.
      logger.log('[useKVSession] 🔍 다운로드 시작: base KV only');
      const results = await Promise.allSettled([
        kvCacheManager.downloadBaseKVIfNeeded(modelId, serverUrl, _recordOnce),
      ]);
      logger.log('[useKVSession] 🔍 다운로드 완료, results:', results.map((r, i) => `[${i}]: ${r.status}`).join(', '));

      if (signal.aborted || currentStoryId.current !== storyId) {
        logger.log('[useKVSession] 🔍 signal aborted 또는 storyId 변경 감지 — 중단');
        return;
      }

      // ── 2단계: 앱 재시작 복원 시도 (가장 빠른 경로) ──────────────────────────
      if (!shouldResume) {
        logger.log('[useKVSession] 🔍 2단계 스킵 — 새 시작 모드라 session 복원 안 함');
      } else {
        logger.log('[useKVSession] 🔍 2단계: 앱 재시작 복원 시도');
      }
      const engineState = llamaEngine.getState();
      logger.log('[useKVSession] 🔍 현재 엔진 상태:', engineState);
      if (shouldResume && (engineState === 'ready' || engineState === 'warming')) {
        // ✅ [FIX] offset을 먼저 로드해야 session 로드 시 _usedTokens 복원 가능
        const offsetsLoaded = await kvOffsetTracker.loadOffsets(storyId);
        if (!offsetsLoaded) {
          const systemPrompt = buildKVPromptLayers(config, {
            chapterIndex: 0,
            userName: userNameRef.current,
          }).basePrompt;
          await kvOffsetTracker.measureBase(systemPrompt).catch(() => {});
          logger.warn('[useKVSession] offset file missing, measured base offset');
        }

        const restored = await kvStateManager.restoreSession(storyId, modelId);
        if (restored === 'ok') {
          // ✅ [FIX-1] session.bin 복원 성공
          logger.warn('[useKVSession] session restored successfully');
          // [BUG FIX #8] offset 파일 없이 session.bin 복원 성공 시 readyChapterKeyRef 미설정
          // 이전: readyChapterKeyRef = '' (초기값) → initChapter 진입 시 어느 챕터 키와도
          //       매칭 안 됨 → initChapter가 재진입해 chapter.bin/local build로 KV를 덮어씀
          //       → 복원된 session.bin의 대화 히스토리 KV 소실
          // 수정: storyId 기반 sentinel로 채워 initChapter 재진입 차단
          // [BUG FIX] sentinel을 고정 'session_restored' 대신 실제 챕터 idx로 설정
          //       `${storyId}:N` 키와 절대 일치하지 않아 항상 재진입 → session KV 덮어씀
          // 수정: chatStore HEAD에서 headChapterIdx를 읽어 `${storyId}:N` sentinel 설정
          try {
            // [BUG-17 FIX] dynamic import 대신 static import 사용 — Metro 번들러 안전성 향상
            // useChatStore: static import으로 교체 (dynamic require 제거)
            const headSession = useChatStore.getState().sessions[storyId];
            const headChapterIdx = headSession?.currentChapterIndex ?? -1;
            if (headChapterIdx >= 0) {
              restoredChapterIdxRef.current = headChapterIdx;
              setRestoredChapterIdxState(headChapterIdx);
              readyChapterKeyRef.current = `${storyId}:${headChapterIdx}`;
            } else {
              // chatStore에도 없으면 sentinel 유지 (재진입 차단)
              readyChapterKeyRef.current = `${storyId}:session_restored`;
            }
          } catch {
            readyChapterKeyRef.current = `${storyId}:session_restored`;
          }
        } else if (kvOffsetTracker.chapterIdx >= 0) {
          readyChapterKeyRef.current = `${storyId}:${kvOffsetTracker.chapterIdx}`;
        } else {
          // [BUG FIX #1] offsetsLoaded=true인데 chapterIdx=-1인 경우
          // chatStore HEAD에서 실제 챕터 인덱스를 읽어 sentinel 설정
          try {
            // useChatStore: static import으로 교체 (dynamic require 제거)
            const headSession = useChatStore.getState().sessions[storyId];
            const headChapterIdx = headSession?.currentChapterIndex ?? -1;
            if (headChapterIdx >= 0) {
              restoredChapterIdxRef.current = headChapterIdx;
              setRestoredChapterIdxState(headChapterIdx);
              readyChapterKeyRef.current = `${storyId}:${headChapterIdx}`;
            } else {
              readyChapterKeyRef.current = `${storyId}:session_restored`;
            }
          } catch {
            readyChapterKeyRef.current = `${storyId}:session_restored`;
          }
        }
        if (restored === 'ok') {
          logger.log('[useKVSession] ✅ session.bin 복원 성공 — 챕터 이어하기');
          // [BUG-M2 FIX] session 복원 후 restoredChapterIdx를 ref에 저장
          if (kvOffsetTracker.chapterIdx >= 0) {
            restoredChapterIdxRef.current = kvOffsetTracker.chapterIdx;
            setRestoredChapterIdxState(kvOffsetTracker.chapterIdx); // [BUG-17 FIX]
          }
          
          // ✅ [BUG-1 FIX] session.bin 복원 성공 시 loadSession/loadChapter 호출 제거
          // session.bin에 이미 base + chapter + turns가 모두 포함되어 있으므로
          // 추가 loadSession 호출 시 복원된 KV가 덮어써짐
          // 챕터 로그만 복원하고 phase 설정
          const headSession = useChatStore.getState().sessions[storyId];
          const headChapterIdx = headSession?.currentChapterIndex ?? kvOffsetTracker.chapterIdx ?? 0;
          if (headChapterIdx >= 0 && config.chapters?.[headChapterIdx]) {
            const chapterId = config.chapters[headChapterIdx].id;
            const restoredStoryLogBlock = chapterLogTracker.toKVBlock(storyId, chapterId);
            currentChapterPromptRef.current = _buildChapterPrefixText(
              headChapterIdx,
              config,
              restoredStoryLogBlock,
            );
            logger.log(`[useKVSession] 🔍 session 복원 완료 — 챕터 로그만 복원: chapter ${headChapterIdx} (${chapterId})`);
            
            // 챕터 로그 복원 (KV는 이미 session.bin에 포함됨)
            await chapterLogTracker.loadFromFile(storyId, chapterId).catch(() => {});
          }
          
          safeSetPhase('chapter_ready');
          return;   // session restored
        }
      }

      // ── 3단계: 일반 base KV 로드 ───────────────────────────────────────────
      // [FIX] installBase 제거 - 일반 base는 /models/{modelId}/kv_base.bin에서 직접 로드
      // 스토리 base는 /kv_cache/{storyId}/base_{modelId}.bin에 별도 저장
      
      // [무조건 base KV 사용] 실패 시 계속 재시도, 풀 prefill로 넘어가지 않음
      let retryCount = 0;
      const MAX_RETRIES = 10;
      
      while (retryCount < MAX_RETRIES) {
        // 일반 base KV 로드 (모델 폴더에서 직접)
        const generalBasePath = kvCacheManager.getBaseKVPath(modelId);
        const generalBaseExists = await RNFS.exists(generalBasePath).catch(() => false);
        
        if (!generalBaseExists) {
          logger.warn('[useKVSession] 일반 base KV 없음 - 다운로드 시도');
          await kvCacheManager.downloadBaseKVIfNeeded(modelId, serverUrl).catch(() => false);
          if (currentStoryId.current !== storyId) return;
        }
        
        if (await RNFS.exists(generalBasePath).catch(() => false)) {
          try {
            const stat = await RNFS.stat(generalBasePath).catch(() => null);
            logger.log(`[useKVSession] 🔍 일반 base KV 파일 크기: ${stat ? (Number(stat.size) / 1024 / 1024).toFixed(2) : '?'} MB`);
            
            await llamaEngine.loadSession(generalBasePath);
            logger.log('[useKVSession] ✅ 일반 base.bin 로드 완료');
            
            const fullPrompt = buildKVPromptLayers(config, {
              chapterIndex: 0,
              userName: userNameRef.current,
            }).basePrompt;
            let exactBaseTokens = 0;

            logger.log('[useKVSession] 🔍 story base local exact base-turn prefill로 구성');

            logger.log(`[useKVSession] 🔍 story base exact base-turn prefill 시작 (${fullPrompt.length} chars)`);
            try {
              exactBaseTokens = await llamaEngine.prefillMessagesOnly(
                buildBasePrefillMessages(fullPrompt),
                0,
              );
              logger.log(
                `[useKVSession] ✅ story base exact base-turn prefill 완료 ` +
                `(exact=${exactBaseTokens})`,
              );
            } catch (err) {
              logger.error('[useKVSession] ❌ story base exact base-turn prefill 실패:', err);
            }

            const nCtx = llamaEngine.getNCtx();
            const useExactBaseMeasurement = shouldUseExactChapterMeasurement(exactBaseTokens, nCtx);
            if (useExactBaseMeasurement) {
              kvOffsetTracker.applyMeasuredBaseEnd(exactBaseTokens);
              logger.log(`[useKVSession] 🔍 actual baseEnd 적용: ${kvOffsetTracker.baseEnd}`);
            } else {
              if (exactBaseTokens > 0) {
                logger.warn(
                  `[useKVSession] exact baseEnd 측정값 거부 — ` +
                  `measured=${exactBaseTokens}, nCtx=${nCtx}. text 기반 측정으로 fallback`,
                );
              }
              await kvOffsetTracker.measureBase(fullPrompt).catch(() => {});
            }
            if (kvOffsetTracker.baseEnd > 0) {
              llamaEngine.setUsedTokens(kvOffsetTracker.baseEnd);
              logger.log(`[useKVSession] 🔍 base build 후 _usedTokens 동기화: ${kvOffsetTracker.baseEnd}`);
            }
            baseOffsetKeyRef.current = storyId;
             
            safeSetPhase('base_ready');
            return;
          } catch (err) {
            logger.error('[useKVSession] ❌ 일반 base.bin 로드 실패:', err);
          }
        }
        
        retryCount++;
        logger.warn(`[useKVSession] base.bin 로드 실패 (${retryCount}/${MAX_RETRIES}), 재시도 중...`);
        
        // 재다운로드 시도
        await kvCacheManager.downloadBaseKVIfNeeded(modelId, serverUrl).catch(() => false);
        if (currentStoryId.current !== storyId) return;
        
        // 잠시 대기 후 재시도
        await new Promise<void>(resolve => setTimeout(resolve, 1000));
      }
      
      // 최대 재시도 횟수 초과 시 에러 상태로 설정
      logger.error('[useKVSession] base.bin 로드 최대 재시도 횟수 초과');
      safeSetPhase('error');
      return;
    } catch (e) {
      logger.warn('[useKVSession] initStory 오류:', e);
      safeSetPhase('error');
    } finally {
      releaseAutoSave();
      // [BUG FIX] 항상 플래그 해제 (빠른 스토리 전환 시에도 올바르게 처리)
      isInitializingStoryRef.current = false;
    }
  }, [_measureLoadedChapterOffsets, _mountAppStateListener, _buildBaseKV, setPhase]);

  // ── initChapter ──────────────────────────────────────────────────────────────
  const initChapter = useCallback(async (
    storyId:    string,
    chapterIdx: number,
    config:     StoryConfig,
    storyLogBlock?: string,  // [BUG FIX] 누락 파라미터 추가 — chapterEnd 정확 측정용
  ) => {
    const chapterKey = `${storyId}:${chapterIdx}`;
    // ✅ [FIX] 중복 진입 방지: phaseRef 체크 + isBusy ref
    if (phaseRef.current === 'chapter_ready' && readyChapterKeyRef.current === chapterKey) return;
    if (isChapterInitializingRef.current) return;
    if (isInitializingStoryRef.current) {
      const ready = await waitForStoryInit(storyId);
      if (!ready) {
        logger.warn('[useKVSession] initChapter: initStory/rebuildBase still busy after wait');
        return;
      }
    }
    // [BUG FIX] isInitializingStoryRef 가드 — initStory/rebuildBase 실행 중 동시 진입 차단.
    if (isInitializingStoryRef.current) {
      logger.warn('[useKVSession] initChapter: initStory/rebuildBase 진행 중 — 스킵');
      // [BUG FIX #15] changeChapter와 동일하게 throw 대신 명시적 return으로 통일
      // (unhandled rejection 방지 및 일관된 흐름 제어)
      return;
    }
    isChapterInitializingRef.current = true;
    const releaseAutoSave = kvStateManager.suspendAutoSave('initChapter');

    try {
      logger.log(`[useKVSession] 🔍 initChapter 시작: chapter ${chapterIdx}, storyId=${storyId}`);
      logger.log(`[useKVSession] 🔍 modelId=${modelIdRef.current}`);
      
      const chapterId = config.chapters[chapterIdx]?.id ?? `chapter_${chapterIdx + 1}`;
      currentChapterPromptRef.current = _buildChapterPrefixText(chapterIdx, config, storyLogBlock);
      const allowDirectChapterLoad = resumeModeRef.current;
      if (!allowDirectChapterLoad) {
        logger.log(`[useKVSession] 🔍 1단계 스킵: 새 시작 모드라 ${chapterId}.bin 직접 로드 안 함`);
      } else {
        // ── 1단계: 로컬에 있는 챕터 KV 로드 (이어하기 전용 빠른 경로) ─────────
        logger.log(`[useKVSession] 🔍 1단계: 로컬 ${chapterId}.bin 로드 시도`);
        const chapterLoaded = await kvStateManager.loadChapter(storyId, chapterId, modelIdRef.current);
        logger.log(`[useKVSession] 🔍 loadChapter 결과: ${chapterLoaded}`);

        if (chapterLoaded === 'ok') {
          logger.log(`[useKVSession] 🔍 ${chapterId}.bin 로드 성공 — offset 복원 시도`);
          const offsetsLoaded = await kvOffsetTracker.loadOffsets(storyId, chapterIdx);
          if (!offsetsLoaded) {
            logger.log(`[useKVSession] 🔍 offset 파일 없음 — 측정 시작`);
            await _measureLoadedChapterOffsets(storyId, chapterIdx, config, storyLogBlock);
          }
          logger.log(`[useKVSession] ✅ local ${chapterId}.bin + offsets loaded`);
          readyChapterKeyRef.current = chapterKey;
          setPhase('chapter_ready');
          return;
        }

        logger.log(`[useKVSession] 🔍 로컬 chapter.bin 없음 — 2단계로 진행`);
      }

      // ── 2단계: 서버 chapter KV 확인/다운로드 없이 곧바로 base에서 로컬 구성 ─────
      logger.log(`[useKVSession] 🔍 2단계: 서버 chapter KV 다운로드 생략 — 로컬 base에서 구성`);

      // ── 3단계: base.bin에서 챕터 prefix 로컬 구성 ───────────────────
      logger.log(`[useKVSession] 🔍 3단계: base.bin에서 로컬 구성 시작`);
      // ✅ [FIX] storyId 일치 확인 추가
      // 이전: 다른 storyId에서의 'chapter_ready' 또는 'base_ready'도 base가 있다고 가정
      //       → storyId A의 chapter_ready 상태에서 storyId B의 initChapter 호출 시
      //         loadBase 스킵 → B의 base.bin 없는데도 진행 → KV 상태 오염
      // [BUG FIX #4] chapter_ready를 phaseAlreadyHasBase 조건에서 제거
      // chapter_ready 상태(챕터5)에서 새 챕터 initChapter 호출 시 loadBase 스킵하면
      // 챕터5 KV 위에 새 챕터 prefix prefill → KV 레이어 구조 오염
      // base_ready 상태일 때만 base가 엔진에 올라와 있다는 보장이 됨
      const isSameStory = currentStoryId.current === storyId;
      const phaseAlreadyHasBase =
        isSameStory &&
        phaseRef.current === 'base_ready';

      logger.log(`[useKVSession] 🔍 phaseAlreadyHasBase=${phaseAlreadyHasBase}, isSameStory=${isSameStory}, phase=${phaseRef.current}`);

      if (!phaseAlreadyHasBase) {
        logger.log(`[useKVSession] 🔍 base.bin 로드 필요 — loadBase 호출`);
        const baseLoaded = await kvStateManager.loadBase(storyId, modelIdRef.current);
        logger.log(`[useKVSession] 🔍 loadBase 결과: ${baseLoaded}`);
        
        if (baseLoaded !== 'ok') {
          logger.warn('[useKVSession] base.bin 없음 → error 폴백');
          setPhase('error');
          return;
        }
        logger.log(`[useKVSession] 🔍 base.bin 로드 성공`);
      } else {
        logger.log(`[useKVSession] 🔍 base.bin 이미 로드됨 — 스킵`);
      }

      logger.log(`[useKVSession] 🔍 base offset 확인 시작`);
      await _ensureBaseOffsets(storyId, config);
      logger.log(`[useKVSession] 🔍 base offset 확인 완료 — chapter prefix prefill 시작`);
      
      const exactPrefixTokensInit = await _prefillChapterPrefix(chapterIdx, config, storyLogBlock);
      if (exactPrefixTokensInit <= 0) { 
        logger.warn(`[useKVSession] ❌ chapter prefix prefill 실패`);
        setPhase('error'); 
        return; 
      }
      logger.log(`[useKVSession] 🔍 chapter prefix prefill 완료 — saveChapter 시작`);
      // [BUG FIX #20] _prefillChapterPrefix가 userNameOverlay + promptRules까지 포함하므로
      // chapter prefix 이후 중복 prefill을 하지 않는다.

      try {
        await kvStateManager.saveChapter(storyId, chapterId, modelIdRef.current);
        logger.log(`[useKVSession] 🔍 saveChapter 완료 — offset 측정 시작`);
        
        await _measureLoadedChapterOffsets(
          storyId,
          chapterIdx,
          config,
          storyLogBlock,
          exactPrefixTokensInit,
        );
        logger.log(`[useKVSession] ✅ chapter_${chapterIdx}.bin + offsets saved (local build)`);
      } catch (e) {
        logger.warn('[useKVSession] saveChapter failed (ignored):', e);
        await _measureLoadedChapterOffsets(
          storyId,
          chapterIdx,
          config,
          storyLogBlock,
          exactPrefixTokensInit,
        ).catch(() => {});
      }

      readyChapterKeyRef.current = chapterKey;
      setPhase('chapter_ready');
      logger.log(`[useKVSession] ✅ initChapter 완료: chapter ${chapterIdx}`);
    } finally {
      releaseAutoSave();
      isChapterInitializingRef.current = false;
    }
  }, [_ensureBaseOffsets, _measureLoadedChapterOffsets, _prefillChapterPrefix, setPhase, waitForStoryInit]);

  // ── changeChapter ──────────────────────────────────────────────────────────
  // 챕터 전환: 챕터N 이후 KV 전부 버리고 불변 KV → 새 챕터 prefix
  const changeChapter = useCallback(async (
    storyId: string,
    newChapterIdx: number,
    config: StoryConfig,
    storyLogBlock?: string,
  ) => {
    const chapterKey = `${storyId}:${newChapterIdx}`;
    if (phaseRef.current === 'chapter_ready' && readyChapterKeyRef.current === chapterKey) {
      return;
    }

    if (isInitializingStoryRef.current) {
      const ready = await waitForStoryInit(storyId);
      if (!ready) {
        logger.warn('[useKVSession] changeChapter: initStory/rebuildBase still busy after wait');
        return;
      }
    }

    if (isInitializingStoryRef.current) {
      logger.warn('[useKVSession] changeChapter: initStory/rebuildBase still in progress');
      return;
    }

    if (isChapterInitializingRef.current) {
      logger.warn('[useKVSession] changeChapter: chapter init/change already in progress');
      return;
    }

    isChapterInitializingRef.current = true;
    setPhase('loading');
    logger.log(`[useKVSession] changeChapter -> chapter ${newChapterIdx}`);

    try {
      // [FIX] HTP에서도 chapter.bin 로드 시도
      
      const chapterLoaded = await kvStateManager.loadChapter(storyId, newChapterIdx, modelIdRef.current);
      if (chapterLoaded === 'ok') {
        currentChapterPromptRef.current = _buildChapterPrefixText(newChapterIdx, config, storyLogBlock);
        const offsetsLoaded = await kvOffsetTracker.loadOffsets(storyId, newChapterIdx);
        if (!offsetsLoaded) {
          await _measureLoadedChapterOffsets(storyId, newChapterIdx, config, storyLogBlock);
        }
        logger.log(`[useKVSession] changeChapter -> chapter ${newChapterIdx} loaded, KV + offsets restored`);
        readyChapterKeyRef.current = chapterKey;
        setPhase('chapter_ready');
        return;
      }

      await llamaEngine.softReset([]);
      let baseLoaded = await kvStateManager.loadBase(storyId, modelIdRef.current);
      if (baseLoaded !== 'ok') {
        logger.warn('[useKVSession] chapter change failed to load base.bin, attempting to rebuild base...');
        const built = await _buildBaseKV(storyId, config, userNameRef.current, modelIdRef.current);
        if (!built) {
          logger.warn('[useKVSession] chapter change failed: could not rebuild base');
          setPhase('error');
          return;
        }
        baseLoaded = 'ok';
      }

      await _ensureBaseOffsets(storyId, config);

      currentChapterPromptRef.current = _buildChapterPrefixText(newChapterIdx, config, storyLogBlock);
      const exactPrefixTokensChange = await _prefillChapterPrefix(newChapterIdx, config, storyLogBlock);
      if (exactPrefixTokensChange <= 0) {
        setPhase('error');
        return;
      }

      try {
        await kvStateManager.saveChapter(storyId, newChapterIdx, modelIdRef.current, true);
        await _measureLoadedChapterOffsets(
          storyId,
          newChapterIdx,
          config,
          storyLogBlock,
          exactPrefixTokensChange,
        );
      } catch (e) {
        logger.warn('[useKVSession] saveChapter(new) failed, continuing with measured offsets:', e);
        await _measureLoadedChapterOffsets(
          storyId,
          newChapterIdx,
          config,
          storyLogBlock,
          exactPrefixTokensChange,
        ).catch(() => {});
      }

      readyChapterKeyRef.current = chapterKey;
      setPhase('chapter_ready');
      logger.log(`[useKVSession] changeChapter complete: chapter ${newChapterIdx}`);
    } finally {
      isChapterInitializingRef.current = false;
    }
  }, [_buildBaseKV, _ensureBaseOffsets, _measureLoadedChapterOffsets, _prefillChapterPrefix, setPhase, waitForStoryInit]);

  // ── rebuildBase ────────────────────────────────────────────────────────────
  const rebuildBase = useCallback(async (params: KVSessionParams) => {
    const { storyId, config, userName } = params;
    // [BUG FIX #11] isInitializingStoryRef 가드 — initStory와 동시 실행 시 KV 충돌 방지.
    // forceRebuildChapterFromBase/initChapter와의 경쟁도 isChapterInitializingRef로 방어.
    if (isInitializingStoryRef.current) {
      logger.warn('[useKVSession] rebuildBase: initStory 진행 중 — 스킵');
      return;
    }
    if (isChapterInitializingRef.current) {
      logger.warn('[useKVSession] rebuildBase: chapter 초기화 진행 중 — 스킵');
      return;
    }
    isInitializingStoryRef.current = true;
    setPhase('loading');
    readyChapterKeyRef.current = '';
    baseOffsetKeyRef.current = '';
    logger.log('[useKVSession] rebuildBase: 불변 KV 재구성 시작');

    try {
      const built = await _buildBaseKV(storyId, config, userName, params.modelId);
      setPhase(built ? 'base_ready' : 'error');
    } finally {
      isInitializingStoryRef.current = false;
    }
  }, [_buildBaseKV, setPhase]);


  // =========================================================
  // forceRebuildChapterFromBase
  // Single-chapter rolling KV: loadChapter 쿼시 우회하고
  // base.bin → prevSummary 포함 chapter prefix 강제 재빌드.
  // =========================================================
  const forceRebuildChapterFromBase = useCallback(async (
    storyId: string,
    chapterIdx: number,
    config: StoryConfig,
    storyLogBlock?: string,
  ): Promise<void> => {
    const chapterKey = `${storyId}:${chapterIdx}`;
    if (isChapterInitializingRef.current) {
      return;
    }
    if (isInitializingStoryRef.current) {
      logger.warn('[useKVSession] forceRebuildChapterFromBase: initStory/rebuildBase still in progress');
      return;
    }

    isChapterInitializingRef.current = true;
    setPhase('loading');
    logger.log(`[useKVSession] forceRebuildChapterFromBase: chapter ${chapterIdx}`);

    try {
      // [FIX] HTP에서도 정상 경로 사용
      
      await llamaEngine.softReset([]);
      let baseLoaded = await kvStateManager.loadBase(storyId, modelIdRef.current);
      if (baseLoaded !== 'ok') {
        logger.warn('[useKVSession] forceRebuildChapterFromBase: base.bin missing, attempting to rebuild base...');
        const built = await _buildBaseKV(storyId, config, userNameRef.current, modelIdRef.current);
        if (!built) {
          logger.warn('[useKVSession] forceRebuildChapterFromBase failed: could not rebuild base');
          setPhase('error');
          return;
        }
        baseLoaded = 'ok';
      }

      await _ensureBaseOffsets(storyId, config);

      currentChapterPromptRef.current = _buildChapterPrefixText(chapterIdx, config, storyLogBlock);
      const exactPrefixTokensRebuild = await _prefillChapterPrefix(chapterIdx, config, storyLogBlock);
      if (exactPrefixTokensRebuild <= 0) {
        setPhase('error');
        return;
      }

      try {
        await kvStateManager.saveChapter(storyId, chapterIdx, modelIdRef.current);
        await _measureLoadedChapterOffsets(
          storyId,
          chapterIdx,
          config,
          storyLogBlock,
          exactPrefixTokensRebuild,
        );
        logger.log(`[useKVSession] forceRebuildChapterFromBase complete: chapter_${chapterIdx}.bin saved`);
      } catch (e) {
        logger.warn('[useKVSession] forceRebuildChapterFromBase saveChapter failed, continuing with measured offsets:', e);
        await _measureLoadedChapterOffsets(
          storyId,
          chapterIdx,
          config,
          storyLogBlock,
          exactPrefixTokensRebuild,
        ).catch(() => {});
      }

      readyChapterKeyRef.current = chapterKey;
      setPhase('chapter_ready');
    } finally {
      isChapterInitializingRef.current = false;
    }
  }, [_buildBaseKV, _ensureBaseOffsets, _measureLoadedChapterOffsets, _prefillChapterPrefix, setPhase]);

  return {
    kvPhase: kvPhaseState,
    restoredChapterIdx: restoredChapterIdxState,
    restoredChapterIdxRef,  // [Bug-1 FIX] ref 직접 노출 — initStory await 후 동기 접근 가능
    currentBasePromptRef,
    currentChapterPromptRef,
    initStory,
    initChapter,
    changeChapter,
    rebuildBase,
    forceRebuildChapterFromBase };
}
