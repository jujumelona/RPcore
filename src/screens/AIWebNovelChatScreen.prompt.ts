import { WNFormData } from './AIWebNovelChatScreen.types';

// ─────────────────────────────────────────────────────────────────────────────
//  buildWebNovelPrompt  v2
//  • 추가 질문 / 대화 텍스트 완전 금지
//  • CHAR 프로필 전체 필드 강제 → 인물사전 자동 완전 채우기
//  • 초기 감정값(CHAR_N_EMO) 파이프(|) 구분 포맷으로 파서 호환
//  • 시리즈: 화수별 역할(오프닝/얼리/미드/클라이맥스/피날레) 자동 지시
//  • 감정 델타 세밀도 ±1~±20 가이드
// ─────────────────────────────────────────────────────────────────────────────

export function buildWebNovelPrompt(formData: WNFormData, targetLanguage: string): string {
  const wordCount  = parseInt(formData.wordCount, 10) || (formData.isSeries ? 5000 : 3000);
  const charCount  = Math.max(1, parseInt(formData.charCount, 10) || 2);
  const totalChars = 1 + charCount;
  const isSeries   = formData.isSeries;
  const curEp      = formData.currentEpisode;
  const totalEp    = parseInt(formData.seriesCount, 10) || 1;

  const lines: string[] = [];

  // ── 절대 규칙 ────────────────────────────────────────────────────────────
  lines.push(`You are a master-level web novel author. Output ONLY a complete web novel in the exact KEY:VALUE format below.

╔══════════════════════════════════════════════════════════════════╗
║  NON-NEGOTIABLE RULES — ANY VIOLATION = INVALID OUTPUT          ║
╠══════════════════════════════════════════════════════════════════╣
║ R1. LANGUAGE: ALL values in [${targetLanguage.padEnd(38,' ')}]  ║
║     Format keys stay English (TITLE, CHAR_N_*, WN_PARA_N, @N). ║
║ R2. NO CONVERSATION: Zero "Shall I continue?", "Hope you enjoy",║
║     "What happens next?", or any non-output text. EVER.         ║
║ R3. NO MARKDOWN: No \`\`\`fences\`\`\`, no **bold**, no # headers.      ║
║ R4. LENGTH: Total WN_PARA text ≥ ${String(wordCount).padEnd(6,' ')} chars. More paras if needed.║
║ R5. HARD STOP: After final @N: line → stop. Nothing after.      ║
║ R6. FIRST LINE: Must be "TITLE:" — absolutely nothing before it.║
╚══════════════════════════════════════════════════════════════════╝`);

  // ── 시리즈 지시 ──────────────────────────────────────────────────────────
  if (isSeries) {
    let role = '';
    if (curEp === 1)                           role = 'OPENING — establish world, protagonist, inciting incident. End on a hook.';
    else if (curEp === totalEp)                role = 'FINALE — resolve all arcs, emotional payoff, satisfying conclusion.';
    else if (curEp <= Math.ceil(totalEp * 0.3)) role = 'EARLY ARC — deepen bonds, escalate stakes, introduce complications.';
    else if (curEp <= Math.ceil(totalEp * 0.7)) role = 'MID ARC — major twist/revelation, peak tension, end on cliffhanger.';
    else                                        role = 'CLIMAX ARC — build toward resolution, max emotional intensity, close subplots.';

    lines.push(`
[SERIES MODE]
SERIES_TOTAL: ${totalEp} episodes
THIS_EPISODE: ${curEp}
EPISODE_ROLE: ${role}
CONTINUITY: Characters, relationships and emotional states from prior episodes persist. Do NOT reset to neutral.`);
  }

  // ── 메타 ─────────────────────────────────────────────────────────────────
  lines.push('');
  if (formData.title.trim()) {
    lines.push(`[TITLE_HINT: ${formData.title}]`);
  } else {
    lines.push('[TITLE_HINT: Create a compelling episode title.]');
  }
  if (formData.genre.trim()) lines.push(`[GENRE: ${formData.genre}]`);
  if (formData.tone.trim())  lines.push(`[TONE: ${formData.tone}]`);
  lines.push(`[TARGET_CHARS: ${wordCount}]`);

  // ── 캐릭터 스펙 ──────────────────────────────────────────────────────────
  lines.push(`\n[CHARACTER SPECIFICATIONS — ${totalChars} total]`);

  const u = formData.user;
  lines.push(`
CHAR_1 (Protagonist):
  Name: ${u.name || '(auto-generate)'}
  Age: ${u.age || '(from context)'}
  Gender: ${u.gender || '(from context)'}
  Appearance: ${u.traits || '(generate vivid look)'}
  Personality: ${u.description || '(generate rich personality + backstory)'}`);

  for (let i = 0; i < Math.min(charCount, formData.chars.length); i++) {
    const c = formData.chars[i];
    lines.push(`
CHAR_${i + 2}:
  Name: ${c.name || '(auto-generate)'}
  Age: ${c.age || '(from context)'}
  Gender: ${c.gender || '(from context)'}
  Appearance: ${c.traits || '(generate vivid look)'}
  Personality: ${c.personality || '(generate rich personality)'}`);
  }

  // ── 시나리오 / 스타일 ────────────────────────────────────────────────────
  if (formData.sourceText.trim()) {
    lines.push(`\n[SCENARIO — weave naturally into story]\n${formData.sourceText.trim().substring(0, 15000)}`);
  }
  if (formData.extraStyles.trim()) {
    lines.push(`\n[STYLE INSTRUCTIONS: ${formData.extraStyles}]`);
  }

  // ── 출력 포맷 ─────────────────────────────────────────────────────────────
  lines.push(`
════════════════════════════════════════════════════
 EXACT OUTPUT FORMAT (fill values in [${targetLanguage}])
════════════════════════════════════════════════════

TITLE: <Episode title>
DESC: <2–3 sentence synopsis. Engaging, no spoilers.>
TAGS: <6–8 English genre/mood tags, comma-separated>

─── CHARACTER PROFILES ────────────────────────────
(All ${totalChars} are REQUIRED — these auto-fill the in-app character dictionary)`);

  for (let i = 1; i <= totalChars; i++) {
    const isProtag = i === 1;
    // 주인공은 e1(호감) 50 기본, 조연은 관계 불명이므로 낮게
    const e1base = isProtag ? 50 : 30;
    const e2base = isProtag ? 40 : 30;
    lines.push(`
CHAR_${i}_NAME: <Full name>
CHAR_${i}_APP: <Detailed look: hair, eyes, height, build, clothes, distinguishing features>
CHAR_${i}_PER: <Core traits, speech style, quirks, how they behave under pressure>
CHAR_${i}_ROLE: <${isProtag ? 'Protagonist — role/title in the story world' : 'Role + relationship to protagonist'}>
CHAR_${i}_AGE: <Age as number>
CHAR_${i}_GENDER: <Gender>
CHAR_${i}_EMO: e1:${e1base}|e2:${e2base}|e3:10|e4:10|e5:10`);
  }

  lines.push(`
─── NOVEL CONTENT ─────────────────────────────────
Write immersive prose paragraphs until total WN_PARA chars ≥ ${wordCount}.
After EVERY paragraph, output its emotion delta line (@N).

EMOTION KEYS:
  e1=Affection/Love  e2=Joy/Happiness  e3=Anger  e4=Sadness  e5=Fear
  charID 1=protagonist, 2+= other characters
  Delta: ±1 to ±20 per emotion per paragraph. Realistic, not extreme.
  If no emotions changed → @N: NONE

WN_PARA_1: <First paragraph — hook immediately. Rich sensory detail.>
@1: 1:e2+5,e5-3 | 2:e1+8  (example — replace with actual deltas or NONE)

WN_PARA_2: <Second paragraph>
@2: NONE

[Continue WN_PARA_3, WN_PARA_4... until total ≥ ${wordCount} chars]

════════════════════════════════════════════════════
START NOW. First line = "TITLE:" — NO OTHER TEXT BEFORE IT.
Generate episode ${curEp}${isSeries ? ` of ${totalEp}` : ''} in [${targetLanguage}].
After last @N: line → STOP. Zero closing text.
════════════════════════════════════════════════════`);

  return lines.join('\n');
}
