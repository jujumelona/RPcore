
// src/screens/StoryEditorScreen.AIModal.tsx
// ═══════════════════════════════════════════════════════════════════════
// AI 도우미 모달 — 스토리/캐릭터/챕터 자동 생성 + 다국어 번역 통합 UI
// ═══════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Modal, ScrollView } from 'react-native';
import { PressableOpacity } from '../../../components/PressableOpacity';
import { ToastService } from '../../../components/Toast';
import { Radius, Shadow, Typography } from '../../../constants/tokens';
import { LANGUAGE_LIST } from '../../../i18n/languages';
import { clipboardSetString, clipboardGetString } from '../../../utils/ClipboardUtils';
import { BwIcoCopy, BwIcoPaste, BwIcoDiamond, BwIcoCheck, BwIcoTrash, BwIcoRefresh } from './StoryEditorIcons';
import { useLanguageStore } from '../../../store/languageStore';
import { getScreenTranslations } from '../../../i18n/SCREENS-TRANSLATION';
import { getStoryEditorTranslateCopy, getAIGenrePresets } from '../../../i18n/storyEditorTranslateCopy';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useShallow } from 'zustand/react/shallow';
import { X, ArrowLeft } from 'lucide-react-native';

export function AIAssistantModal({ visible, onClose, onApply }: { visible: boolean; onClose: () => void; onApply: (data: import('../../../types/StoryContract').StoryConfig) => void; }) {
  const { appLanguage, t } = useLanguageStore(
    useShallow((s) => ({
      appLanguage: s.appLanguage,
        t: s.t })),
  );
  const st = getScreenTranslations(appLanguage);
  const copy = getStoryEditorTranslateCopy(appLanguage);
  const genrePresets = getAIGenrePresets(appLanguage);
  const [input, setInput] = useState('');
  const [chapterCount, setChapterCount] = useState('12');
  const [loading, setLoading] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [step, setStep] = useState<'copy' | 'paste'>('copy');
  const [pasteText, setPasteText] = useState('');

  const resetModal = () => {
    setStep('copy');
    setPasteText('');
    setInput('');
    setSelectedPreset(null);
  };

  // ── 프롬프트 생성 ────────────────────────────────────────
  const buildFullPrompt = (effectiveInput: string, chapCount: number) => {
    const half = Math.ceil(chapCount / 2);
    const endA = Math.min(half + 1, chapCount);
    const endB = Math.min(half + 2, chapCount);
    const treeLines = [
      `  START -> CH1 (인트로) -> CH2 (선택지로 분기)`,
      `  CH2 선택A ──► CH3 (루트 A 진입)`,
      `  CH2 선택B ──► CH4 (루트 B 진입)`,
      `  CH3 선택A ──► CH${endA} (루트A 결말방향)`,
      `  CH3 선택B ──► CH${endB} (루트A/B 교차점)`,
      `  CH4 선택A ──► CH${endB} (교차점 합류)`,
      `  CH4 선택B ──► CH${Math.min(endB + 1, chapCount)} (비극루트)`,
      `  ... CH${chapCount - 1}, CH${chapCount} = 다중 엔딩 챕터 (IS_ENDING: YES 표시, CHOICE 없음)`,
      ``,
      `  ★ 중요: CHOICE의 | 뒤에 반드시 이동할 챕터 ID를 명시 (예: CH3, CH9)`,
      `  ★ 엔딩 챕터: IS_ENDING: YES 표시. 마지막 인덱스가 아니어도 엔딩 가능`,
    ].join('\n');

    // CH1만 INTRO 포함 — 나레이션은 순수 상황/배경 묘사만, 캐릭터 행동은 캐릭터 대사 안에 포함
    const ch1Block = [
      `CH1: AI가 이끌어야 할 방향·배경·분위기 설명 50자 이상`,
      `CH1_INFO: 이 챕터의 핵심 설정·장소·시간대·분위기 등 추가정보 30자+`,
      `CH1_CGOAL_1: 캐릭터1이름 | 챕터1에서 이 캐릭터의 목표와 숨겨진 의도 (상세히)`,
      `CH1_CGOAL_2: 캐릭터2이름 | 챕터1에서 이 캐릭터의 목표와 숨겨진 의도 (상세히)`,
      `CH1_INTRO_1: 0:나레이션 — 장소·시간·분위기만 간결하게 묘사. 캐릭터 행동 포함 금지. 40자 이내`,
      `CH1_INTRO_2: 2:캐릭터1이름 | 첫 등장 대사 + 행동·감정 묘사 포함. *속마음은 *별표* 사이에*`,
      `CH1_INTRO_3: 2:캐릭터1이름 | 이어지는 대사 또는 행동. 캐릭터가 하는 모든 것은 이 형식으로`,
      `CH1_CHOICE_A: 선택지A 구체적 행동/대사 (적극·긍정 방향) | CH3`,
      `CH1_CHOICE_B: 선택지B 구체적 행동/대사 (신중·소극 방향) | CH4`,
    ].join('\n');

    const ch2Block = chapCount >= 2 ? '\n\n' + [
      `CH2: AI 방향·배경 50자`,
      `CH2_INFO: 이 챕터의 핵심 설정·장소·시간대·분위기 30자+`,
      `CH2_CGOAL_1: 캐릭터1이름 | 챕터2 목표`,
      `CH2_CGOAL_2: 캐릭터2이름 | 챕터2 목표`,
      `CH2_CHOICE_A: 선택지A | CH3`,
      `CH2_CHOICE_B: 선택지B | CH4`,
    ].join('\n') : '';

    const ch3Block = chapCount >= 3 ? '\n\n' + [
      `CH3: AI 방향·배경 50자 (루트A 진입)`,
      `CH3_INFO: 이 챕터의 핵심 설정·분위기·시간대 30자+`,
      `CH3_CGOAL_1: 캐릭터1이름 | 챕터3 목표`,
      `CH3_CGOAL_2: 캐릭터2이름 | 챕터3 목표`,
      `CH3_CHOICE_A: 선택지A | CH${Math.min(5, chapCount)}`,
      `CH3_CHOICE_B: 선택지B | CH${Math.min(6, chapCount)}`,
    ].join('\n') : '';

    const remaining = chapCount > 3 ? `\n\n※ 위 패턴으로 CH4~CH${chapCount}까지 동일하게 작성 (INTRO는 CH1만, 나머지는 생략)
※ 엔딩 챕터는 IS_ENDING: YES 표시 — 다중 엔딩 가능 (예: CH8선택A→CH9엔딩, CH8선택B→CH10엔딩)
※ 엔딩 챕터에는 CHOICE 없이 IS_ENDING: YES만 포함
※ 모든 챕터에 _INFO, _CGOAL_N, _CHOICE_A/B(엔딩 제외) 포함
※ CHOICE의 | 뒤 챕터 ID는 반드시 정확하게: CH5, CH9 등 (앞 챕터로 돌아가면 절대 안됨)
※ CH1~CH${chapCount} 전부 빠짐없이 생성. 중간 생략/멈춤 절대 금지` : '';

    return `당신은 인터랙티브 스토리 게임 시나리오 작가입니다.

스토리 요청: ${effectiveInput}
총 챕터 수: ${chapCount}개 | 캐릭터: 2-3명

【절대 규칙】
- 아래 KEY: VALUE 형식만 출력
- 설명·부연·질문·마크다운·인사말 절대 금지
- 한 줄에 하나의 KEY만 출력
- 긴 내용도 한 줄로 (줄바꿈 없이)

━━ 기본 정보 ━━
TITLE: 스토리 제목 20자 이내
DESC: 소개글 100-120자 (핵심갈등·감성훅 포함)
TAGS: #태그1 #태그2 #태그3 #태그4
WORLD: 세계관 설명 200자 이상 (역사·규칙·분위기·특수설정 상세히)

━━ 캐릭터 2-3명 ━━
※ CHAR 형식: 이름 | 나이 | 성별(남성/여성/기타) | 성격·말투·동기·약점 60자+ | 외모·직업·특징 30자+ | [상황] "대사" (행동) *속마음*
CHAR_1: 이름 | 나이(숫자+세) | 남성또는여성 | 성격·말투·동기·약점 60자+ | 외모·직업·특징 30자+ | [상황설명] "대표 대사" (행동/표정) *속마음*
CHAR_2: 이름2 | 나이 | 성별 | 성격·말투·동기·약점 60자+ | 외모·직업·특징 30자+ | [상황설명] "대사" (행동) *속마음*

━━ 인트로 작성 규칙 (CH1만 해당) ━━
나레이션(ID=0): 장소·시간·배경 분위기만 짧게. 캐릭터가 무엇을 하거나 말하는 것은 포함 금지.
캐릭터(ID=2+): 대사 + 자신의 행동·감정 묘사 모두 포함. *속마음*/**행동** 활용.
CH2 이후 챕터: INTRO 없음 — AI가 채팅 중 자연스럽게 이어감.

━━ 챕터 분기 트리 (정확히 ${chapCount}개) ━━
/* 트리 구조:
${treeLines}
*/

/* 출력 형식:
   CHN: AI가 이끌어야 할 방향·배경·분위기 설명 50자+
   CHN_INFO: 이 챕터의 특수 조건·힌트·추가설명 (선택, 없으면 생략)
   CHN_CGOAL_번호: 캐릭터이름 | 이 챕터에서 캐릭터 목표
   ★ INTRO는 CH1에만 작성. CH1_INTRO_1 / CH1_INTRO_2 / CH1_INTRO_3 키만 허용.
     CH2 이후 챕터에 INTRO 줄 절대 쓰지 말 것 — 앱에서 전부 무시됨.
     0=나레이터(배경/상황만), 1=유저, 2+=캐릭터(대사+행동 모두)
   CHN_CHOICE_A: 선택지A 텍스트 | CH이동목적지번호
   CHN_CHOICE_B: 선택지B 텍스트 | CH이동목적지번호
   IS_ENDING: YES  ← 엔딩 챕터에 반드시 추가
*/
${ch1Block}${ch2Block}${ch3Block}${remaining}

【최종 체크】
CORE 2-3개 ✓ | CHAR 2-3명 ✓ | CH1~CH${chapCount} 전부 빠짐없이 ✓
INTRO는 CH1만 (3줄: 나레이션->캐릭터->캐릭터) ✓
나레이션은 배경/상황 묘사만, 캐릭터 행동 없음 ✓
CHOICE | 뒤에 반드시 이동 챕터 ID 명시 ✓
엔딩 챕터 모두 IS_ENDING: YES 표시 ✓
질문/설명 없이 위 형식만 출력 ✓`;
  };

  // ── 클립보드 복사 ────────────────────────────────────────
  const copyPromptToClipboard = () => {
    const effectiveInput = (selectedPreset === '__ai__' || !input.trim())
      ? genrePresets.filter(p => p.value !== '__ai__')[
          Math.floor(Math.random() * (genrePresets.length - 1))
        ].value
      : input.trim();
    const chapCount = Math.max(5, Math.min(50, parseInt(chapterCount, 10) || 12));
    const fullPrompt = buildFullPrompt(effectiveInput, chapCount);
    const ok = clipboardSetString(fullPrompt);
    if (ok) {
      ToastService.success(t?.toastPromptCopied);
    } else {
      ToastService.info(t?.toastClipboardUnavailable);
    }
  };

  // ── 클립보드에서 붙여넣기 (STEP 2) ─────────────────────
  const pasteFromClipboard = async () => {
    try {
      const text = await clipboardGetString();
      if (text) {
        setPasteText(text);
        ToastService.success(t?.toastPasteSuccess);
      } else {
        ToastService.info(t?.clipboardEmpty);
      }
    } catch {
      ToastService.info(t?.pasteFailed);
    }
  };

  const handlePresetSelect = (value: string) => {
    setSelectedPreset(value);
    if (value === '__ai__') {
      setInput('');
    } else {
      setInput(value);
    }
  };

  const handleGenerate = async () => {
    if (!pasteText.trim()) {
      ToastService.info(t?.toastPasteFirst);
      return;
    }

    const chapCount = Math.max(5, Math.min(50, parseInt(chapterCount, 10) || 12));
    setLoading(true);
    try {
      const raw = pasteText;

      // ── 전처리: 한 줄에 여러 KEY: VALUE가 붙어있는 경우 분리 ──
      // "TITLE: 제목 DESC: 설명" -> "TITLE: 제목\nDESC: 설명"
      const ALL_KEYS = '(?:TITLE|DESC|TAGS|WORLD|USER|CHAR_\\d+(?:_NAME|_AGE|_GENDER|_APP|_PER|_EX|_TRAITS)?|CH_\\d+(?:_INTRO(?:_LINE)?_\\d+|_GOAL_\\d+|_CGOAL_\\d+|_EVT_[A-Z]|_CHOICE_[A-Z]|_PREV|_INFO|_AIM|_TITLE|_IS_ENDING)?|LANG_[A-Za-z_-]{2,25})';
      const splitRe = new RegExp('([ \\t])(' + ALL_KEYS + ':)', 'gi');
      const normalized = raw
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/：/g, ':')
        .replace(/\*\*([A-Z0-9_]+)\*\*/gi, '$1')
        .replace(splitRe, '\n$2');

      // ── KEY: VALUE 파싱 ─────────────────────────────
      const kv: Record<string, string> = {};
      for (const line of normalized.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || /^\/\*|^\*\/|^※/.test(trimmed)) continue;
        const clean = trimmed
          .replace(/^#+\s*/, '')
          .replace(/^\*\*([A-Z0-9_]+)\*\*/, '$1')
          .replace(/^[\s\-*>•[\]]+/, '')
          .replace(/^\d+[.)]\s*/, '');
        const idx = clean.indexOf(':');
        if (idx < 1) continue;
        const k = clean.slice(0, idx).trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '').replace(/^_+|_+$/g, '');
        const v = clean.slice(idx + 1).trim();
        if (k && v) kv[k] = v;
      }

      // ── 캐릭터 파싱 ─────────────────────────────────
      // 신 형식A: CHAR_1: 이름 | 나이 | 성별 | 성격 | 특징 | 예시  (6개 이상)
      // 신 형식B: CHAR_1: 이름 | 나이 | 성별  + CHAR_1_PER/CHAR_1_EX 별도 키
      // 구 형식 : CHAR_1: 이름 | 성격 | 예시  (3개 미만)
      // CHAR_1_EX: 예시대사
      const charKeys = Object.keys(kv).filter(k => /^CHAR_\d+$/.test(k));
      const charLinesOld = normalized.split('\n').filter(l => /^CHAR:/i.test(l.trim()));
      const characters = charKeys.length > 0
        ? charKeys.sort().map(k => {
            const n = k.match(/^CHAR_(\d+)$/)?.[1] ?? '';
            const p = kv[k].split('|').map((s: string) => s.trim());
            const perKey  = kv[`CHAR_${n}_PER`] || '';  // 별도 성격 키
            const exKey   = kv[`CHAR_${n}_EX`]  || '';  // 별도 예시 키

            // 형식 판별:
            //  6개+ -> 신형식A (이름|나이|성별|성격|특징|예시)
            //  3개이고 CHAR_N_PER 있음 -> 신형식B (이름|나이|성별 + _PER/_EX 별도)
            //  그 외 -> 구형식 (이름|성격|예시)
            const isFullInline = p.length >= 5;
            const isNameAgeGender = p.length === 3 && !!perKey; // 이름|나이|성별 + _PER 있음

            let name: string, age: string, gender: string, personality: string, traits: string, personalityExample: string;

            if (isFullInline) {
              // 신형식A
              name        = p[0] || 'Character';
              age         = p[1] || '';
              gender      = ['남성','여성','기타','男','女'].includes(p[2]) ? p[2] : '';
              personality = p[3] || perKey;
              traits      = p[4] || '';
              personalityExample = p[5] || exKey;
            } else if (isNameAgeGender) {
              // 신형식B: 이름|나이|성별, 성격·예시는 별도 키에
              name        = p[0] || 'Character';
              age         = p[1] || '';
              gender      = ['남성','여성','기타','Male','Female','男','女'].includes(p[2]) ? p[2] : p[2] || '';
              personality = perKey;
              traits      = kv[`CHAR_${n}_TRAITS`] || kv[`CHAR_${n}_APP`] || '';
              personalityExample = exKey;
            } else {
              // 구형식: 이름|성격|예시
              name        = p[0] || 'Character';
              age         = '';
              gender      = '';
              personality = p[1] || perKey;
              traits      = '';
              personalityExample = exKey || p[2] || '';
            }

            return { name, personality, personalityExample, age, gender, traits };
          })
        : charLinesOld.map(l => {
            const p = l.slice(5).split('|');
            return { name: p[0]?.trim() || 'Character', personality: p[1]?.trim() || '', personalityExample: p[2]?.trim() || '', age: '', gender: '', traits: '' };
          });
      if (characters.length === 0) characters.push({ name: 'Character', personality: '', personalityExample: '', age: '', gender: '', traits: '' });

      // ── 챕터 파싱 ────────────────────────────────────
      // CH1:, CH2:, CH_1:, CH_2: 모두 수용
      const chRegex = /^CH_?(\d+)(?:_|$)/;
      const chNums = Array.from(new Set(
        Object.keys(kv)
          .map(k => { const m = k.match(chRegex); return m ? parseInt(m[1], 10) : null; })
          .filter(Boolean) as number[]
      )).sort((a, b) => a - b);

      // ── 다국어 번역 파싱 (스토리) ────────────────────────
      const multiLangData: Record<string, { title: string; description: string; hashtags: string }> = {};
      for (const lang of LANGUAGE_LIST) {
        // ✅ [BUG FIX] zh-CN -> ZH-CN (하이픈 유지) -> buildKV의 ZH_CN 키와 불일치
        const langKey = lang.code.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        const title = kv[`LANG_${langKey}_TITLE`];
        const desc  = kv[`LANG_${langKey}_DESC`];
        const tags  = kv[`LANG_${langKey}_TAGS`];
        if (title || desc) {
          multiLangData[lang.code] = {
            title: title || '',
            description: desc || '',
            hashtags: tags || ''
          };
        }
      }

      // ── 다국어 번역 파싱 (캐릭터) ────────────────────────
      const charMultiLangData: Record<number, Record<string, { name: string; age: string; gender: string; traits: string }>> = {};
      const maxCharIdx = Math.max(5, characters.length); // 실제 파싱된 캐릭터 수 이상 스캔
      for (let charIdx = 1; charIdx <= maxCharIdx; charIdx++) {
        const charId = charIdx + 1; // CHAR_1 -> id: 2, CHAR_2 -> id: 3
        const charTranslations: Record<string, { name: string; age: string; gender: string; traits: string }> = {};
        
        for (const lang of LANGUAGE_LIST) {
          // ✅ [FIX] zh-CN/zh-TW -> ZH_CN/ZH_TW 언더스코어 정규화
          const langKey = lang.code.toUpperCase().replace(/-/g, '_');
          const name = kv[`LANG_${langKey}_CHAR_${charIdx}_NAME`];
          const age = kv[`LANG_${langKey}_CHAR_${charIdx}_AGE`] || '';
          const gender = kv[`LANG_${langKey}_CHAR_${charIdx}_GENDER`] || '';
          const traits = kv[`LANG_${langKey}_CHAR_${charIdx}_TRAITS`] || '';
          
          if (name || age || gender || traits) {
            charTranslations[lang.code] = {
              name: name || '',
              age,
              gender,
              traits
            };
          }
        }
        
        if (Object.keys(charTranslations).length > 0) {
          charMultiLangData[charId] = charTranslations;
        }
      }

      // INTRO 파싱 헬퍼 — 화자 ID 숫자 또는 텍스트 모두 처리
      const parseIntroVal = (val: string): import('../../../types/StoryContract').EditorIntroMessage | null => {
        if (!val) return null;
        const firstColon = val.indexOf(':');
        if (firstColon < 0) return { speakerType: 'narrator', content: val };
        const speakerPart = val.slice(0, firstColon).trim();
        const rest = val.slice(firstColon + 1).trim();
        const speakerNum = parseInt(speakerPart, 10);
        if (!isNaN(speakerNum)) {
          // "0:내레이션", "2:캐릭터이름|대사" 형식
          const pipeIdx = rest.indexOf('|');
          const content = pipeIdx > 0 ? rest.slice(pipeIdx + 1).trim() : rest;
          const speakerType = speakerNum === 0 ? 'narrator' : speakerNum === 1 ? 'user' : 'character';
          return { speakerType, speakerCharId: speakerType === 'character' ? speakerNum : undefined, content };
        } else {
          // 텍스트 화자: "나레이터:내용" 형식
          return { speakerType: 'narrator', content: val };
        }
      };

      const chapters = chNums.length > 0
        ? chNums.map(n => {
            // 챕터 기본 정보 — CH_N: 설명
            const chVal = kv[`CH_${n}`] || kv[`CH${n}`] || '';
            const pipeIdx = chVal.indexOf('|');
            const chDescFromPipe = pipeIdx > 0 ? chVal.slice(pipeIdx + 1).trim() : chVal.trim();
            
            // 챕터는 고정으로 "Chapter 1", "Chapter 2" 등으로 생성되게 함
            const title = `${t?.editorChapterNum} ${n}`;

            // AI 전반 목적: CH_N_AIM 키 우선, 없으면 파이프 이후 설명(또는 전체 CH_N 텍스트)을 aiGoal로 사용
            const aiGoal = kv[`CH_${n}_AIM`] || kv[`CH${n}_AIM`] || chDescFromPipe || '';

            // 이전 요약 - 완전히 제외
            const prevSummary = '';
            // 챕터 추가정보: CH_N_INFO 키 전용
            const chapterInfoRaw = kv[`CH_${n}_INFO`] || kv[`CH${n}_INFO`] || '';

            // 캐릭터 목표: _GOAL_N (구 형식), _CGOAL_N (신 형식) 모두 지원
            // 신 형식: CH_N_GOAL_M: [목표 텍스트] (M = 캐릭터 ID, 파이프 없음)
            // 구 형식: CH_N_GOAL_M: 캐릭터이름 | 목표 텍스트
            const characterGoals: Record<string, string> = {};
            const goalRegex = new RegExp(`^CH_?${n}_(C?GOAL)_(\\d+)$`, 'i');
            Object.keys(kv).filter(k => goalRegex.test(k)).forEach(k => {
              const charIdMatch = k.match(/_(\d+)$/);
              if (!charIdMatch) return;
              const charId = charIdMatch[1]; // 숫자 문자열 — applyAIData에서 parseInt로 처리
              const cv = kv[k].split('|');
              if (cv.length >= 2 && cv[1]?.trim()) {
                // 구 형식: charName | goal
                characterGoals[cv[0].trim()] = cv[1].trim();
              } else {
                // 신 형식: 전체가 목표 텍스트, 키 숫자가 캐릭터 ID
                characterGoals[charId] = kv[k].trim();
              }
            });

            // 인트로 메시지: 챕터 1(CH1)만 파싱 — 나머지 챕터는 AI가 채팅 중 자연스럽게 이어감
            const introMsgs: import('../../../types/StoryContract').EditorIntroMessage[] = [];
            if (n === 1) {
              const introKeys = ['INTRO_LINE', 'INTRO'].flatMap(prefix =>
                Object.keys(kv)
                  .filter(k => new RegExp(`^CH_?${n}_${prefix}_(\\d+)$`, 'i').test(k))
                  .sort((a, b) => {
                    const getNum = (s: string) => parseInt(s.match(/(\d+)$/)?.[1] || '0', 10);
                    return getNum(a) - getNum(b);
                  })
              );
              // 중복 제거 (INTRO_LINE과 INTRO 둘 다 있을 경우 INTRO_LINE 우선)
              const seenNums = new Set<number>();
              for (const ik of introKeys) {
                const numMatch = ik.match(/(\d+)$/);
                const num = numMatch ? parseInt(numMatch[1], 10) : -1;
                if (seenNums.has(num)) continue;
                seenNums.add(num);
                const val = kv[ik];
                // EMO 줄 (숫자만 있는 줄) 건너뜀: "@2: e1+5 | ..." 형식
                if (/^@\d+:/.test(val) || /^e[1-5][=+-]/.test(val.trim())) continue;
                const msg = parseIntroVal(val);
                if (msg) introMsgs.push(msg);
              }
              // 폴백: _INTRO_N / _INTRO_C
              if (introMsgs.length === 0) {
                const iN = kv[`CH${n}_INTRO_N`] || kv[`CH_${n}_INTRO_N`];
                const iC = kv[`CH${n}_INTRO_C`] || kv[`CH_${n}_INTRO_C`];
                if (iN) introMsgs.push({ speakerType: 'narrator', content: iN });
                if (iC) {
                  const pp = iC.split('|');
                  introMsgs.push({ speakerType: 'character', content: pp[1]?.trim() || pp[0]?.trim(), speakerName: pp[0]?.trim() });
                }
              }
            }

            // 선택지 이벤트: EVT_A/B (구 형식), CHOICE_A/B (신 형식) 모두 지원
            const choiceEvents: import('../../../types/StoryContract').ChoiceEvent[] = [];
            const getChVal = (suffix: string) =>
              kv[`CH_${n}_${suffix}`] || kv[`CH${n}_${suffix}`] || '';
            const evtA = getChVal('CHOICE_A') || getChVal('EVT_A');
            const evtB = getChVal('CHOICE_B') || getChVal('EVT_B');
            const evtP = getChVal('CHOICE_P') || getChVal('EVT_P');
            if (evtA || evtB) {
              const parsePipe = (s: string) => {
                if (!s) return ['', ''];
                const idx = s.lastIndexOf('|');
                return idx > 0 ? [s.slice(0, idx).trim(), s.slice(idx + 1).trim()] : [s.trim(), ''];
              };
              const chIdToReal = (s: string) => {
                const m = s?.trim().match(/CH_?(\d+)/i);
                return m ? `chapter_${m[1]}` : s?.trim() || '';
              };
              const [aLabel, aTarget] = parsePipe(evtA || '');
              const [bLabel, bTarget] = parsePipe(evtB || '');
              choiceEvents.push({
                id: `choice_ch${n}_1`,
                prompt: evtP,
                triggerConditions: [{ type: 'cache' as const }],
                options: [
                  { id: `opt_ch${n}_a`, label: aLabel ?? t?.editorChoiceOptA, targetChapterId: chIdToReal(aTarget) ?? `chapter_${Math.min(n + 1, chNums[chNums.length - 1] ?? chapCount)}` },
                  { id: `opt_ch${n}_b`, label: bLabel ?? t?.editorChoiceOptB, targetChapterId: chIdToReal(bTarget) ?? `chapter_${Math.min(n + 2, chNums[chNums.length - 1] ?? chapCount)}` },
                ] });
            }

            // IS_ENDING 파싱 — 다중 엔딩 지원
            const isEndingVal = getChVal('IS_ENDING') || getChVal('ISENDING') || '';
            const isEnding = isEndingVal.trim().toUpperCase() === 'YES' || isEndingVal.trim() === '1';

            return {
              id: n === 1 ? 'chapter_1' : `chapter_${n}`,
              title, aiGoal, characterGoals, prevSummary,
              chapterInfo: chapterInfoRaw,
              triggers: [{ type: 'cache' as const }],
              choiceEvents,
              isEnding,
              introMessages: introMsgs };
          })
        : Array.from({ length: chapCount }, (_, i) => ({
            id: i === 0 ? 'chapter_1' : `chapter_prefill_${i + 1}`,
            title: `챕터 ${i + 1}`, aiGoal: '', characterGoals: {},
            prevSummary: '', chapterInfo: '',
            triggers: [{ type: 'cache' as const }],
            choiceEvents: [], introMessages: [] }));

      const parsed = {
        storyTitle: kv.TITLE || '',
        storyDesc:  (kv.DESC || '').slice(0, 300),
        storyHashtag: (kv.TAGS || '').slice(0, 150),
        worldSetting: (kv.WORLD || '').slice(0, 500),
        characters, chapters,
        multiLangData,
        charMultiLangData,
        // USER 키 파싱 -> userSetting (나이·성별·특징·설명)
        // 형식: {u} | 나이 | 성별 | 외모/특징 | 긴 설명...
        userSetting: (() => {
          const userRaw = kv.USER || '';
          if (!userRaw) return undefined;
          const up = userRaw.split('|').map((s: string) => s.trim());
          const rawAge = up[1] || '';
          const rawGender = up[2] || '';
          const rawTraits = up[3] || '';
          const rawDesc = up.slice(4).join('|').trim() || '';
          return {
            name: '',
            age: rawAge.replace(/[^0-9]/g, ''),
            gender: ['남성','여성','기타','Male','Female'].includes(rawGender) ? rawGender : '',
            traits: rawTraits,
            description: rawDesc || rawTraits };
        })() };

      if (!parsed.storyTitle) {
        // ✅ [FIX] 앱 터짐 방지 - 에러 대신 Toast 표시
        ToastService.error(copy.missingTitleError);
        return;
      }

      onApply(parsed as unknown as import('../../../types/StoryContract').StoryConfig);
      onClose();
      setPasteText('');
      setStep('copy');
      ToastService.info(t?.toastAiApplied);
    } catch (e: unknown) {
      ToastService.info(`${t?.toastAiFail}${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { onClose(); resetModal(); }}>
      <GestureHandlerRootView style={styles._flex}>
        <View style={s.aiModalOverlay}>
        <PressableOpacity style={styles._flex} activeOpacity={1} onPress={() => { onClose(); resetModal(); }} />
        <View style={[s.aiModalBox, s.modalPb0]}>
          {/* 헤더 */}
          <View style={s.aiModalHeader}>
            <View style={styles._flexDirection}>
              <BwIcoDiamond c={'#C8C8D4'} size={13} />
              <Text style={s.aiModalTitle}>{(t as Record<string, string | undefined>).aiStoryAssistant ?? 'AI 스토리 제작 도우미'}</Text>
            </View>
            <PressableOpacity onPress={() => { onClose(); resetModal(); }}>
              <X size={20} color="#F0F0F5" />
            </PressableOpacity>
          </View>

          {/* 단계 표시 */}
          <View style={styles._flexDirection1}>
            <View style={[s.stepBarActive, { backgroundColor: '#F0F0F5' }]} />
            <View style={[s.stepBarActive, { backgroundColor: step === 'paste' ? '#F0F0F5' : '#2C2C38' }]} />
          </View>

          {step === 'copy' ? (
            <>
              <Text style={s.aiModalHintMb}>
                {copy.copyStepHint}
              </Text>

              <ScrollView style={styles._maxHeight} showsVerticalScrollIndicator={false}>
                {/* 챕터 수 */}
                <View style={styles._flexDirection2}>
                  <Text style={[s.chapterCountLabel, { color: '#F0F0F5' }]}>{st.chapterCountLabel}</Text>
                  <TextInput
                    style={s.chapterCountInput}
                    value={chapterCount}
                    onChangeText={setChapterCount}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                  <Text style={[s.chapterCountHint, { color: '#8A8A9E' }]}>5-50</Text>
                </View>

                {/* 장르 프리셋 */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.genreScrollContent}>
                  {genrePresets.map(preset => (
                    <PressableOpacity
                      key={preset.value}
                      style={[s.aiPresetChip, selectedPreset === preset.value && s.aiPresetChipActive]}
                      onPress={() => handlePresetSelect(preset.value)}
                    >
                      <Text style={[s.aiPresetChipText, selectedPreset === preset.value && s.aiPresetChipTextActive]}>
                        {preset.label}
                      </Text>
                    </PressableOpacity>
                  ))}
                </ScrollView>

                {/* 직접 입력 */}
                {selectedPreset !== '__ai__' && (
                  <TextInput
                    style={[s.aiModalInput, s.aiModalInputMt]}
                    value={input}
                    onChangeText={v => { setInput(v); setSelectedPreset(null); }}
                    multiline
                    placeholder={t?.aiModalPlaceholder}
                    placeholderTextColor={'#797990'}
                  />
                )}
                {selectedPreset === '__ai__' && (
                  <View style={[s.aiAutoBox, s.aiAutoBoxMt]}>
                    <Text style={s.aiAutoText}>{copy.aiAutoPresetHint}</Text>
                  </View>
                )}
              </ScrollView>

              {/* STEP 1 하단 버튼 */}
              <View style={s.actionFooter}>
                {/* 1) 프롬프트 복사 */}
                <PressableOpacity
                  style={s.primaryBtn}
                  onPress={copyPromptToClipboard}
                >
                  <BwIcoCopy c='#050507' />
                  <Text style={s.primaryBtnTxt}>{st.copyPromptBtn}</Text>
                </PressableOpacity>

                {/* 2) AI 응답 붙여넣기 (STEP 2로 이동) */}
                <PressableOpacity
                  style={s.primaryBtn}
                  onPress={() => setStep('paste')}
                >
                  <BwIcoPaste c='#050507' />
                  <Text style={s.primaryBtnTxt}>{st.pasteTranslationResult}</Text>
                  <Text style={s.primaryBtnSubTxt}>›</Text>
                </PressableOpacity>

                {/* 3) 보조 버튼 행 — 뒤로가기 / 다시 수정 */}
                <View style={styles._flexDirection3}>
                  <PressableOpacity
                    style={s.secondaryBtn}
                    onPress={() => { onClose(); resetModal(); }}
                  >
                    <ArrowLeft size={16} color="#8A8A9E" />
                    <Text style={s.secondaryBtnTxt}>{t?.back ?? st.a11yBack}</Text>
                  </PressableOpacity>
                  <PressableOpacity
                    style={s.secondaryBtn}
                    onPress={() => { setInput(''); setSelectedPreset(null); setChapterCount('12'); }}
                  >
                    <BwIcoRefresh c={'#8A8A9E'} />
                    <Text style={s.secondaryBtnTxt}>{st.editAgainBtn}</Text>
                  </PressableOpacity>
                </View>
              </View>
            </>
          ) : (
            <>
              <Text style={s.aiModalHintMb}>
                {copy.pasteStepHint}
              </Text>

              <TextInput
                style={[s.aiModalInput, s.aiModalInputMinMax]}
                value={pasteText}
                onChangeText={setPasteText}
                multiline
                placeholder={st.aiPastePlaceholder}
                placeholderTextColor={'#797990'}
                editable={!loading}
              />

              <View style={s.actionFooter}>
                <PressableOpacity
                  style={s.primaryBtnSimple}
                  onPress={pasteFromClipboard}
                  disabled={loading}
                >
                  <BwIcoPaste c='#050507' />
                  <Text style={s.primaryBtnTxt}>{st.pasteFromClipboard}</Text>
                </PressableOpacity>

                {/* 2) 편집기로 이동 (적용 + 닫기) */}
                <PressableOpacity
                  style={[s.primaryBtnSimple, (!pasteText.trim() || loading) && s.primaryBtnDisabled]}
                  onPress={handleGenerate}
                  disabled={!pasteText.trim() || loading}
                >
                  <BwIcoCheck c='#050507' />
                  <Text style={s.primaryBtnTxt}>
                    {loading ? copy.applying : copy.goToEditor}
                  </Text>
                </PressableOpacity>

                {/* 3) 보조 버튼 행 */}
                <View style={styles._flexDirection3}>
                  <PressableOpacity
                    style={s.secondaryBtn}
                    onPress={() => { setStep('copy'); setPasteText(''); }}
                  >
                    <ArrowLeft size={16} color="#8A8A9E" />
                    <Text style={s.secondaryBtnTxt}>{(st as Record<string, string | undefined>).backToPrompt ?? t?.back ?? '프롬프트로 돌아가기'}</Text>
                  </PressableOpacity>
                  <PressableOpacity
                    style={s.secondaryBtn}
                    onPress={() => setPasteText('')}
                  >
                    <BwIcoTrash c={'#8A8A9E'} />
                    <Text style={s.secondaryBtnTxt}>{(t as Record<string, string | undefined>).clearText ?? '지우기'}</Text>
                  </PressableOpacity>
                </View>
              </View>
            </>
          )}
        </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const s = StyleSheet.create({
  aiModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  aiModalBox: { backgroundColor: '#0C0C14', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 16, borderWidth: 1,
    borderColor: '#181820', ...Shadow.xl },
  aiModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  aiModalTitle: { fontSize: 18, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  aiModalClose: { fontSize: 18, color: '#F0F0F5', padding: 4, backgroundColor: '#0E0E14', borderRadius: 14, width: 32, height: 32, textAlign: 'center', lineHeight: 30 },
  aiModalHint: { fontSize: 13, color: '#8A8A9E', lineHeight: 20 },
  aiModalHintMb: { fontSize: 13, color: '#8A8A9E', lineHeight: 20, marginBottom: 12 },
  aiModalInput: { backgroundColor: '#0E0E14', borderWidth: 1,
    borderColor: '#181820', borderRadius: Radius.lg, padding: 14, color: '#F0F0F5', fontSize: 14, minHeight: 100, textAlignVertical: 'top' },
  aiModalBtn: { backgroundColor: '#D4A853', borderRadius: Radius.lg, paddingVertical: 14, alignItems: 'center', overflow: 'hidden' },
  aiModalBtnText: { color: '#050507', fontSize: 15, fontFamily: Typography.fontFamily.bold },
  aiPresetChip: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#0C0C14', borderRadius: Radius.full, borderWidth: 1,
    borderColor: '#1A1A24' },
  aiPresetChipActive: { backgroundColor: '#14141C', borderColor: '#2C2C38' },
  aiPresetChipText: { fontSize: 13, color: '#797990', fontFamily: Typography.fontFamily.medium },
  aiPresetChipTextActive: { color: '#F0F0F5', fontFamily: Typography.fontFamily.bold },
  aiAutoBox: { backgroundColor: '#0E0E14', borderRadius: Radius.lg, borderWidth: 1, borderColor: '#181820', paddingVertical: 20, alignItems: 'center', justifyContent: 'center' },
  aiAutoText: { fontSize: 14, color: '#C8C8D4', fontFamily: Typography.fontFamily.semibold, textAlign: 'center' },



  // ── AIModal inline -> StyleSheet ──────────────────────────────────
  modalPb0:          { paddingBottom: 0 },
  stepBarActive:     { flex: 1, height: 3, borderRadius: 2 },
  chapterCountLabel: { fontSize: 14, fontFamily: Typography.fontFamily.semibold, marginRight: 8 },
  chapterCountInput: { backgroundColor: '#0E0E14', borderRadius: 8, borderWidth: 1, borderColor: '#757585', paddingHorizontal: 14, paddingVertical: 8, color: '#F0F0F5', fontSize: 15, fontFamily: Typography.fontFamily.bold, width: 60, textAlign: 'center' as const },
  chapterCountHint:  { fontSize: 12, marginLeft: 8 },
  genreScrollContent:{ gap: 6, paddingBottom: 8 },
  aiModalInputMt:    { marginTop: 10 },
  aiAutoBoxMt:       { marginTop: 10 },
  actionFooter:      { paddingTop: 14, paddingBottom: 20, borderTopWidth: 1, borderTopColor: '#181820', gap: 8 },
  primaryBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F0F5', borderRadius: 12, paddingVertical: 14, gap: 8 },
  primaryBtnTxt:     { fontSize: 15, color: '#050507', fontFamily: Typography.fontFamily.bold },
  primaryBtnSubTxt:  { fontSize: 13, color: '#797990' },
  primaryBtnDisabled:{ opacity: 0.4 },
  secondaryBtn:      { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 12, borderWidth: 1, borderColor: '#2C2C38', flexDirection: 'row', gap: 4 },
  secondaryBtnArrow: { fontSize: 13, color: '#8A8A9E' },
  secondaryBtnTxt:   { fontSize: 14, color: '#F0F0F5', fontFamily: Typography.fontFamily.semibold },
  aiModalInputMinMax:{ minHeight: 200, maxHeight: 320 },
  primaryBtnSimple:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F0F5', borderRadius: 12, paddingVertical: 14 } });

const styles = StyleSheet.create({

  _flex: {
    flex: 1 },
  _flexDirection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8 },
  _flexDirection1: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16 },
  _maxHeight: {
    maxHeight: 280 },
  _flexDirection2: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12 },
  _flexDirection3: {
    flexDirection: 'row',
    gap: 8 } });
