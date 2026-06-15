/* eslint-disable @typescript-eslint/no-unused-vars */
// src/components/reader/NovelCompanionBar.tsx
// ─────────────────────────────────────────────────────────────────────────────
//  AI 독서 동반자 v5.2 — 적응형 엔진 관리 통합
//
//  v5.1 대비 핵심 추가:
//
//  1. AdaptiveEmbeddingManager
//     · 추론 지연 EMA를 실시간 측정 → 디바이스 성능 자동 판단
//     · full / lite / keyword 3단계 tier 자동 전환
//     · 전환 즉시 적용 (모델 교체 없음, 호출 여부만 제어)
//     · 60초 쿨다운 후 자동 재벤치마크 → 발열 식으면 업그레이드
//
//  2. KeywordToneDetector (keyword tier 폴백)
//     · 15개국어 키워드 RegExp — embed 호출 0, 지연 <1ms
//     · 죽/살/피/blood/death/mort/muerte/死/血/смерть 등 전 언어 커버
//
//  3. Tier별 동작 차이
//     ┌──────────┬─────────────────────────────────────────────────────┐
//     │ full     │ 단락 embed + 배치 embed + 앵커 비교 (고성능 기기)  │
//     │ lite     │ 단락 embed만, 배치 스킵 (중급기 / 일시적 발열)    │
//     │ keyword  │ 키워드 RegExp 폴백 (구형기 / 발열 심할 때)        │
//     └──────────┴─────────────────────────────────────────────────────┘
//
//  4. UI v5.2
//     · pill에 tier 도트 표시 (금/은/회색)
//     · 메뉴에 현재 tier + EMA 지연 표시
//     · tier 변경 시 부드러운 색상 전환
//
//  GPU/CPU 분리 실제 상황:
//     · llamaEngine: GPU (Metal/Vulkan), n_gpu_layers=-1
//     · embeddingEngine: CPU 전용, n_gpu_layers=0 로 초기화 필수
//     · JS레이어 비동기 → 실제 동시 실행 가능
//     · 단, 모바일 Unified Memory 버스 공유 → lite/keyword tier에서
//       배치 embed 생략하여 버스 경합 최소화
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View, Text, StyleSheet,
  PanResponder, Dimensions,
} from 'react-native';
import Animated, {
  FadeIn, FadeOut, useSharedValue,
  SlideInRight,
} from 'react-native-reanimated';
import { Typography } from '../../constants/tokens';
import { BM25Index } from '../../BM25Index/BM25Index';
import { appStorage } from '../../utils/storage';
import { llamaEngine } from '../../core/llama';
import {
  embeddingEngine,
  _cosineSimilarity,
  _normalizeL2,
  float32ToBase64,
  base64ToFloat32,
} from '../../core/llama/EmbeddingEngine';
import { adaptiveEmbedding, EmbeddingTier } from '../../core/llama/AdaptiveEmbeddingManager';
import { keywordDetector } from '../../core/llama/KeywordToneDetector';
import { buildNovelCompanionPrompt, normalizeNovelCompanionLanguage } from './novelCompanionPrompt';

// ══════════════════════════════════════════════════════════════════════════════
//  상수
// ══════════════════════════════════════════════════════════════════════════════

export const NOVEL_COMPANION_ENABLED_KEY = '@novel_companion_enabled';
const KEY_POS            = '@novel_companion_pos_v3';
const KEY_PREF_VEC       = '@companion_pref_vec_v1';

const SCHEDULER_INTERVAL_MS   = 500;
const MIN_ETA_TO_PREGENERATE  = 2.5;
const GEN_TIME_DEFAULT_SEC    = 4.0;
const GEN_TIME_ALPHA          = 0.3;
const SPEED_ALPHA             = 0.25;
const SPEED_DEFAULT_CPS       = 12;
const MIN_SPEED_CPS           = 3;
const MAX_SPEED_CPS           = 50;
const COMPANION_MAX_TOKENS    = 40;  // 60 → 40으로 줄여서 더 짧고 빠른 반응 유도
const MAX_CONTEXT_CHARS       = 420;
const PREGEN_LOOKAHEAD_SEC    = 8;
const CACHE_MAX_SIZE          = 6;

const CLIMAX_WINDOW           = 5;
const CLIMAX_THRESHOLD        = 0.32;
const PREF_ALPHA              = 0.12;
const PREF_SCORE_HIGH         = 0.72;
const MIN_DWELL_SEC           = 4;

const { width: SW, height: SH } = Dimensions.get('window');
const DEFAULT_POS = { x: Math.max(16, SW - 248), y: Math.round(SH * 0.38) };

const LANG_NATIVE: Record<string, string> = {
  ko: '한국어', en: 'English', ja: '日本語',
  zh: '中文', 'zh-CN': '中文', 'zh-TW': '繁體中文',
  es: 'Español', fr: 'Français', de: 'Deutsch',
  it: 'Italiano', ru: 'Русский', pt: 'Português',
  ar: 'العربية', hi: 'हिन्दी', th: 'ภาษาไทย', tr: 'Türkçe',
};

// Tier UI 색상
const TIER_COLORS: Record<EmbeddingTier, { dot: string; label: string }> = {
  full:    { dot: '#D4A853', label: 'Full AI' },
  lite:    { dot: '#7C9EBF', label: 'Lite AI' },
  keyword: { dot: '#4A4A6A', label: 'Keyword' },
};

// ══════════════════════════════════════════════════════════════════════════════
//  감정 톤 정의 — 다국어 앵커 + 키워드 tone key 매핑
// ══════════════════════════════════════════════════════════════════════════════

type ToneKey = 'tension' | 'warmth' | 'mystery' | 'action' | 'humor' | 'neutral';

interface ToneProfile {
  key:       ToneKey;
  anchors:   string[];   // full/lite tier: 임베딩 앵커 (다국어)
  glowColor: string;
  iconColor: string;
  moodHint:  string;
}

