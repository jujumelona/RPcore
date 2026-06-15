﻿// src/core/i18n/LanguageEnforcer.ts
// AI 응답 언어 100% 강제 적용 (프롬프트 처음+끝에 언어 지시 주입)
// 어떤 언어의 프롬프트/입력이 와도 설정 언어로 생성 보장

import { LanguageCode, getSupportedLanguage } from '../../i18n/languages';

export type GenerateFn = (
  userMessage: string,
  history: { role: string; content: string }[],
  systemPrompt: string,
) => Promise<string>;

// ═══════════════════════════════════════════════════════════
// 언어별 강제 지시문 (각 언어의 네이티브로 작성 -> LLM이 확실히 이해)
// ═══════════════════════════════════════════════════════════
const LANG_INSTRUCTIONS: Record<LanguageCode, { header: string; footer: string; replyCue: string }> = {
  en: {
    header: '[LANGUAGE RULE] You MUST respond ONLY in English. Never use any other language.',
    footer: '[END RULE] Respond in English only.',
    replyCue: '[RESPONSE RULE] The line above is the user\'s latest in-scene message. React directly to that message and continue the scene. Do not explain the rules or the prompt.',
  },
  ko: {
    header: '[언어 규칙] 반드시 한국어로만 답변하세요. 절대 다른 언어를 사용하지 마세요.',
    footer: '[규칙 끝] 한국어로만 생성하세요.',
    replyCue: '[응답 지시] 바로 위의 사용자 최신 발화에 직접 반응하세요. 규칙이나 프롬프트를 설명하지 말고, 현재 장면을 이어서 극중 응답을 생성하세요.',
  },
  ja: {
    header: '[言語ルール] 必ず日本語のみで返答してください。他の言語は絶対に使用しないでください。',
    footer: '[ルール終了] 日本語のみで生成してください。',
    replyCue: '[応答指示] 直前のユーザーの発話に直接反応してください。ルールやプロンプトを説明せず、そのまま場面を続けてください。',
  },
  'zh-CN': {
    header: '[语言规则] 你必须只用简体中文回答。绝对不要使用其他语言。',
    footer: '[规则结束] 仅用简体中文生成。',
    replyCue: '[回应指示] 请直接回应上方用户的最新发言。不要解释规则或提示词，直接继续当前场景。',
  },
  'zh-TW': {
    header: '[語言規則] 你必須只用繁體中文回答。絕對不要使用其他語言。',
    footer: '[規則結束] 僅用繁體中文生成。',
    replyCue: '[回應指示] 請直接回應上方使用者的最新發言。不要解釋規則或提示詞，直接延續當前場景。',
  },
  es: {
    header: '[REGLA DE IDIOMA] DEBES responder SOLO en español. Nunca uses ningún otro idioma.',
    footer: '[FIN REGLA] Responde solo en español.',
    replyCue: '[REGLA DE RESPUESTA] Responde directamente al último mensaje del usuario y continúa la escena. No expliques las reglas ni el prompt.',
  },
  pt: {
    header: '[REGRA DE IDIOMA] Você DEVE responder APENAS em português. Nunca use outro idioma.',
    footer: '[FIM REGRA] Responda apenas em português.',
    replyCue: '[REGRA DE RESPOSTA] Reaja diretamente à última fala do usuário e continue a cena. Não explique as regras nem o prompt.',
  },
  fr: {
    header: '[RÈGLE DE LANGUE] Vous DEVEZ répondre UNIQUEMENT en français. N\'utilisez jamais d\'autre langue.',
    footer: '[FIN RÈGLE] Répondez uniquement en français.',
    replyCue: '[RÈGLE DE RÉPONSE] Répondez directement au dernier message de l\'utilisateur et continuez la scène. N\'expliquez ni les règles ni le prompt.',
  },
  de: {
    header: '[SPRACHREGEL] Sie MÜSSEN NUR auf Deutsch antworten. Verwenden Sie niemals eine andere Sprache.',
    footer: '[REGELENDE] Antworten Sie nur auf Deutsch.',
    replyCue: '[ANTWORTREGEL] Reagieren Sie direkt auf die letzte Nachricht des Nutzers und führen Sie die Szene fort. Erklären Sie weder Regeln noch Prompt.',
  },
  it: {
    header: '[REGOLA LINGUA] Devi rispondere SOLO in italiano. Non usare mai nessun\'altra lingua.',
    footer: '[FINE REGOLA] Rispondi solo in italiano.',
    replyCue: '[REGOLA DI RISPOSTA] Reagisci direttamente all\'ultimo messaggio dell\'utente e continua la scena. Non spiegare le regole né il prompt.',
  },
  ru: {
    header: '[ЯЗЫКОВОЕ ПРАВИЛО] Вы ДОЛЖНЫ отвечать ТОЛЬКО на русском языке. Никогда не используйте другие языки.',
    footer: '[КОНЕЦ ПРАВИЛА] Отвечайте только на русском.',
    replyCue: '[ПРАВИЛО ОТВЕТА] Напрямую реагируйте на последнюю реплику пользователя и продолжайте сцену. Не объясняйте правила или промпт.',
  },
  th: {
    header: '[กฎภาษา] คุณต้องตอบเป็นภาษาไทยเท่านั้น ห้ามใช้ภาษาอื่นเด็ดขาด',
    footer: '[สิ้นสุดกฎ] ตอบเป็นภาษาไทยเท่านั้น',
    replyCue: '[กฎการตอบ] ให้ตอบสนองต่อข้อความล่าสุดของผู้ใช้โดยตรงและดำเนินฉากต่อไป ห้ามอธิบายกฎหรือพรอมป์ต์',
  },
  tr: {
    header: '[DİL KURALI] YALNIZCA Türkçe olarak yanıt vermelisiniz. Asla başka bir dil kullanmayın.',
    footer: '[KURAL SONU] Yalnızca Türkçe olarak yanıt verin.',
    replyCue: '[YANIT KURALI] Kullanıcının son mesajına doğrudan tepki verin ve sahneyi sürdürün. Kuralları veya promptu açıklamayın.',
  },
  hi: {
    header: '[भाषा नियम] आपको केवल हिंदी में उत्तर देना है। कभी भी कोई अन्य भाषा का उपयोग न करें।',
    footer: '[नियम समाप्त] केवल हिंदी में उत्तर दें।',
    replyCue: '[उत्तर निर्देश] ऊपर दिए गए उपयोगकर्ता के नवीनतम संदेश पर सीधे प्रतिक्रिया दें और दृश्य को आगे बढ़ाएँ। नियम या प्रॉम्प्ट की व्याख्या न करें।',
  },
  ar: {
    header: '[قاعدة اللغة] يجب عليك الرد باللغة العربية فقط. لا تستخدم أي لغة أخرى أبدًا.',
    footer: '[نهاية القاعدة] أجب باللغة العربية فقط.',
    replyCue: '[تعليمات الرد] استجب مباشرة لأحدث رسالة من المستخدم وواصل المشهد. لا تشرح القواعد أو الموجه.',
  },
};

