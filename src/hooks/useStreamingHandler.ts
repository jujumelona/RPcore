// src/hooks/useStreamingHandler.ts
// ─────────────────────────────────────────────────────────────
// 스트리밍 버블 관리 훅
//
// ── 수정 내역 ─────────────────────────────────────────────────
// [FIX] rafTimerRef 타입 통일: ReturnType<typeof setTimeout> → number | null
//   requestAnimationFrame은 number를 반환하므로 타입 불일치 수정.
//   스트리밍 호출부와 동일한 전달 타입에 맞춤.
// ─────────────────────────────────────────────────────────────

import { useRef, useCallback, useEffect } from 'react';
import { SmoothTokenBuffer } from '../core/streaming/SmoothTokenBuffer';
import { getRpSamplingDefaults } from '../core/ai/RPGenerationConfig';
import { useSettingsStore } from '../store/settingsStore';
import { useModelStore } from '../store/modelStore';
import llamaEngine from '../core/llama/LlamaEngine';
import { checkStreamingSafety } from '../filter/ContentSafetyLayer';
import type { Message, FullCharacter, DeviceTier } from '../screens/chat/types/ChatTypes';

type EngineStreamResult = {
  shouldTrim?: boolean;
  historyTurns?: number;
  finishReason?: string;
  tokensPerSecond?: number;
  tokensPredicted?: number;
  tokensEvaluated?: number;
  tokensCached?: number;
  contextFull?: boolean;
  interrupted?: boolean;
  truncated?: boolean;
  stopWord?: string;
};

interface StreamingHandlerParams {
  isMountedRef:       React.MutableRefObject<boolean>;
  flatListRef:        React.MutableRefObject<any>;
  rafTimerRef:        React.MutableRefObject<number | null>; // [FIX] number (rAF handle)
  fullChars:          FullCharacter[];
  setMessages:        React.Dispatch<React.SetStateAction<Message[]>>;
  setStreamingBubble: React.Dispatch<React.SetStateAction<Message | null>>;
}

export interface StreamResult {
  fullRawText: string;
  shouldTrimHistory: boolean;
  historyTurnsCount: number;
  finishReason?: EngineStreamResult['finishReason'];
  tokensPerSecond?: EngineStreamResult['tokensPerSecond'];
  tokensPredicted?: EngineStreamResult['tokensPredicted'];
  tokensEvaluated?: EngineStreamResult['tokensEvaluated'];
  tokensCached?: EngineStreamResult['tokensCached'];
  contextFull?: EngineStreamResult['contextFull'];
  interrupted?: EngineStreamResult['interrupted'];
  truncated?: EngineStreamResult['truncated'];
  stopWord?: EngineStreamResult['stopWord'];
}