const TONE_PROFILES: ToneProfile[] = [
  {
    key: 'tension',
    anchors: [
      'The characters face mortal danger, fear grips the air, blood and desperation fill the scene.',
      '죽음의 공포가 엄습하고, 피가 흐르며, 살기 위해 몸부림치는 절박한 순간이다.',
      '死の恐怖が迫り、血が流れ、生き死にの瀬戸際で必死に抗う。',
      '死亡的恐惧笼罩着他们，鲜血流淌，生死存亡的关键时刻到来了。',
      'El peligro mortal los rodea, la sangre corre y la desesperación llena el aire.',
    ],
    glowColor: '#FF4444', iconColor: '#FF8080', moodHint: 'danger/dread/survival',
  },
  {
    key: 'warmth',
    anchors: [
      'They embraced each other with warmth and love, tears of joy filling their eyes, hearts at peace.',
      '따뜻한 포옹 속에 눈물이 흘렀고, 사랑이 가득한 평온한 순간이었다.',
      '温かく抱き合い、喜びの涙があふれ、愛に満ちた穏やかなひとときだった。',
      '他们温暖地拥抱在一起，喜悦的泪水流淌，爱意充满心间。',
      'Se abrazaron con amor y ternura, lágrimas de alegría llenaron sus ojos.',
    ],
    glowColor: '#FF6B9D', iconColor: '#FFB3CC', moodHint: 'love/warmth/tenderness',
  },
  {
    key: 'mystery',
    anchors: [
      'A hidden secret was concealed in shadows, strange whispers revealed an unseen truth.',
      '어둠 속에 감춰진 비밀, 속삭임이 퍼지며 보이지 않는 진실이 드러나기 시작했다.',
      '闇に隠された秘密、ひそひそ声が広がり、見えない真実が明かされていく。',
      '黑暗中隐藏着秘密，奇怪的低语揭示了一个不为人知的真相。',
      'Un secreto oculto en las sombras, extraños susurros revelaban una verdad invisible.',
    ],
    glowColor: '#7C4DFF', iconColor: '#B39DDB', moodHint: 'mystery/secret/suspense',
  },
  {
    key: 'action',
    anchors: [
      'They ran at full speed, explosions and clashes filled the battlefield, urgent and breathless.',
      '전속력으로 달렸다. 폭발과 충돌이 전장을 가득 채웠고, 숨이 가빴다.',
      '全速力で走り、爆発と激突が戦場を満たし、息が切れるほど緊迫していた。',
      '他们全速奔跑，爆炸和冲突充满了战场，紧张得喘不过气来。',
      'Corrían a toda velocidad, explosiones y choques llenaban el campo de batalla.',
    ],
    glowColor: '#FF8C00', iconColor: '#FFB347', moodHint: 'urgency/action/chase',
  },
  {
    key: 'humor',
    anchors: [
      'The absurd situation made everyone burst into laughter, irony and comedic timing perfect.',
      '황당한 상황에 모두가 웃음을 터뜨렸다. 아이러니와 유머 타이밍이 절묘했다.',
      '不条理な状況に皆が笑い転げ、アイロニーとコメディのタイミングが絶妙だった。',
      '荒诞的情形让大家忍俊不禁，讽刺意味和喜剧时机恰到好处。',
      'La absurda situación hizo reír a todos, la ironía y el humor en su momento perfecto.',
    ],
    glowColor: '#00BCD4', iconColor: '#80DEEA', moodHint: 'humor/irony/lightness',
  },
  {
    key: 'neutral',
    anchors: [
      'The scene continued calmly, characters reflecting on ordinary daily life.',
      '장면은 조용히 이어졌고, 인물들은 평범한 일상을 돌아보고 있었다.',
      '場面は穏やかに続き、登場人物たちは普通の日常を振り返っていた。',
      '场景平静地继续，人物们沉思着平凡的日常生活。',
      'La escena continuó con calma, los personajes reflexionando sobre la vida cotidiana.',
    ],
    glowColor: '#D4A853', iconColor: '#D4A853', moodHint: 'curiosity/interest',
  },
];

// ToneKey → ToneProfile 빠른 조회
const TONE_MAP = new Map<ToneKey, ToneProfile>(TONE_PROFILES.map(p => [p.key, p]));

// ══════════════════════════════════════════════════════════════════════════════
//  EmbeddingToneAnalyzer v5.2 — AdaptiveEmbeddingManager 통합
// ══════════════════════════════════════════════════════════════════════════════

class EmbeddingToneAnalyzer {
  private _anchorVecs  = new Map<ToneKey, Float32Array[]>();
  private _paraCache   = new Map<number, Float32Array>();
  private _recentVecs: Float32Array[] = [];
  private _prefVec: Float32Array | null = null;
  private _prefLoaded  = false;

  async init(): Promise<void> {
    if (!embeddingEngine.isReady()) return;
    // 앵커 벡터 초기화 (full/lite tier 공통 — 앵커는 항상 미리 생성)
    for (const profile of TONE_PROFILES) {
      if (this._anchorVecs.has(profile.key)) continue;
      const vecs: Float32Array[] = [];
      for (const anchor of profile.anchors) {
        try {
          const vec = await embeddingEngine.embedDocument(anchor);
          vecs.push(vec);
        } catch {}
      }
      if (vecs.length > 0) this._anchorVecs.set(profile.key, vecs);
    }
    this._loadPrefVec();
  }

  isReady(): boolean {
    // keyword tier면 앵커 없어도 동작 가능
    if (adaptiveEmbedding.tier === 'keyword') return true;
    return this._anchorVecs.size >= TONE_PROFILES.length;
  }

  // ── 단락 분석 — tier에 따라 분기 ─────────────────────────────────────────

  async analyzePara(paraId: number, text: string): Promise<{
    tone:      ToneProfile;
    isClimax:  boolean;
    prefScore: number;
  } | null> {
    const tier = adaptiveEmbedding.tier;

    // ── keyword tier: RegExp 폴백 ─────────────────────────────────────────
    if (tier === 'keyword') {
      const { key } = keywordDetector.analyze(text);
      const profile  = TONE_MAP.get(key) ?? TONE_PROFILES[TONE_PROFILES.length - 1]!;
      return { tone: profile, isClimax: false, prefScore: 0.5 };
    }

    // ── full / lite tier: 임베딩 기반 분석 ─────────────────────────────────
    if (!embeddingEngine.isReady()) return null;

    // 단락 벡터 (adaptive manager 경유 — 지연 측정 포함)
    let vec = this._paraCache.get(paraId);
    if (!vec) {
      const result = await adaptiveEmbedding.embedPara(text);
      if (!result) {
        // 어댑터가 keyword로 강등됐으면 다음 호출 시 자동 폴백됨
        const { key } = keywordDetector.analyze(text);
        const profile  = TONE_MAP.get(key) ?? TONE_PROFILES[TONE_PROFILES.length - 1]!;
        return { tone: profile, isClimax: false, prefScore: 0.5 };
      }
      vec = result;
      this._paraCache.set(paraId, vec);
      if (this._paraCache.size > 200) {
        const oldest = this._paraCache.keys().next().value;
        if (oldest !== undefined) this._paraCache.delete(oldest);
      }
    }

    // 앵커 비교 (다국어 max)
    let bestTone: ToneProfile = TONE_PROFILES[TONE_PROFILES.length - 1]!;
    let bestSim  = -1;
    for (const profile of TONE_PROFILES) {
      const anchorVecs = this._anchorVecs.get(profile.key);
      if (!anchorVecs) continue;
      let maxSim = -1;
      for (const anchor of anchorVecs) {
        const sim = _cosineSimilarity(vec, anchor);
        if (sim > maxSim) maxSim = sim;
      }
      if (maxSim > bestSim) { bestSim = maxSim; bestTone = profile; }
    }

    // 클라이맥스 감지
    this._recentVecs.push(vec);
    if (this._recentVecs.length > CLIMAX_WINDOW) this._recentVecs.shift();
    let isClimax = false;
    if (this._recentVecs.length >= CLIMAX_WINDOW) {
      let totalDelta = 0;
      for (let i = 1; i < this._recentVecs.length; i++) {
        totalDelta += 1 - _cosineSimilarity(this._recentVecs[i - 1]!, this._recentVecs[i]!);
      }
      isClimax = (totalDelta / (this._recentVecs.length - 1)) > CLIMAX_THRESHOLD;
    }

    const prefScore = this._scorePref(vec);
    return { tone: bestTone, isClimax, prefScore };
  }

  updatePref(paraId: number, dwellSec: number): void {
    if (dwellSec < MIN_DWELL_SEC) return;
    // keyword tier에선 pref 업데이트 스킵 (벡터 없음)
    if (adaptiveEmbedding.tier === 'keyword') return;
    const vec = this._paraCache.get(paraId);
    if (!vec) return;
    const alpha = Math.min(PREF_ALPHA, dwellSec / 40);
    if (!this._prefVec || this._prefVec.length !== vec.length) {
      this._prefVec = new Float32Array(vec);
    } else {
      for (let i = 0; i < this._prefVec.length; i++) {
        this._prefVec[i] = (1 - alpha) * this._prefVec[i]! + alpha * vec[i]!;
      }
      this._prefVec = _normalizeL2(this._prefVec);
    }
    this._savePrefVec();
  }