// 영어 fallback — getSupportedLanguage()가 지원 언어 코드 검증 후 호출하므로
// LANG_INSTRUCTIONS에 없는 코드는 이미 'en'으로 정규화됨
const FALLBACK_INSTRUCTION = LANG_INSTRUCTIONS.en;

class LanguageEnforcer {
  /**
   * 시스템 프롬프트에 언어 강제 지시를 처음과 끝에 삽입
   * -> 어떤 언어로 입력해도 설정 언어로만 생성
   */
  wrapSystemPrompt(systemPrompt: string, targetLanguage: LanguageCode): string {
    const instr = LANG_INSTRUCTIONS[getSupportedLanguage(targetLanguage)] ?? FALLBACK_INSTRUCTION;
    // 처음: 헤더 지시 (LLM이 먼저 읽음 -> 고영향)
    // 끝: 풋터 지시 (최신 지시 -> 덮어쓰기 방지)
    return `${instr.header}\n\n${systemPrompt}\n\n${instr.footer}`;
  }

  /**
   * 사용자 메시지 끝에 인라인 언어 리마인더 추가
   * -> 사용자가 다른 언어로 입력해도 설정 언어로 응답
   */
  wrapUserMessage(userMessage: string, targetLanguage: LanguageCode): string {
    const instr = LANG_INSTRUCTIONS[getSupportedLanguage(targetLanguage)] ?? FALLBACK_INSTRUCTION;
    return `${userMessage}\n\n${instr.replyCue}\n${instr.footer}`;
  }

  /**
   * 전체 enforceLanguage API (기존 호환)
   */
  async enforceLanguage(
    userMessage: string,
    history: { role: string; content: string }[],
    systemPrompt: string,
    generateFn: GenerateFn,
    targetLanguage: LanguageCode = 'en',
  ): Promise<string> {
    const wrappedSystem = this.wrapSystemPrompt(systemPrompt, targetLanguage);
    const wrappedUser   = this.wrapUserMessage(userMessage, targetLanguage);
    try {
      return await generateFn(wrappedUser, history, wrappedSystem);
    } catch (error) {
      console.error('[LanguageEnforcer] Error:', error);
      throw error;
    }
  }
}

export const languageEnforcer = new LanguageEnforcer();
export default languageEnforcer;