export function useStreamingHandler({
  isMountedRef,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  flatListRef: _flatListRef, // scroll은 상위 스트리밍 경로에서 직접 처리 — 여기선 미사용
  rafTimerRef,
  fullChars,
  setMessages,
  setStreamingBubble }: StreamingHandlerParams) {
  const streamAccRef       = useRef('');
  const activeModelId      = useModelStore(s => s.activeModelId);
  const streamingTyping    = useSettingsStore(s => s.streamingTyping);
  const streamMsgIdRef     = useRef('');
  const rafPendingRef      = useRef(false);
  const streamingBubbleRef = useRef<Message | null>(null);
  // ✅ [FIX #2] 메시지 간 delay setTimeout 취소 핸들러 ref
  // runTypingReveal() 루프 내 await new Promise(r => setTimeout(r, delayMs)) 는
  // 언마운트 후 break로 루프를 탈출해도 이미 예약된 타이머가 남아 GC를 지연시킴.
  // cancelDelayRef에 clearTimeout 함수를 저장해두고 cleanup에서 즉시 호출.
  const cancelDelayRef     = useRef<(() => void) | null>(null);
  // ✅ [FIX] 스트리밍 중 언마운트 시 SmoothTokenBuffer drainTimer 정리
  const activeSmoothBufRef = useRef<SmoothTokenBuffer | null>(null);
  // [BUG FIX] drip 루프 내 setTimeout 핸들 저장 — 언마운트 시 취소 가능
  const dripTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const speakerAvatarCache = useRef(
    new Map<number, { name: string; url: string }>(
      (fullChars ?? []).map(c => [c.id, { name: c.name, url: c.profileUrl }]),
    ),
  );

  useEffect(() => {
    speakerAvatarCache.current = new Map(
      (fullChars ?? []).map(c => [c.id, { name: c.name, url: c.profileUrl }]),
    );
  }, [fullChars]);

  // ✅ [FIX] 언마운트 시 RAF 강제 취소
  // isMountedRef.current = false로 콜백 내 실행은 막히지만,
  // RAF 자체는 예약된 상태로 남아 다음 vsync에 한 번 더 실행됨.
  // 언마운트 후 setMessages 호출 → React "setState on unmounted" 경고 발생.
  // cancelAnimationFrame으로 예약 자체를 취소하여 완전 차단.
  useEffect(() => {
    return () => {
      if (rafTimerRef.current !== null) {
        cancelAnimationFrame(rafTimerRef.current);
        rafTimerRef.current = null;
      }
      // ✅ [FIX #2] 언마운트 시 메시지 간 delay 타이머도 즉시 취소
      cancelDelayRef.current?.();
      cancelDelayRef.current = null;
      // [BUG FIX] drip 루프 setTimeout 취소
      if (dripTimerRef.current !== null) {
        clearTimeout(dripTimerRef.current);
        dripTimerRef.current = null;
      }
      // ✅ [FIX] 언마운트 시 SmoothTokenBuffer drainTimer 강제 취소
      const activeBuf = activeSmoothBufRef.current;
      activeBuf?.cancel();
      activeBuf?.destroy();
      activeSmoothBufRef.current = null;
      // 스트리밍 버블 잔류 방지
      streamingBubbleRef.current = null;
    };
  // rafTimerRef, streamingBubbleRef는 ref이므로 deps 불필요 (참조 불변)
  // eslint-disable-next-line
  }, []);

  const detectSpeakerFromAccumulated = useCallback(
    (accumulated: string): number | null => {
      const lines = accumulated.split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i]?.trimStart();
        // [BUG FIX] `\d+:` 패턴이 대사 내 숫자(예: "2번째 사람이")와 오매칭 방지
        // 기존: /^(\d+):/ → 줄 앞의 숫자:만 매칭 (trimStart 전)하지만 공백 후 숫자도 매칭
        // 수정: 줄 시작에서 1~2자리 숫자 + 콜론 + 공백/내용 형식만 허용
        //   캐릭터 ID는 보통 0~99 범위이므로 3자리 이상 숫자는 제외
        const m = line?.match(/^(\d{1,2}):\s/);
        if (m) {
          const sid = Number(m[1]);
          if (sid >= 2 && speakerAvatarCache.current.has(sid)) return sid;
        }
      }
      return null;
    },
    [],
  );

  // ── 1단계: raw 스트리밍 (SmoothTokenBuffer 적용) ────────────
  //
  // ✅ 핵심 변경:
  //   기존: 토큰 도착 → RAF → 즉시 렌더 (생성속도 = 렌더속도)
  //   신규: 토큰 도착 → SmoothTokenBuffer → 균일한 속도로 렌더
  //
  //   Google Bard / TokenFlow(arXiv:2510.02758) 동일 전략:
  //   "버퍼에 토큰을 쌓고 사람 읽기 속도로 방출 → 불규칙 생성이 부드럽게 보임"
  //
  //   결과:
  //   · 뚝뚝 끊기던 텍스트 → 균일하게 흐르는 텍스트
  //   · 열 스로틀링으로 갑자기 느려져도 버퍼가 완충
  //   · 버퍼 고수위 시 자동 가속 → 지연 누적 없음
  const runRawStream = useCallback(
    async (
      rawMsgId: string,
      setId: string,
      fullPrompt: string,
      maxTokens?: number,
      perfSession?: { markFirstToken: () => void; onToken: () => void },
      logitBias?: Array<[number | string, number | false]>,
    ): Promise<StreamResult> => {
      const firstChar = fullChars[0];
      let detectedSpeakerId = firstChar?.id ?? 2;
      const pendingSpeakerRef   = { current: null as { name: string; url: string } | null };
      const pendingSpeakerIdRef = { current: detectedSpeakerId };

      const rawMsg: Message = {
        id: rawMsgId, role: 'ai', content: '',
        characterId:         firstChar ? String(firstChar.id) : undefined,
        characterName:       firstChar?.name,
        characterProfileUrl: firstChar?.profileUrl ?? '',
        timestamp: Date.now(), setId, isStreaming: true };
      setMessages(prev => [...prev, rawMsg]);

      streamAccRef.current   = '';
      streamMsgIdRef.current = rawMsgId;
      rafPendingRef.current  = false;

      let fullRawText       = '';
      let shouldTrimHistory = false;
      let historyTurnsCount = 0;
      let finishReason: StreamResult['finishReason'];
      let tokensPerSecond: number | undefined;
      let tokensPredicted: number | undefined;
      let tokensEvaluated: number | undefined;
      let tokensCached: number | undefined;
      let contextFull: boolean | undefined;
      let interrupted: boolean | undefined;
      let truncated: boolean | undefined;
      let stopWord: string | undefined;
      let firstTokenSeen = false;
      let tokenCounter = 0;

      // ── SmoothTokenBuffer: 렌더 드레이너 ──────────────────────
      // 버퍼에서 꺼낸 청크를 UI에 반영. isMountedRef 검사 필수.
      // [BUG FIX] 드레인 완료 추적 플래그 — bufferLength=0만으로는 드레이너가
      // onDrain('', true) 콜백을 아직 실행하지 않은 상태일 수 있어 early-exit 경쟁 발생.
      // isDrainComplete=true가 되어야 버퍼 대기 루프가 안전하게 resolve됨.
      let isDrainComplete = false;
      const smoothBuf = new SmoothTokenBuffer(
        (drainChunk, isDone) => {
          if (!isMountedRef.current) return;
          if (isDone) isDrainComplete = true;
          const pendingSpk   = pendingSpeakerRef.current;
          const pendingSpkId = pendingSpeakerIdRef.current;
          pendingSpeakerRef.current = null;

          setMessages(prev =>
            prev.map(m => {
              if (m.id !== rawMsgId) return m;
              const spkUpdate = pendingSpk
                ? { characterId: String(pendingSpkId), characterName: pendingSpk.name, characterProfileUrl: pendingSpk.url }
                : {};
              return {
                ...m,
                ...spkUpdate,
                content: drainChunk ? m.content + drainChunk : m.content,
                isStreaming: !isDone };
            }),
          );
        },
      );
      activeSmoothBufRef.current = smoothBuf;

      // ── 생성 스트림 ────────────────────────────────────────────
      await new Promise<void>((resolve, reject) => {
        llamaEngine.generate(
          [{ role: 'user', content: fullPrompt }],
          {
            maxTokens,
            useRpGrammar: true,
            ...getRpSamplingDefaults(activeModelId),
            ...(logitBias ? { logitBias } : {}),
            onToken: (chunk: string) => {
              // 원문 축적 (파싱/히스토리 트림용) — 렌더와 무관
              fullRawText += chunk;
              if (!firstTokenSeen) {
                firstTokenSeen = true;
                perfSession?.markFirstToken();
              }
              perfSession?.onToken();
              tokenCounter++;

              // 주기적(50토큰마다) 콘텐츠 안전 체크 (Bug 3)
              if (tokenCounter % 50 === 0) {
                // [BUG FIX #7] 전체 텍스트 대신 최근 생성된 150자만 검사하여 연산량 선형 증가 방지
                const tailText = fullRawText.slice(-150);
                const { shouldStop } = checkStreamingSafety(tailText);
                if (shouldStop) {
                  llamaEngine.stopGeneration();
                }
              }

              // 화자 감지 (기존 로직 유지)
              if (chunk.includes('\n') || chunk.includes(':')) {
                const newSpeaker = detectSpeakerFromAccumulated(fullRawText);
                if (newSpeaker !== null && newSpeaker !== detectedSpeakerId) {
                  detectedSpeakerId = newSpeaker;
                  pendingSpeakerRef.current   = speakerAvatarCache.current.get(newSpeaker) ?? null;
                  pendingSpeakerIdRef.current = newSpeaker;
                }
              }

              // 버퍼에 투입 (렌더는 드레이너가 독립적으로 처리)
              smoothBuf.push(chunk);
            } },
        ).then((_result) => {
          // llamaEngine.generate returns the full text; extract metadata from lastCompletionMeta
          const meta = llamaEngine.getLastCompletionMeta();
          // [BUG-021 FIX] shouldTrimHistory / historyTurnsCount 항상 false/0 하드코딩 수정.
          // 이전: shouldTrimHistory = false; historyTurnsCount = 0; 으로 하드코딩
          //   → 구형 trimHistory / softReset 경로가 완전한 dead code
          //   → KV 압박 시 대화 기록이 무한 누적
          // 수정: KV 사용률 기반으로 shouldTrimHistory 결정
          //   getNCtx() > 0 이고 usedTokens/nCtx >= 0.75 이면 trim 트리거
          {
            const _nCtx = llamaEngine.getNCtx();
            const _used = llamaEngine.getUsedTokens();
            const _pressure = _nCtx > 0 ? _used / _nCtx : 0;
            shouldTrimHistory = _pressure >= 0.75;
            historyTurnsCount = _nCtx > 0 ? Math.round(_pressure * 10) : 0;
          }
          finishReason = meta?.finishReason;
          tokensPerSecond = meta?.tokensPerSecond ?? undefined;
          tokensPredicted = meta?.tokensPredicted;
          tokensEvaluated = meta?.tokensEvaluated;
          tokensCached    = meta?.tokensCached;
          contextFull     = meta?.contextFull;
          interrupted     = meta?.interrupted;
          truncated       = meta?.truncated;
          stopWord        = meta?.stopWord;
          smoothBuf.finish(); // 생성 완료 신호
          resolve();
        }).catch((err: unknown) => {
          smoothBuf.cancel();
          smoothBuf.destroy();
          if (activeSmoothBufRef.current === smoothBuf) {
            activeSmoothBufRef.current = null;
          }
          reject(err);
        });
      });

      // 생성 완료 후 버퍼 소진 대기 (최대 8초)
      // 드레이너가 isDone=true와 함께 onDrain을 호출할 때까지
      // [BUG FIX] bufferLength===0 만으로는 onDrain('',true) 미실행 상태에서 early-exit 가능
      // isDrainComplete 플래그가 true가 될 때까지 대기
      await new Promise<void>(resolve => {
        const deadline = Date.now() + 8000;
        const check = () => {
          if (!isMountedRef.current || isDrainComplete || Date.now() > deadline) {
            // [BUG FIX] 대기 완료 시 rafTimerRef 클리어
            // resolve() 직전에 null로 초기화하지 않으면 언마운트 cleanup에서
            // 이미 실행이 끝난 RAF 핸들을 cancelAnimationFrame에 넘겨 stale 핸들 오취소 발생.
            rafTimerRef.current = null;
            resolve();
            return;
          }
          rafTimerRef.current = requestAnimationFrame(check);
        };
        check();
      });

      smoothBuf.destroy();
      if (activeSmoothBufRef.current === smoothBuf) {
        activeSmoothBufRef.current = null;
      }

      return {
        fullRawText,
        shouldTrimHistory,
        historyTurnsCount,
        finishReason,
        tokensPerSecond,
        tokensPredicted,
        tokensEvaluated,
        tokensCached,
        contextFull,
        interrupted,
        truncated,
        stopWord };
    },
    [activeModelId, fullChars, isMountedRef, rafTimerRef, detectSpeakerFromAccumulated, setMessages],
  );

  // ── 2단계: 타이핑 연출 ───────────────────────────────────────
  const runTypingReveal = useCallback(
    async (
      lines: any[],
      setId: string,
      deviceTier: DeviceTier,
    ): Promise<{ finalAiMessages: Message[]; aiDialogueLines: string[]; wasInterrupted: boolean }> => {
      const finalAiMessages: Message[] = [];
      const aiDialogueLines: string[]  = [];
      const skipRetyping = !streamingTyping || deviceTier === 'low' || deviceTier === 'mid';
      // ── [FIX #9] wasInterrupted 플래그 ──────────────────────
      // runTypingReveal 중 언마운트되면 partial finalAiMessages가 반환됨.
      // 기존: 호출부에서 isMountedRef만 재확인 → 체크 직전에 일부 csAddMessage가
      //       이미 실행된 상태일 수 있어 DB에 불완전한 메시지가 저장됨.
      // 수정: wasInterrupted=true면 호출부에서 DB 저장 자체를 건너뜀.
      let wasInterrupted = false;

      if (skipRetyping) {
        const nowMs = Date.now();
        for (let i = 0; i < lines.length; i++) {
          if (!isMountedRef.current) { wasInterrupted = true; break; }
          const line     = lines[i];
          if (!line) continue;
          const charInfo = speakerAvatarCache.current.get(line.speakerId);
          const completedMsg: Message = {
            id: `msg_${nowMs}_${i}`, role: line.role, content: line.content,
            characterId:         line.role === 'ai' ? String(line.speakerId) : undefined,
            characterName:       line.role === 'ai' ? line.speakerName : undefined,
            characterProfileUrl: line.role === 'ai' ? (charInfo?.url ?? '') : undefined,
            timestamp: nowMs + i, setId, isStreaming: false,
            actionPrefix: line.actionPrefix, narratorType: line.narratorType };
          finalAiMessages.push(completedMsg);
          aiDialogueLines.push(`${line.speakerId}:${line.content}`);
        }
        if (isMountedRef.current) {
          setMessages(prev => [...prev, ...finalAiMessages]);
        }
      } else {
        for (let i = 0; i < lines.length; i++) {
          // ✅ [FIX] break 전에 streamingBubbleRef / streamingBubble 명시적 정리
          // 기존: break만 하고 정리 코드(null 할당)에 도달 못함 → Message 객체가 ref에 잔류
          // 수정: 언마운트 감지 시 ref와 state를 먼저 null로 초기화 후 break
          if (!isMountedRef.current) {
            wasInterrupted = true;
            streamingBubbleRef.current = null;
            setStreamingBubble(null);
            break;
          }
          const line  = lines[i];
          if (!line) continue;
          const msgId = `msg_${Date.now()}_${i}`;
          const char  = fullChars.find(c => c.id === line.speakerId);

          const typingMsg: Message = {
            id: msgId, role: line.role, content: '',
            characterId:         line.role === 'ai' ? String(line.speakerId) : undefined,
            characterName:       line.role === 'ai' ? line.speakerName : undefined,
            characterProfileUrl: line.role === 'ai' ? (char?.profileUrl ?? '') : undefined,
            timestamp: Date.now(), setId, isStreaming: true,
            actionPrefix: line.actionPrefix, narratorType: line.narratorType };

          streamingBubbleRef.current = typingMsg;
          setStreamingBubble(typingMsg);

          // Inline typing reveal using SmoothTokenBuffer
          await new Promise<void>((resolve) => {
            const buf = new SmoothTokenBuffer((chunk, isDone) => {
              if (!isMountedRef.current) { resolve(); return; }
              const cur = streamingBubbleRef.current;
              if (cur && cur.id === msgId) {
                const updated = { ...cur, content: isDone ? line.content : cur.content + chunk, isStreaming: !isDone };
                streamingBubbleRef.current = updated;
                setStreamingBubble(updated);
              }
              if (isDone) resolve();
            });
            // [BUG FIX] activeSmoothBufRef에 저장 → 언마운트 cleanup이 이 버퍼도 취소
            // 기존: buf를 ref에 저장하지 않아 unmount 시 drainTimer가 계속 실행 → 메모리 누수
            activeSmoothBufRef.current = buf;
            const chars = line.content.split('');
            let charIdx = 0;
            const drip = () => {
              dripTimerRef.current = null;
              if (!isMountedRef.current || charIdx >= chars.length) { buf.finish(); return; }
              buf.push(chars[charIdx++]);
              if (charIdx < chars.length) {
                // [BUG FIX] dripTimerRef에 저장 → 언마운트 cleanup에서 취소 가능
                dripTimerRef.current = setTimeout(drip, 18);
              } else {
                buf.finish();
              }
            };
            drip();
          });
          activeSmoothBufRef.current = null;

          const completedMsg: Message = { ...typingMsg, content: line.content, isStreaming: false };
          streamingBubbleRef.current  = null;
          setStreamingBubble(null);
          setMessages(prev => [...prev, completedMsg]);
          finalAiMessages.push(completedMsg);
          aiDialogueLines.push(`${line.speakerId}:${line.content}`);

          if (i < lines.length - 1) {
            // ✅ 메시지 간 딜레이: 내용 길이 + 디바이스 티어 기반 자연스러운 호흡
            // · 짧은 대사 후 짧은 쉬움, 긴 서술 후 긴 쉬움 (소설 단락 전환 느낌)
            // · high: 180~350ms  /  flagship: 150~300ms
            const contentLen = (lines[i]?.content?.length ?? 0);
            const baseDelay  = deviceTier === 'flagship' ? 150 : 180;
            const maxDelay   = deviceTier === 'flagship' ? 300 : 350;
            const delayMs    = Math.min(maxDelay, baseDelay + Math.floor(contentLen / 8));
            await new Promise<void>((resolve) => {
              const id = setTimeout(resolve, delayMs);
              cancelDelayRef.current = () => { clearTimeout(id); resolve(); };
            });
            cancelDelayRef.current = null;
          }
        }
      }

      return { finalAiMessages, aiDialogueLines, wasInterrupted };
    },
    [fullChars, isMountedRef, setMessages, setStreamingBubble, streamingTyping],
  );

  return { runRawStream, runTypingReveal, streamAccRef, streamMsgIdRef };
}