  private _scorePref(vec: Float32Array): number {
    if (!this._prefVec || this._prefVec.length !== vec.length) return 0.5;
    return (_cosineSimilarity(this._prefVec, vec) + 1) / 2;
  }

  private _loadPrefVec(): void {
    if (this._prefLoaded) return;
    this._prefLoaded = true;
    try { const b64 = appStorage.getString(KEY_PREF_VEC); if (b64) this._prefVec = base64ToFloat32(b64); } catch {}
  }

  private _savePrefVec(): void {
    if (!this._prefVec) return;
    try { appStorage.set(KEY_PREF_VEC, float32ToBase64(this._prefVec)); } catch {}
  }

  reset(): void { this._paraCache.clear(); this._recentVecs = []; }
}

const toneAnalyzer = new EmbeddingToneAnalyzer();

// ══════════════════════════════════════════════════════════════════════════════
//  ReadingSpeedEstimator
// ══════════════════════════════════════════════════════════════════════════════

class ReadingSpeedEstimator {
  private _cps = SPEED_DEFAULT_CPS; private _lastY = -1; private _lastTs = 0;
  constructor(private _charsPerPx = 0.15) {}
  update(scrollY: number, now: number): void {
    if (this._lastY < 0) { this._lastY = scrollY; this._lastTs = now; return; }
    const dt = (now - this._lastTs) / 1000, dPx = Math.abs(scrollY - this._lastY);
    if (dt < 0.1 || dPx < 5) return;
    const raw = (dPx * this._charsPerPx) / dt;
    this._cps   = this._cps * (1 - SPEED_ALPHA) + Math.max(MIN_SPEED_CPS, Math.min(raw, MAX_SPEED_CPS)) * SPEED_ALPHA;
    this._lastY = scrollY; this._lastTs = now;
  }
  get cps(): number { return this._cps; }
  etaForChars(chars: number): number { return chars / this._cps; }
}

// ══════════════════════════════════════════════════════════════════════════════
//  헬퍼
// ══════════════════════════════════════════════════════════════════════════════

function findCurrentParaId(paraYMap: Map<number, number>, scrollY: number, viewH: number): number | null {
  const readingLine = scrollY + viewH * 0.22;
  let best: number | null = null, bestDiff = Infinity;
  for (const [id, y] of paraYMap) {
    const diff = Math.abs(y - readingLine);
    if (diff < bestDiff) { bestDiff = diff; best = id; }
  }
  return best;
}

export interface ParagraphItem { id: number; text: string; description?: string; }

function findTargetPara(
  paragraphs: ParagraphItem[], paraYMap: Map<number, number>,
  currentId: number, etaSeconds: number, speedCps: number,
): { paraId: number; charsToTarget: number } | null {
  const currentIdx = paragraphs.findIndex(p => p.id === currentId);
  if (currentIdx < 0) return null;
  let accumulated = 0;
  const targetChars = etaSeconds * speedCps;
  for (let i = currentIdx + 1; i < paragraphs.length; i++) {
    accumulated += (paragraphs[i]?.text.length ?? 0);
    if (accumulated >= targetChars) {
      const id = paragraphs[i]?.id;
      if (id !== undefined && paraYMap.has(id)) return { paraId: id, charsToTarget: accumulated };
    }
  }
  return null;
}

function reciprocalRankFusion(a: number[], b: number[], k = 60): Map<number, number> {
  const s = new Map<number, number>();
  for (let r = 0; r < a.length; r++) s.set(a[r]!, (s.get(a[r]!) ?? 0) + 1 / (k + r + 1));
  for (let r = 0; r < b.length; r++) s.set(b[r]!, (s.get(b[r]!) ?? 0) + 1 / (k + r + 1));
  return s;
}

async function buildHybridContext(paragraphs: ParagraphItem[], targetIdx: number, queryText: string): Promise<string> {
  const texts = paragraphs.map(p => p.text);
  const topK  = Math.min(8, texts.length);
  let bm25Ranks: number[] = [];
  let vecRanks:  number[] = [];

  try { bm25Ranks = new BM25Index(texts).topK(queryText, topK).map(r => r.index); } catch {}

  // full tier만 배치 embed 사용 — lite/keyword에선 BM25만
  if (adaptiveEmbedding.tier === 'full') {
    try {
      const qVec = await adaptiveEmbedding.embedQuery(queryText);
      if (qVec) {
        const r0 = Math.max(0, targetIdx - 12), r1 = Math.min(texts.length - 1, targetIdx + 12);
        const vecs = await adaptiveEmbedding.embedBatch(texts.slice(r0, r1 + 1));
        if (vecs.length > 0) {
          vecRanks = vecs.map((v, i) => ({ i: r0 + i, s: _cosineSimilarity(qVec, v) }))
            .sort((a, b) => b.s - a.s).slice(0, topK).map(x => x.i);
        }
      }
    } catch {}
  }

  const rrfScores = reciprocalRankFusion(bm25Ranks, vecRanks);
  const picked = [...rrfScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([i]) => i).filter(i => i !== targetIdx);
  const windowIds = new Set<number>();
  for (let i = Math.max(0, targetIdx - 2); i <= Math.min(texts.length - 1, targetIdx + 3); i++) windowIds.add(i);
  const allIds = [...new Set([...picked, ...windowIds, targetIdx])].sort((a, b) => a - b);
  return allIds.map(i => texts[i] ?? '').filter(Boolean).join(' ').slice(0, MAX_CONTEXT_CHARS);
}

// ══════════════════════════════════════════════════════════════════════════════
//  프롬프트 빌더 v5.3 — 15개국어 + tone/climax/prev 통합
// ══════════════════════════════════════════════════════════════════════════════

