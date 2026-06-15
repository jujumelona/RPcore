// src/components/chat/StreamingMarkdownRenderer.tsx
// ═══════════════════════════════════════════════════════════════════
// v2 — 증분 파싱 + rAF 디바운싱 스트리밍 마크다운 렌더러
//
// ── 최적화 내역 ────────────────────────────────────────────────
// [v1 문제] useMemo([text])로 매 토큰마다 전체 텍스트 재파싱 + 전체 리렌더
//   → 500자 이상 텍스트에서 프레임 드롭 (JS 스레드 밀림)
//
// [v2 해결]
//   ① 증분 파서: 이전 파싱 상태(ParserState, 커서 위치) 캐시 → 새 텍스트만 파싱
//   ② rAF 디바운싱: 여러 토큰을 requestAnimationFrame 1프레임에 배치 처리
//   ③ 세그먼트 배열 직접 mutation (불변 배열 재생성 X)
//   ④ 완료 시 1회만 전체 재파싱 (불완전 마크업 정리)
//
// 참고: Lobe Chat ChatMessage 스트리밍, @legendapp/state Memo 패턴
// ═══════════════════════════════════════════════════════════════════

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { View, Text, StyleSheet, ScrollView, type TextStyle } from 'react-native';
// ✅ [v2] Nitro C++ 파서 연결 — 가능하면 JSI 직접 호출, 불가시 최적화된 JS 폴백
import { nitroParseMarkdown, type ParsedSegment, type ParseResult } from '../../native/NitroMarkdownParser';

// ParserState is still used in IncrementalParseState below
type ParserState = 'text' | 'code_block' | 'inline_code';

interface StreamingMarkdownProps {
  /** 스트리밍 중인 텍스트 (누적) */
  text: string;
  /** 스트리밍 완료 여부 */
  isComplete?: boolean;
  /** 텍스트 기본 색상 */
  textColor?: string;
  /** 기본 폰트 크기 */
  fontSize?: number;
}

// ── 증분 파싱 상태 ────────────────────────────────────────────────

interface IncrementalParseState {
  /** 파서가 마지막으로 처리한 원본 텍스트 길이 */
  lastParsedLength: number;
  /** 현재 파서 상태 (text / code_block / inline_code) */
  parserState: ParserState;
  /** 마지막 안전한 분할 위치 (불완전 마크업 롤백용) */
  lastSafeOffset: number;
  /** 누적 세그먼트 배열 */
  segments: ParsedSegment[];
  /** 코드블록 내부 여부 */
  isInCodeBlock: boolean;
  /** 코드블록 언어 */
  pendingLanguage: string;
  /** 코드블록 진행 중 버퍼 */
  codeBuffer: string;
}

// ── 전체 파서 — Nitro C++ / JS 폴백 자동 전환 ──────────────────────
// parseMarkdownFull → nitroParseMarkdown으로 위임 (NitroMarkdownParser.ts)

function parseMarkdownFull(raw: string): ParseResult {
  return nitroParseMarkdown(raw);
}

// ── 증분 파싱 — 새 텍스트만 파싱 ──────────────────────────────────
//
// 전략:
//   1) 마지막 불완전 세그먼트가 있으면 제거하고 해당 위치부터 재파싱
//   2) 새 텍스트 영역을 전체 파서에 위임 (안전한 위치부터)
//   3) 결과를 기존 세그먼트 배열에 append
//
// 왜 안전 위치를 롤백하는가?
//   스트리밍 중간에 **볼 처럼 불완전한 마크업이 올 수 있음
//   마지막 세그먼트의 시작 위치까지 롤백 → 다시 파싱하면 정확한 결과

function parseIncremental(
  fullText: string,
  state: IncrementalParseState,
): IncrementalParseState {
  if (fullText.length <= state.lastParsedLength) return state;

  // 안전 위치: 마지막 텍스트 세그먼트 경계 또는 줄바꿈 위치
  // 롤백할 위치 결정 — 마지막 불완전 세그먼트를 다시 파싱
  let rollbackOffset = state.lastParsedLength;

  // 불완전 마크업을 고려해 마지막 64자까지 롤백 (적은 영역만 재파싱)
  const ROLLBACK_WINDOW = 64;
  const safeStart = Math.max(0, rollbackOffset - ROLLBACK_WINDOW);

  // safeStart부터 전체 텍스트 끝까지 파싱
  const parseRegion = fullText.slice(safeStart);
  const parsed = parseMarkdownFull(parseRegion);

  // 기존 세그먼트에서 rollback 영역에 해당하는 것 제거
  // safeStart 이전까지의 세그먼트만 유지
  let charCount = 0;
  let keepCount = 0;
  for (let i = 0; i < state.segments.length; i++) {
    const seg = state.segments[i]!;
    charCount += seg.content.length;
    if (charCount <= safeStart) {
      keepCount = i + 1;
    } else {
      break;
    }
  }

  const keptSegments = state.segments.slice(0, keepCount);

  // 병합: 기존 + 새 파싱 결과
  // 연속 text 세그먼트 병합 (메모리 절약)
  const merged = [...keptSegments];
  for (const seg of parsed.segments) {
    const last = merged[merged.length - 1];
    if (last && last.type === 'text' && seg.type === 'text') {
      last.content += seg.content;
    } else {
      merged.push(seg);
    }
  }

  return {
    lastParsedLength: fullText.length,
    parserState: parsed.isInCodeBlock ? 'code_block' : 'text',
    lastSafeOffset: safeStart,
    segments: merged,
    isInCodeBlock: parsed.isInCodeBlock,
    pendingLanguage: parsed.pendingLanguage,
    codeBuffer: '' };
}