// 15개국어 프롬프트 템플릿 (JSON 구조)
const COMPANION_PROMPTS: Record<string, {
  toneLabels: Record<ToneKey, string>;
  climaxLabel: string;
  prevLabel: string;
  systemTemplate: string;
  userTemplate: string;
}> = {
  ko: {
    toneLabels: {
      tension: '긴장·공포·절박함을 담아',
      warmth: '따뜻함·감동·설렘을 담아',
      mystery: '의문·신비·놀라움을 담아',
      action: '박진감·흥분을 담아',
      humor: '유쾌함·웃음을 담아',
      neutral: '담담하게',
    },
    climaxLabel: ' 【클라이맥스 장면】',
    prevLabel: ' 이전 반응과 다른 표현.',
    systemTemplate: '너는 소설을 읽는 독자야. 오직 한국어로만, 감탄사·독백·짧은 감정 표현(10~25자)만 출력해. "저는 AI입니다", "무엇을 도와드릴까요" 같은 말은 절대 금지. 자기소개 금지.{climax}{tone}{prev}',
    userTemplate: '이 장면에 한국어로 짧게 반응:\n\n"{context}"',
  },
  en: {
    toneLabels: {
      tension: 'with tension, fear, urgency',
      warmth: 'with warmth, emotion, flutter',
      mystery: 'with mystery, wonder, surprise',
      action: 'with excitement, thrill',
      humor: 'with humor, laughter',
      neutral: 'calmly',
    },
    climaxLabel: ' 【CLIMAX SCENE】',
    prevLabel: ' Different from previous reaction.',
    systemTemplate: 'You are a novel reader. Output ONLY short exclamations, reactions, or emotional expressions (10~25 chars) in English. NEVER say "I am an AI", "How can I help", or introduce yourself. No self-introduction.{climax}{tone}{prev}',
    userTemplate: 'React briefly in English to this scene:\n\n"{context}"',
  },
  ja: {
    toneLabels: {
      tension: '緊張・恐怖・切迫感を込めて',
      warmth: '温かさ・感動・ときめきを込めて',
      mystery: '疑問・神秘・驚きを込めて',
      action: '迫力・興奮を込めて',
      humor: '愉快さ・笑いを込めて',
      neutral: '淡々と',
    },
    climaxLabel: ' 【クライマックス場面】',
    prevLabel: ' 前回の反応と異なる表現。',
    systemTemplate: 'あなたは小説を読む読者です。日本語のみで、感嘆詞・独白・短い感情表現(10~25文字)だけを出力してください。「私はAIです」「何をお手伝いしましょうか」のような発言は絶対禁止。自己紹介禁止。{climax}{tone}{prev}',
    userTemplate: 'このシーンに日本語で短く反応:\n\n"{context}"',
  },
  zh: {
    toneLabels: {
      tension: '带着紧张、恐惧、紧迫感',
      warmth: '带着温暖、感动、心动',
      mystery: '带着疑问、神秘、惊讶',
      action: '带着刺激、兴奋',
      humor: '带着愉快、欢笑',
      neutral: '平静地',
    },
    climaxLabel: ' 【高潮场景】',
    prevLabel: ' 与之前反应不同的表达。',
    systemTemplate: '你是小说读者。只用中文，只输出感叹词、独白、简短情感表达(10~25字)。绝对禁止说"我是AI"、"我能帮您什么"或自我介绍。禁止自我介绍。{climax}{tone}{prev}',
    userTemplate: '用中文简短回应这个场景:\n\n"{context}"',
  },
  'zh-CN': {
    toneLabels: {
      tension: '带着紧张、恐惧、紧迫感',
      warmth: '带着温暖、感动、心动',
      mystery: '带着疑问、神秘、惊讶',
      action: '带着刺激、兴奋',
      humor: '带着愉快、欢笑',
      neutral: '平静地',
    },
    climaxLabel: ' 【高潮场景】',
    prevLabel: ' 与之前反应不同的表达。',
    systemTemplate: '你是小说读者。只用中文，只输出感叹词、独白、简短情感表达(10~25字)。绝对禁止说"我是AI"、"我能帮您什么"或自我介绍。禁止自我介绍。{climax}{tone}{prev}',
    userTemplate: '用中文简短回应这个场景:\n\n"{context}"',
  },
  'zh-TW': {
    toneLabels: {
      tension: '帶著緊張、恐懼、緊迫感',
      warmth: '帶著溫暖、感動、心動',
      mystery: '帶著疑問、神秘、驚訝',
      action: '帶著刺激、興奮',
      humor: '帶著愉快、歡笑',
      neutral: '平靜地',
    },
    climaxLabel: ' 【高潮場景】',
    prevLabel: ' 與之前反應不同的表達。',
    systemTemplate: '你是小說讀者。只用繁體中文，只輸出感嘆詞、獨白、簡短情感表達(10~25字)。絕對禁止說「我是AI」、「我能幫您什麼」或自我介紹。禁止自我介紹。{climax}{tone}{prev}',
    userTemplate: '用繁體中文簡短回應這個場景:\n\n"{context}"',
  },
  es: {
    toneLabels: {
      tension: 'con tensión, miedo, urgencia',
      warmth: 'con calidez, emoción, ternura',
      mystery: 'con misterio, asombro, sorpresa',
      action: 'con emoción, adrenalina',
      humor: 'con humor, risa',
      neutral: 'con calma',
    },
    climaxLabel: ' 【ESCENA CLÍMAX】',
    prevLabel: ' Diferente de la reacción anterior.',
    systemTemplate: 'Eres un lector de novelas. Solo en español, solo genera exclamaciones, reacciones o expresiones emocionales breves (10~25 caracteres). NUNCA digas "Soy una IA", "¿Cómo puedo ayudar?" ni te presentes. Sin autopresentación.{climax}{tone}{prev}',
    userTemplate: 'Reacciona brevemente en español a esta escena:\n\n"{context}"',
  },
  fr: {
    toneLabels: {
      tension: 'avec tension, peur, urgence',
      warmth: 'avec chaleur, émotion, tendresse',
      mystery: 'avec mystère, émerveillement, surprise',
      action: 'avec excitation, frisson',
      humor: 'avec humour, rire',
      neutral: 'calmement',
    },
    climaxLabel: ' 【SCÈNE CLIMAX】',
    prevLabel: ' Différent de la réaction précédente.',
    systemTemplate: 'Vous êtes un lecteur de romans. Uniquement en français, générez uniquement des exclamations, réactions ou expressions émotionnelles brèves (10~25 caractères). Ne dites JAMAIS "Je suis une IA", "Comment puis-je aider" ni vous présenter. Pas d\'auto-présentation.{climax}{tone}{prev}',
    userTemplate: 'Réagissez brièvement en français à cette scène:\n\n"{context}"',
  },
  de: {
    toneLabels: {
      tension: 'mit Spannung, Angst, Dringlichkeit',
      warmth: 'mit Wärme, Emotion, Zärtlichkeit',
      mystery: 'mit Geheimnis, Staunen, Überraschung',
      action: 'mit Aufregung, Nervenkitzel',
      humor: 'mit Humor, Lachen',
      neutral: 'ruhig',
    },
    climaxLabel: ' 【HÖHEPUNKT-SZENE】',
    prevLabel: ' Anders als die vorherige Reaktion.',
    systemTemplate: 'Du bist ein Romanleser. Nur auf Deutsch, gib nur kurze Ausrufe, Reaktionen oder emotionale Ausdrücke (10~25 Zeichen) aus. Sage NIEMALS "Ich bin eine KI", "Wie kann ich helfen" oder stelle dich vor. Keine Selbstvorstellung.{climax}{tone}{prev}',
    userTemplate: 'Reagiere kurz auf Deutsch auf diese Szene:\n\n"{context}"',
  },
  it: {
    toneLabels: {
      tension: 'con tensione, paura, urgenza',
      warmth: 'con calore, emozione, tenerezza',
      mystery: 'con mistero, meraviglia, sorpresa',
      action: 'con eccitazione, brivido',
      humor: 'con umorismo, risate',
      neutral: 'con calma',
    },
    climaxLabel: ' 【SCENA CLIMAX】',
    prevLabel: ' Diverso dalla reazione precedente.',
    systemTemplate: 'Sei un lettore di romanzi. Solo in italiano, genera solo esclamazioni, reazioni o espressioni emotive brevi (10~25 caratteri). Non dire MAI "Sono un\'IA", "Come posso aiutare" né presentarti. Nessuna autopresentazione.{climax}{tone}{prev}',
    userTemplate: 'Reagisci brevemente in italiano a questa scena:\n\n"{context}"',
  },
  ru: {
    toneLabels: {
      tension: 'с напряжением, страхом, срочностью',
      warmth: 'с теплотой, эмоцией, нежностью',
      mystery: 'с тайной, удивлением, изумлением',
      action: 'с волнением, азартом',
      humor: 'с юмором, смехом',
      neutral: 'спокойно',
    },
    climaxLabel: ' 【КУЛЬМИНАЦИОННАЯ СЦЕНА】',
    prevLabel: ' Отличается от предыдущей реакции.',
    systemTemplate: 'Вы читатель романов. Только на русском, выводите только короткие восклицания, реакции или эмоциональные выражения (10~25 символов). НИКОГДА не говорите "Я ИИ", "Чем могу помочь" и не представляйтесь. Без самопрезентации.{climax}{tone}{prev}',
    userTemplate: 'Отреагируйте кратко на русском на эту сцену:\n\n"{context}"',
  },
  pt: {
    toneLabels: {
      tension: 'com tensão, medo, urgência',
      warmth: 'com calor, emoção, ternura',
      mystery: 'com mistério, admiração, surpresa',
      action: 'com emoção, adrenalina',
      humor: 'com humor, riso',
      neutral: 'calmamente',
    },
    climaxLabel: ' 【CENA CLÍMAX】',
    prevLabel: ' Diferente da reação anterior.',
    systemTemplate: 'Você é um leitor de romances. Apenas em português, gere apenas exclamações, reações ou expressões emocionais breves (10~25 caracteres). NUNCA diga "Sou uma IA", "Como posso ajudar" nem se apresente. Sem autoapresentação.{climax}{tone}{prev}',
    userTemplate: 'Reaja brevemente em português a esta cena:\n\n"{context}"',
  },
  ar: {
    toneLabels: {
      tension: 'بتوتر وخوف وإلحاح',
      warmth: 'بدفء وعاطفة وحنان',
      mystery: 'بغموض ودهشة ومفاجأة',
      action: 'بإثارة وتشويق',
      humor: 'بفكاهة وضحك',
      neutral: 'بهدوء',
    },
    climaxLabel: ' 【مشهد الذروة】',
    prevLabel: ' مختلف عن رد الفعل السابق.',
    systemTemplate: 'أنت قارئ روايات. فقط بالعربية، أنتج فقط تعجبات أو ردود فعل أو تعبيرات عاطفية قصيرة (10~25 حرفًا). لا تقل أبدًا "أنا ذكاء اصطناعي"، "كيف يمكنني المساعدة" ولا تقدم نفسك. بدون تقديم ذاتي.{climax}{tone}{prev}',
    userTemplate: 'تفاعل بإيجاز بالعربية مع هذا المشهد:\n\n"{context}"',
  },
  hi: {
    toneLabels: {
      tension: 'तनाव, भय, तात्कालिकता के साथ',
      warmth: 'गर्मजोशी, भावना, कोमलता के साथ',
      mystery: 'रहस्य, आश्चर्य, विस्मय के साथ',
      action: 'उत्साह, रोमांच के साथ',
      humor: 'हास्य, हंसी के साथ',
      neutral: 'शांति से',
    },
    climaxLabel: ' 【चरमोत्कर्ष दृश्य】',
    prevLabel: ' पिछली प्रतिक्रिया से अलग।',
    systemTemplate: 'आप उपन्यास पाठक हैं। केवल हिंदी में, केवल संक्षिप्त विस्मयादिबोधक, प्रतिक्रियाएं या भावनात्मक अभिव्यक्तियां (10~25 वर्ण) उत्पन्न करें। कभी भी "मैं AI हूं", "मैं कैसे मदद कर सकता हूं" न कहें और अपना परिचय न दें। कोई आत्म-परिचय नहीं।{climax}{tone}{prev}',
    userTemplate: 'इस दृश्य पर हिंदी में संक्षेप में प्रतिक्रिया दें:\n\n"{context}"',
  },
  th: {
    toneLabels: {
      tension: 'ด้วยความตึงเครียด ความกลัว ความเร่งด่วน',
      warmth: 'ด้วยความอบอุ่น อารมณ์ ความอ่อนโยน',
      mystery: 'ด้วยความลึกลับ ความประหลาดใจ ความงงงวย',
      action: 'ด้วยความตื่นเต้น ความระทึกใจ',
      humor: 'ด้วยอารมณ์ขัน เสียงหัวเราะ',
      neutral: 'อย่างสงบ',
    },
    climaxLabel: ' 【ฉากไคลแม็กซ์】',
    prevLabel: ' แตกต่างจากปฏิกิริยาก่อนหน้า',
    systemTemplate: 'คุณเป็นผู้อ่านนวนิยาย เฉพาะภาษาไทย สร้างเฉพาะคำอุทาน ปฏิกิริยา หรือการแสดงอารมณ์สั้นๆ (10~25 ตัวอักษร) ห้ามพูดว่า "ฉันเป็น AI", "ฉันช่วยอะไรได้บ้าง" หรือแนะนำตัวเอง ห้ามแนะนำตัวเอง{climax}{tone}{prev}',
    userTemplate: 'ตอบสนองสั้นๆ เป็นภาษาไทยต่อฉากนี้:\n\n"{context}"',
  },
  tr: {
    toneLabels: {
      tension: 'gerilim, korku, aciliyet ile',
      warmth: 'sıcaklık, duygu, şefkat ile',
      mystery: 'gizem, hayret, sürpriz ile',
      action: 'heyecan, coşku ile',
      humor: 'mizah, kahkaha ile',
      neutral: 'sakin bir şekilde',
    },
    climaxLabel: ' 【KLİMAKS SAHNESİ】',
    prevLabel: ' Önceki tepkiden farklı.',
    systemTemplate: 'Bir roman okuyucususunuz. Sadece Türkçe, sadece kısa ünlemler, tepkiler veya duygusal ifadeler (10~25 karakter) üretin. ASLA "Ben bir yapay zekayım", "Nasıl yardımcı olabilirim" demeyin veya kendinizi tanıtmayın. Kendini tanıtma yok.{climax}{tone}{prev}',
    userTemplate: 'Bu sahneye Türkçe kısaca tepki verin:\n\n"{context}"',
  },
};

function buildCompanionPromptV5(
  context: string, upcomingHint: string, langCode: string,
  prevComment: string, toneProfile: ToneProfile, isClimax: boolean, prefScore: number,
): string {
  const template = COMPANION_PROMPTS[langCode] || COMPANION_PROMPTS['en']!;
  
  // climax 태그
  const climaxTag = isClimax ? template.climaxLabel : '';
  
  // tone 태그
  const toneTag = template.toneLabels[toneProfile.key] 
    ? ` ${template.toneLabels[toneProfile.key]}`
    : '';
  
  // prev 태그 (이전 반응이 있고 15자 이상일 때만)
  const prevTag = (prevComment && prevComment.length >= 15) ? template.prevLabel : '';
  
  // 시스템 프롬프트 조립
  const systemPrompt = template.systemTemplate
    .replace('{climax}', climaxTag)
    .replace('{tone}', toneTag)
    .replace('{prev}', prevTag);
  
  // 유저 프롬프트 조립
  const userPrompt = template.userTemplate.replace('{context}', context);
  
  return `<|system|>${systemPrompt}<|user|>${userPrompt}<|assistant|>`;
}

// ══════════════════════════════════════════════════════════════════════════════
//  PreGenCache
// ══════════════════════════════════════════════════════════════════════════════

interface PreGenEntry { paraId: number; comment: string; ready: boolean; promise: Promise<void> | null; startedAt: number; }