// ── Renderer Component ────────────────────────────────────────────

export const StreamingMarkdownRenderer = memo(function StreamingMarkdownRenderer({
  text,
  isComplete = false,
  textColor = '#D8D8E8',
  fontSize = 15 }: StreamingMarkdownProps) {
  const t = useTranslation();

  // ✅ [OPT v2] 증분 파싱 상태를 ref에 저장 — 리렌더 없이 업데이트
  const parseStateRef = useRef<IncrementalParseState>({
    lastParsedLength: 0,
    parserState: 'text',
    lastSafeOffset: 0,
    segments: [],
    isInCodeBlock: false,
    pendingLanguage: '',
    codeBuffer: '' });

  // ✅ [OPT v2] rAF 디바운싱 — 여러 토큰을 1프레임에 배치 처리
  const rafIdRef = useRef<number | null>(null);
  const pendingTextRef = useRef(text);
  const [renderVersion, setRenderVersion] = useState(0);

  // 텍스트 변경 시 rAF 배치 예약
  useEffect(() => {
    pendingTextRef.current = text;

    if (isComplete) {
      // 완료 시 전체 재파싱 (불완전 마크업 최종 정리) + 즉시 렌더
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      const finalParsed = parseMarkdownFull(text);
      parseStateRef.current = {
        lastParsedLength: text.length,
        parserState: finalParsed.isInCodeBlock ? 'code_block' : 'text',
        lastSafeOffset: 0,
        segments: finalParsed.segments,
        isInCodeBlock: finalParsed.isInCodeBlock,
        pendingLanguage: finalParsed.pendingLanguage,
        codeBuffer: '' };
      setRenderVersion(v => v + 1);
      return;
    }

    // 스트리밍 중: rAF 디바운싱
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        const currentText = pendingTextRef.current;
        parseStateRef.current = parseIncremental(currentText, parseStateRef.current);
        setRenderVersion(v => v + 1);
      });
    }

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [text, isComplete]);

  // 텍스트가 빈 문자열로 리셋되면 파싱 상태도 초기화
  useEffect(() => {
    if (text === '') {
      parseStateRef.current = {
        lastParsedLength: 0,
        parserState: 'text',
        lastSafeOffset: 0,
        segments: [],
        isInCodeBlock: false,
        pendingLanguage: '',
        codeBuffer: '' };
      setRenderVersion(v => v + 1);
    }
  }, [text]);

  const segments = parseStateRef.current.segments;
  const isInCodeBlock = parseStateRef.current.isInCodeBlock;

  const baseTextStyle: TextStyle = useMemo(
    () => ({ color: textColor, fontSize, lineHeight: fontSize * 1.6 }),
    [textColor, fontSize],
  );

  // renderVersion을 key로 사용하여 필요할 때만 세그먼트 재렌더