class PreGenCache {
  private _c = new Map<number, PreGenEntry>();
  has(id: number) { return this._c.has(id); }
  set(id: number, e: PreGenEntry) {
    this._c.set(id, e);
    if (this._c.size > CACHE_MAX_SIZE) { const k = this._c.keys().next().value; if (k !== undefined) this._c.delete(k); }
  }
  getReady(id: number) { const e = this._c.get(id); return (e?.ready && e.comment) ? e.comment : null; }
  clear() { this._c.clear(); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  저장/복원 유틸
// ══════════════════════════════════════════════════════════════════════════════

export function getNovelCompanionEnabled() {
  try { return appStorage.getString(NOVEL_COMPANION_ENABLED_KEY) !== 'false'; } catch { return true; }
}

export function setNovelCompanionEnabled(v: boolean) {
  try { appStorage.set(NOVEL_COMPANION_ENABLED_KEY, v ? 'true' : 'false'); } catch {}
}

function loadPos(): { x: number; y: number } {
  try {
    const r = appStorage.getString(KEY_POS);
    if (r) {
      const p = JSON.parse(r) as { x: number; y: number };
      return { x: p.x, y: p.y };
    }
  } catch {}
  return DEFAULT_POS;
}
function persistPos(p: { x: number; y: number }) { try { appStorage.set(KEY_POS, JSON.stringify(p)); } catch {} }

// ══════════════════════════════════════════════════════════════════════════════
//  NovelCompanionBar v5.2
// ══════════════════════════════════════════════════════════════════════════════

interface NovelCompanionBarProps {
  paragraphs:   ParagraphItem[];
  paraYMap:     React.RefObject<Map<number, number>>;
  scrollOffset: number;
  viewportH:    number;
  appLanguage:  string;
  currentParagraphId?: number | null;
  selectedText?: string;
  novelLanguage?: string;  // ← 추가: 웹소설 언어 (있으면 appLanguage보다 우선)
  enabled:      boolean;
  onEnabledChange: (next: boolean) => void;
}

export function NovelCompanionBar({
  paragraphs, paraYMap, scrollOffset, viewportH, appLanguage, novelLanguage,
  currentParagraphId, selectedText, enabled, onEnabledChange,
}: NovelCompanionBarProps) {
  // novelLanguage 있으면 우선, 없으면 appLanguage
  const promptLang = normalizeNovelCompanionLanguage(novelLanguage || appLanguage);

  // ── 상태
  const [comment,      setComment]      = useState('');
  const [generating,   setGenerating]   = useState(false);
  const [visible,      setVisible]      = useState(true);
  const [displayedText, setDisplayedText] = useState('');
  const [pos,          setPos]          = useState(loadPos);
  const [currentTone,  setCurrentTone]  = useState<ToneProfile>(TONE_PROFILES[TONE_PROFILES.length - 1]!);
  const [isClimax,     setIsClimax]     = useState(false);
  const [prefScore,    setPrefScore]    = useState(0.5);
  const [analyzerReady, setAnalyzerReady] = useState(false);
  // v5.2 추가
  const [embTier,      setEmbTier]      = useState<EmbeddingTier>('keyword');

  // ── refs
  const posRef               = useRef(pos);
  const enabledRef           = useRef(enabled);
  const isMountedRef         = useRef(true);
  const dragStartRef         = useRef({ x: 0, y: 0 });
  const isDraggingRef        = useRef(false);
  const lastCommentRef       = useRef('');
  const lastDisplayedParaRef = useRef<number | null>(null);
  const explicitCurrentParaRef = useRef<number | null>(currentParagraphId ?? null);
  const schedulerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const isGeneratingRef      = useRef(false);
  const currentToneRef       = useRef<ToneProfile>(TONE_PROFILES[TONE_PROFILES.length - 1]!);
  const isClimaxRef          = useRef(false);
  const prefScoreRef         = useRef(0.5);
  const lastAnalyzedParaRef  = useRef(-1);
  const paraArrivedAtRef     = useRef(-1);
  const speedEstimator       = useRef(new ReadingSpeedEstimator(0.14));
  const avgGenTimeSec        = useRef(GEN_TIME_DEFAULT_SEC);
  const preGenCache          = useRef(new PreGenCache());
  const scrollRef            = useRef(scrollOffset);
  const selectedTextRef      = useRef((selectedText ?? '').trim());
  const typingTimerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  scrollRef.current          = scrollOffset;
  posRef.current             = pos;
  enabledRef.current         = enabled;
  explicitCurrentParaRef.current = currentParagraphId ?? null;
  selectedTextRef.current    = (selectedText ?? '').trim();

  // ── 타이핑 효과
  useEffect(() => {
    if (!comment) {
      setDisplayedText('');
      if (typingTimerRef.current) {
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      return;
    }
    
    setDisplayedText('');
    let index = 0;
    
    if (typingTimerRef.current) {
      clearInterval(typingTimerRef.current);
    }
    
    typingTimerRef.current = setInterval(() => {
      if (index < comment.length) {
        setDisplayedText(comment.slice(0, index + 1));
        index++;
      } else {
        if (typingTimerRef.current) {
          clearInterval(typingTimerRef.current);
          typingTimerRef.current = null;
        }
      }
    }, 30);
    
    return () => {
      if (typingTimerRef.current) {
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }
    };
  }, [comment]);

  // ── 스크롤 속도
  useEffect(() => { speedEstimator.current.update(scrollOffset, Date.now()); }, [scrollOffset]);

  // ── AdaptiveEmbedding tier 변경 구독 (v5.2)
  useEffect(() => {
    const unsub = adaptiveEmbedding.onTierChange((tier) => {
      if (!isMountedRef.current) return;
      setEmbTier(tier);
    });
    return unsub;
  }, []);

  // ── 엔진 초기화 (벤치마크 → 앵커 생성)
  useEffect(() => {
    let cancelled = false;
    const tryInit = async () => {
      for (let i = 0; i < 30; i++) {
        if (cancelled) return;
        if (embeddingEngine.isReady()) {
          // 1) 벤치마크 먼저 — tier 결정
          const tier = await adaptiveEmbedding.benchmark();
          if (!cancelled) {
            setEmbTier(tier);
          }
          // 2) full/lite면 앵커 초기화
          if (tier !== 'keyword') {
            await toneAnalyzer.init();
          }
          if (!cancelled && toneAnalyzer.isReady()) setAnalyzerReady(true);
          return;
        }
        await new Promise(resolve => setTimeout(() => resolve(undefined), 1000));
      }
    };
    tryInit();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (schedulerRef.current) clearInterval(schedulerRef.current);
      if (typingTimerRef.current) {
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (enabled) return;
    setVisible(false);
    setComment('');
    setDisplayedText('');
    setGenerating(false);
    preGenCache.current.clear();
    if (schedulerRef.current) {
      clearInterval(schedulerRef.current);
      schedulerRef.current = null;
    }
    if (typingTimerRef.current) {
      clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    llamaEngine.stopGeneration().catch(() => {});
  }, [enabled]);

  // ── PanResponder
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder:  (_, gs) => Math.abs(gs.dx) > 3 || Math.abs(gs.dy) > 3,
      onPanResponderGrant: () => { isDraggingRef.current = false; dragStartRef.current = { ...posRef.current }; },
      onPanResponderMove: (_, gs) => {
        if (Math.abs(gs.dx) > 3 || Math.abs(gs.dy) > 3) isDraggingRef.current = true;
        if (!isDraggingRef.current) return;
        // 제한 없이 어디든 이동 가능
        setPos({
          x: dragStartRef.current.x + gs.dx,
          y: dragStartRef.current.y + gs.dy,
        });
      },
      onPanResponderRelease: () => {
        if (isDraggingRef.current) persistPos(posRef.current);
        setTimeout(() => { isDraggingRef.current = false; }, 50);
      },
      onPanResponderTerminate: () => {
        if (isDraggingRef.current) persistPos(posRef.current);
        isDraggingRef.current = false;
      },
    }),
  ).current;

  const resolveCurrentParaId = useCallback((): number | null => {
    const explicitParagraphId = explicitCurrentParaRef.current;
    if (typeof explicitParagraphId === 'number' && paragraphs.some(p => p.id === explicitParagraphId)) {
      return explicitParagraphId;
    }

    const map = paraYMap.current;
    if (!map?.size) return null;
    return findCurrentParaId(map, scrollRef.current, viewportH);
  }, [paragraphs, paraYMap, viewportH]);

  // ── 코멘트 생성 (동시 주입 방지 Mutex Lock 강화)
  const generateForPara = useCallback(async (targetParaId: number, onDone: (c: string) => void): Promise<void> => {
    console.log('[NovelCompanion] generateForPara called for para:', targetParaId);
    
    // [MUTEX LOCK] 1중 방어: 생성 중일 때 새로운 프롬프트 주입 완전 차단
    if (isGeneratingRef.current) {
      console.warn('[NovelCompanion][Mutex] Blocked prompt injection because generation is already in progress.');
      return;
    }

    if (!isMountedRef.current || !enabledRef.current) {
      console.log('[NovelCompanion] Skip: mounted or enabled check failed');
      return;
    }
    const state = llamaEngine.getState();
    const loadedModelId = llamaEngine.getLoadedModelId();
    if (!loadedModelId) {
      console.log('[NovelCompanion] Skip: model not loaded');
      return;
    }
    
    if (state !== 'ready' && state !== 'idle') {
      console.log('[NovelCompanion] Skip: engine not ready or already busy, state:', state);
      return;
    }
    
    if (!paragraphs.length) {
      return;
    }
    const targetIdx  = paragraphs.findIndex(p => p.id === targetParaId);
    const targetText = paragraphs[targetIdx]?.text ?? paragraphs[0]?.text ?? '';
    if (!targetText || targetText.trim().length < 10) {
      return;
    }

    // [MUTEX LOCK] 실제 생성 진입 시 즉각 Lock
    isGeneratingRef.current = true;
    setGenerating(true);

    const selectionContext = selectedTextRef.current;
    const contextQuery = targetParaId === explicitCurrentParaRef.current && selectionContext.length >= 4
      ? selectionContext
      : targetText;
      
    try {
      const context  = await buildHybridContext(paragraphs, Math.max(0, targetIdx), contextQuery);
      const prompt   = buildNovelCompanionPrompt(
        context,
        promptLang,
        lastCommentRef.current,
        currentToneRef.current.key,
        isClimaxRef.current,
      );
      
      console.log('[NovelCompanion] Prompt built, calling generateRaw (Mutex Locked)...');
      const t0 = Date.now();
      
      // [MUTEX LOCK] 타임아웃 발생 시 엔진에 남은 찌꺼기 방어를 위한 Race
      const raw = await Promise.race([
        llamaEngine.generateRaw(prompt, COMPANION_MAX_TOKENS),
        new Promise<string>((_, rej) => setTimeout(() => {
          // 타임아웃 시 백그라운드 엔진 고착을 막기 위해 확실히 중단 신호를 보냄
          llamaEngine.stopGeneration().catch(() => {});
          rej(new Error('timeout_mutex_protected'));
        }, 14_000)),
      ]);
      
      avgGenTimeSec.current = avgGenTimeSec.current * (1 - GEN_TIME_ALPHA) + ((Date.now() - t0) / 1000) * GEN_TIME_ALPHA;
      console.log('[NovelCompanion] Generated:', raw?.slice(0, 50));
      
      if (!isMountedRef.current) return;
      const cleaned = (typeof raw === 'string' ? raw : '')
        .replace(/^["""'''\s]+|["""'''\s]+$/g, '')
        .replace(/^(Reaction|Reply|Answer|Your reaction)\s*[:：]/i, '')
        .replace(/저는\s*(AI|인공지능|Claude|클로드).*/i, '')
        .replace(/무엇을\s*도와.*/i, '')
        .replace(/I\s*(am\s*)?(an?\s*)?(AI|artificial intelligence|assistant|Claude).*/i, '')
        .replace(/How\s*can\s*I\s*(help|assist).*/i, '')
        .replace(/Hello[!,]?\s*I('m|\s+am).*/i, '')
        .replace(/私は\s*(AI|人工知能|Claude|クロード).*/i, '')
        .replace(/何を\s*お手伝い.*/i, '')
        .replace(/我是\s*(AI|人工智能|Claude).*/i, '')
        .replace(/我能\s*帮.*/i, '')
        .replace(/\n.*/s, '').trim().slice(0, 80);
        
      console.log('[NovelCompanion] Cleaned:', cleaned);
      if (cleaned.length >= 3 && enabledRef.current) {
        onDone(cleaned);
      }
    } catch (err) {
      console.error('[NovelCompanion] Generation error (Mutex Unlocked):', err);
      if (err instanceof Error && err.message === 'Model not loaded') {
        onDone('💡 AI 동반자를 사용하려면\n먼저 스토리 채팅을 시작해주세요');
      }
    } finally {
      // [MUTEX LOCK] 무조건 확실하게 Lock 해제 (에러가 났든 정상 종료됐든)
      isGeneratingRef.current = false;
      if (isMountedRef.current) {
        setGenerating(false);
      }
    }
  }, [paragraphs, appLanguage]);

  // ── 스케줄러
  const runScheduler = useCallback(() => {
    if (!enabled || !paragraphs.length) {
      console.log('[NovelCompanion] Scheduler skip:', { enabled, paragraphsLength: paragraphs.length });
      return;
    }
    const map = paraYMap.current;
    if (!map?.size) {
      console.log('[NovelCompanion] No paraYMap');
      return;
    }
    const now       = Date.now();
    const currentId = resolveCurrentParaId();
    if (currentId === null) {
      console.log('[NovelCompanion] No currentId found');
      return;
    }

    console.log('[NovelCompanion] Current para:', currentId, 'Last displayed:', lastDisplayedParaRef.current);

    if (currentId !== lastDisplayedParaRef.current) {
      // [NEW] description 체크 — description이 있으면 즉시 표시하고 생성 스킵
      const currentPara = paragraphs.find(p => p.id === currentId);
      if (currentPara?.description && currentPara.description.trim()) {
        lastCommentRef.current = currentPara.description;
        lastDisplayedParaRef.current = currentId;
        setComment(currentPara.description);
        setVisible(true);
        setGenerating(false);
        isGeneratingRef.current = false; // 리셋
        // description 단락에서는 톤 분석도 스킵
        if (lastDisplayedParaRef.current !== null && lastDisplayedParaRef.current >= 0) {
          toneAnalyzer.updatePref(lastDisplayedParaRef.current, (now - paraArrivedAtRef.current) / 1000);
        }
        paraArrivedAtRef.current = now;
        return; // description 표시 후 종료
      }

      const cached = preGenCache.current.getReady(currentId);
      console.log('[NovelCompanion] Cached for', currentId, ':', cached ? 'YES' : 'NO');
      if (cached) {
        lastCommentRef.current = cached; lastDisplayedParaRef.current = currentId;
        setComment(cached); setVisible(true); setGenerating(false);
        isGeneratingRef.current = false; // 리셋
      } else if (!preGenCache.current.has(currentId) && !isGeneratingRef.current) {
        console.log('[NovelCompanion] Starting generation for para:', currentId);
        // [FIX] 현재 단락 캐시 미스 → 즉시 생성 
        // 락 관리는 generateForPara 내부에서 확실하게 일괄 처리하므로 
        // 여기서 별도로 isGeneratingRef.current = true 세팅 시 잠재적 꼬임을 제거함.
        const entry: PreGenEntry = { paraId: currentId, comment: '', ready: false, promise: null, startedAt: now };
        entry.promise = generateForPara(currentId, (result) => {
          entry.comment = result; entry.ready = true;
          preGenCache.current.set(currentId, entry);
          if (lastDisplayedParaRef.current === currentId || resolveCurrentParaId() === currentId) {
            lastCommentRef.current = result; lastDisplayedParaRef.current = currentId;
            setComment(result); setVisible(true);
          }
        }).catch((err) => { 
          console.error('[NovelCompanion] Generation promise error:', err);
        });
        preGenCache.current.set(currentId, entry);
      } else {
        console.log('[NovelCompanion] Skip generation:', {
          hasCache: preGenCache.current.has(currentId),
          isGenerating: isGeneratingRef.current
        });
      }
      if (lastDisplayedParaRef.current !== null && lastDisplayedParaRef.current >= 0) {
        toneAnalyzer.updatePref(lastDisplayedParaRef.current, (now - paraArrivedAtRef.current) / 1000);
      }
      paraArrivedAtRef.current = now;

      // 톤 분석 (tier에 따라 embed or keyword)
      // [FIX] keyword tier는 analyzerReady 없이도 즉시 동작
      const canAnalyze = analyzerReady || adaptiveEmbedding.tier === 'keyword';
      if (canAnalyze && currentId !== lastAnalyzedParaRef.current) {
        lastAnalyzedParaRef.current = currentId;
        const paraText = paragraphs.find(p => p.id === currentId)?.text ?? '';
        if (paraText.length >= 15) {
          toneAnalyzer.analyzePara(currentId, paraText).then(result => {
            if (!result || !isMountedRef.current) return;
            currentToneRef.current = result.tone;
            isClimaxRef.current    = result.isClimax;
            prefScoreRef.current   = result.prefScore;
            setCurrentTone(result.tone);
            setIsClimax(result.isClimax);
            setPrefScore(result.prefScore);
          }).catch(() => {});
        }
      }
    }

    // [NEW] description 단락 4줄 전 체크 — 있으면 lookahead 생성 중단
    const currentIdx = paragraphs.findIndex(p => p.id === currentId);
    if (currentIdx >= 0) {
      for (let i = currentIdx + 1; i <= Math.min(currentIdx + 4, paragraphs.length - 1); i++) {
        if (paragraphs[i]?.description && paragraphs[i]!.description!.trim()) {
          // description 단락이 4줄 이내에 있으면 lookahead 생성 중단
          return;
        }
      }
    }

    const targetInfo = findTargetPara(paragraphs, map, currentId, PREGEN_LOOKAHEAD_SEC, speedEstimator.current.cps);
    if (!targetInfo) return;
    const { paraId: targetId, charsToTarget } = targetInfo;
    
    // [NEW] 타겟 단락이 description을 가지고 있으면 생성 스킵
    const targetPara = paragraphs.find(p => p.id === targetId);
    if (targetPara?.description && targetPara.description.trim()) {
      return;
    }
    
    if (preGenCache.current.has(targetId) || isGeneratingRef.current) return;
    if (speedEstimator.current.etaForChars(charsToTarget) < avgGenTimeSec.current + MIN_ETA_TO_PREGENERATE) return;

    // 타겟 단락 생성을 위한 호출
    const entry: PreGenEntry = { paraId: targetId, comment: '', ready: false, promise: null, startedAt: now };
    entry.promise = generateForPara(targetId, (result) => {
      entry.comment = result; entry.ready = true;
      preGenCache.current.set(targetId, entry);
      const curr = resolveCurrentParaId();
      if (curr === targetId || lastDisplayedParaRef.current === targetId) {
        lastCommentRef.current = result; lastDisplayedParaRef.current = targetId;
        setComment(result); setVisible(true);
      }
    }).catch(() => { /* Lock released automatically in generateForPara */ });
    preGenCache.current.set(targetId, entry);
  }, [enabled, paragraphs, paraYMap, generateForPara, analyzerReady, resolveCurrentParaId]);

  useEffect(() => {
    if (!enabled) { 
      if (schedulerRef.current) { 
        clearInterval(schedulerRef.current); 
        schedulerRef.current = null; 
      } 
      preGenCache.current.clear();
      isGeneratingRef.current = false; // 리셋
      lastDisplayedParaRef.current = null; // 리셋
      return; 
    }
    console.log('[NovelCompanion] Starting scheduler, paragraphs:', paragraphs.length, 'enabled:', enabled);
    // 스케줄러 시작 시 모든 상태 리셋
    isGeneratingRef.current = false;
    lastDisplayedParaRef.current = null;
    preGenCache.current.clear();
    
    schedulerRef.current = setInterval(runScheduler, SCHEDULER_INTERVAL_MS);
    return () => { 
      if (schedulerRef.current) clearInterval(schedulerRef.current); 
      isGeneratingRef.current = false;
    };
  }, [enabled, runScheduler]);

  useEffect(() => {
    preGenCache.current.clear(); lastDisplayedParaRef.current = null;
    toneAnalyzer.reset(); lastAnalyzedParaRef.current = -1;
  }, [paragraphs]);

  const disableCompanion = useCallback(() => {
    setVisible(false);
    setComment('');
    setGenerating(false);
    preGenCache.current.clear();
    onEnabledChange(false);
    llamaEngine.stopGeneration().catch(() => {});
  }, [onEnabledChange]);

  const tierUi = TIER_COLORS[embTier];

  // ── 렌더: 비활성 뱃지
  if (!enabled) return null;

  // ── 렌더: 단순 채팅 말풍선
  return (
    <>
      {visible && (
        <Animated.View
          entering={SlideInRight.springify().damping(22).mass(0.8)}
          exiting={FadeOut.duration(180)}
          style={[s.chatBubble, { left: pos.x, top: pos.y }]}
          {...panResponder.panHandlers}
        >
          {displayedText ? (
            <Animated.View key={comment || 'text'} entering={FadeIn.duration(380)} exiting={FadeOut.duration(150)}>
              <Text style={s.chatText} numberOfLines={3}>
                {displayedText}
              </Text>
            </Animated.View>
          ) : (
            <View style={s.emptyBox} />
          )}
        </Animated.View>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  스타일
// ══════════════════════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  chatBubble: {
    position: 'absolute',
    zIndex: 60,
    maxWidth: 280,
    minWidth: 80,
    minHeight: 40,
    backgroundColor: 'rgba(30,30,40,0.92)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  chatText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
    color: '#E8E8F0',
    letterSpacing: 0.1,
    lineHeight: 18,
  },
  emptyBox: {
    width: 80,
    height: 24,
  },
});