// eslint-disable-next-line no-void
  void renderVersion; // 의존성 트리거용

  return (
    <View style={styles.container}>
      {segments.map((seg, idx) => {
        switch (seg.type) {
          case 'text':
            return (
              <Text key={`${idx}_${seg.content.length}`} style={baseTextStyle}>
                {seg.content}
              </Text>
            );

          case 'bold':
            return (
              <Text key={`b${idx}`} style={[baseTextStyle, styles.bold]}>
                {seg.content}
              </Text>
            );

          case 'italic':
            return (
              <Text key={`i${idx}`} style={[baseTextStyle, styles.italic]}>
                {seg.content}
              </Text>
            );

          case 'code_inline':
            return (
              <Text key={`ci${idx}`} style={[styles.codeInline, { fontSize: fontSize - 1 }]}>
                {seg.content}
              </Text>
            );

          case 'code_block':
            return (
              <View key={`cb${idx}`} style={styles.codeBlock}>
                {seg.language ? (
                  <Text style={styles.codeLanguage}>{seg.language}</Text>
                ) : null}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <Text style={[styles.codeText, { fontSize: fontSize - 2 }]}>
                    {seg.content}
                  </Text>
                </ScrollView>
              </View>
            );

          case 'heading':
            return (
              <Text key={`h${idx}`} style={[baseTextStyle, styles.heading]}>
                {seg.content}
              </Text>
            );

          case 'list_item':
            return (
              <View key={`li${idx}`} style={styles.listItem}>
                <Text style={[baseTextStyle, styles.listBullet]}>•</Text>
                <Text style={[baseTextStyle, styles.listText]}>{seg.content}</Text>
              </View>
            );

          default:
            return null;
        }
      })}

      {/* 미완성 코드블록 인디케이터 */}
      {isInCodeBlock && !isComplete && (
        <View style={styles.codeBlockPending}>
          <Text style={styles.codeBlockPendingText}>⟨ {t.codeBlock_generating} ⟩</Text>
        </View>
      )}

      {/* 스트리밍 커서 */}
      {!isComplete && (
        <Text style={[baseTextStyle, styles.cursor]}>▊</Text>
      )}
    </View>
  );
});

// ── Hook: 스트리밍 텍스트 누적기 (v2 — delta append) ──────────────

export function useStreamingText() {
  const [text, setText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  
  // 실제 받은 전체 텍스트 버퍼
  const bufferRef = useRef('');
  // 화면에 표시된 텍스트 길이
  const displayedLengthRef = useRef(0);
  // 글자 드립 타이머
  const dripTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCompleteRef = useRef(false);

  // 글자 드립 시작 (아직 안 돌고 있으면)
  const startDrip = useCallback(() => {
    if (dripTimerRef.current !== null) return;

    dripTimerRef.current = setInterval(() => {
      const full = bufferRef.current;
      const displayed = displayedLengthRef.current;

      if (displayed >= full.length) {
        // 버퍼 따라잡음 — 완료 상태면 타이머 종료
        if (isCompleteRef.current) {
          clearInterval(dripTimerRef.current!);
          dripTimerRef.current = null;
          setText(full);
          setIsComplete(true);
        }
        // 아직 완료 안 됐으면 새 토큰 대기 (타이머 유지)
        return;
      }

      // 한 번에 표시할 글자 수:
      // 버퍼가 많이 밀려있으면 여러 글자씩 따라잡기 (최대 4글자)
      const lag = full.length - displayed;
      const charsToShow = lag > 40 ? 4 : lag > 15 ? 2 : 1;

      displayedLengthRef.current = Math.min(displayed + charsToShow, full.length);
      setText(full.slice(0, displayedLengthRef.current));
    }, 18); // 18ms ≈ 55글자/초 — 자연스러운 타이핑 속도
  }, []);

  const appendChunk = useCallback((chunk: string) => {
    bufferRef.current += chunk;
    startDrip();
  }, [startDrip]);

  const complete = useCallback(() => {
    isCompleteRef.current = true;
    // 드립이 끝나면 setIsComplete(true)는 타이머 안에서 처리
    // 드립이 이미 따라잡은 상태면 즉시 완료
    if (dripTimerRef.current === null) {
      setText(bufferRef.current);
      setIsComplete(true);
    }
  }, []);

  const reset = useCallback(() => {
    if (dripTimerRef.current !== null) {
      clearInterval(dripTimerRef.current);
      dripTimerRef.current = null;
    }
    bufferRef.current = '';
    displayedLengthRef.current = 0;
    isCompleteRef.current = false;
    setText('');
    setIsComplete(false);
  }, []);

  return { text, isComplete, appendChunk, complete, reset };
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start' },
  bold: {
    fontWeight: '700' },
  italic: {
    fontStyle: 'italic' },
  codeInline: {
    fontFamily: 'monospace',
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#E0B0FF',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3 },
  codeBlock: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)' },
  codeLanguage: {
    color: 'rgba(168,130,255,0.6)',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1 },
  codeText: {
    fontFamily: 'monospace',
    color: '#C8C8D8',
    lineHeight: 20 },
  codeBlockPending: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(168,130,255,0.2)',
    borderStyle: 'dashed' },
  codeBlockPendingText: {
    color: 'rgba(168,130,255,0.5)',
    fontSize: 12,
    textAlign: 'center' },
  heading: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 4,
    width: '100%' },
  listItem: {
    flexDirection: 'row',
    width: '100%',
    paddingLeft: 8,
    marginVertical: 2 },
  listBullet: {
    marginRight: 8,
    color: 'rgba(168,130,255,0.7)' },
  listText: {
    flex: 1 },
  cursor: {
    opacity: 0.6 } });
