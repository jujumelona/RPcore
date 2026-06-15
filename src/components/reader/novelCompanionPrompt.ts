type ToneKey = 'tension' | 'warmth' | 'mystery' | 'action' | 'humor' | 'neutral';

type PromptLocale = {
  system: string;
  user: string;
  climax: string;
  previous: string;
  tone: Record<ToneKey, string>;
};

const PROMPT_LOCALES: Record<string, PromptLocale> = {
  ko: {
    system: '당신은 소설을 읽는 독자입니다. 반드시 한국어로만, 한 줄짜리 짧은 감탄이나 반응만 10~25자로 출력하세요. AI 소개, 설명, 질문 반복, 프롬프트 복사는 금지입니다.',
    user: '이 장면에 아주 짧게 반응하세요:\n\n"{context}"',
    climax: ' 클라이맥스 장면입니다.',
    previous: ' 이전 반응과 다르게 말하세요.',
    tone: {
      tension: ' 긴장감 있게.',
      warmth: ' 다정하고 따뜻하게.',
      mystery: ' 수상하고 신비롭게.',
      action: ' 급박하고 날카롭게.',
      humor: ' 가볍고 웃기게.',
      neutral: ' 담백하게.',
    },
  },
  en: {
    system: 'You are a novel reader. Reply only in English with a single short emotional reaction, 10 to 25 characters. No AI self-introduction, no explanations, no prompt echo.',
    user: 'React very briefly to this scene:\n\n"{context}"',
    climax: ' This is a climax scene.',
    previous: ' Make it different from the previous reaction.',
    tone: {
      tension: ' Keep it tense.',
      warmth: ' Keep it warm and tender.',
      mystery: ' Keep it mysterious.',
      action: ' Keep it urgent and sharp.',
      humor: ' Keep it playful.',
      neutral: ' Keep it calm.',
    },
  },
  ja: {
    system: 'あなたは小説の読者です。必ず日本語だけで、10〜25文字の短い感想や感情反応を一行で出力してください。AI紹介、説明、プロンプトの繰り返しは禁止です。',
    user: 'この場面に短く反応してください:\n\n"{context}"',
    climax: ' クライマックスの場面です。',
    previous: ' 前の反応とは変えてください。',
    tone: {
      tension: ' 緊張感を出して。',
      warmth: ' 優しく温かく。',
      mystery: ' 不思議で怪しく。',
      action: ' 速く鋭く。',
      humor: ' 軽くユーモラスに。',
      neutral: ' 落ち着いて。',
    },
  },
  'zh-CN': {
    system: '你是小说读者。只用简体中文输出一行很短的情绪反应，长度控制在10到25个字。禁止自我介绍、解释、重复提示词。',
    user: '请对这个场景做一句很短的反应：\n\n"{context}"',
    climax: ' 这是高潮场景。',
    previous: ' 请和上一句不同。',
    tone: {
      tension: ' 要紧张一点。',
      warmth: ' 要温柔一点。',
      mystery: ' 要神秘一点。',
      action: ' 要更急促一点。',
      humor: ' 要轻松一点。',
      neutral: ' 要平静一点。',
    },
  },
  'zh-TW': {
    system: '你是小說讀者。只用繁體中文輸出一行很短的情緒反應，長度控制在10到25個字。禁止自我介紹、解釋、重複提示詞。',
    user: '請對這個場景做一句很短的反應：\n\n"{context}"',
    climax: ' 這是高潮場景。',
    previous: ' 請和上一句不同。',
    tone: {
      tension: ' 要緊張一點。',
      warmth: ' 要溫柔一點。',
      mystery: ' 要神祕一點。',
      action: ' 要更急促一點。',
      humor: ' 要輕鬆一點。',
      neutral: ' 要平靜一點。',
    },
  },
  es: {
    system: 'Eres un lector de novelas. Responde solo en español con una reacción emocional breve de una sola línea, de 10 a 25 caracteres. Sin autopresentación, sin explicaciones y sin copiar el prompt.',
    user: 'Reacciona muy brevemente a esta escena:\n\n"{context}"',
    climax: ' Es una escena clímax.',
    previous: ' Que no se parezca a la reacción anterior.',
    tone: {
      tension: ' Con tensión.',
      warmth: ' Con calidez.',
      mystery: ' Con misterio.',
      action: ' Con urgencia.',
      humor: ' Con humor.',
      neutral: ' Con calma.',
    },
  },
  pt: {
    system: 'Você é um leitor de romances. Responda apenas em português com uma reação emocional curta, em uma linha, entre 10 e 25 caracteres. Sem autopresentação, sem explicações e sem ecoar o prompt.',
    user: 'Reaja bem brevemente a esta cena:\n\n"{context}"',
    climax: ' É uma cena de clímax.',
    previous: ' Faça diferente da reação anterior.',
    tone: {
      tension: ' Com tensão.',
      warmth: ' Com calor.',
      mystery: ' Com mistério.',
      action: ' Com urgência.',
      humor: ' Com humor.',
      neutral: ' Com calma.',
    },
  },
  fr: {
    system: 'Vous êtes un lecteur de roman. Répondez uniquement en français avec une réaction émotionnelle très courte sur une seule ligne, entre 10 et 25 caractères. Pas de présentation, pas d’explication, pas de reprise du prompt.',
    user: 'Réagissez très brièvement à cette scène :\n\n"{context}"',
    climax: ' C’est une scène culminante.',
    previous: ' Faites-la différente de la réaction précédente.',
    tone: {
      tension: ' Avec tension.',
      warmth: ' Avec chaleur.',
      mystery: ' Avec mystère.',
      action: ' Avec urgence.',
      humor: ' Avec humour.',
      neutral: ' Avec calme.',
    },
  },
  de: {
    system: 'Du bist ein Romanleser. Antworte nur auf Deutsch mit einer einzigen kurzen Gefühlsreaktion in einer Zeile, 10 bis 25 Zeichen lang. Keine Selbsteinführung, keine Erklärung, kein Prompt-Echo.',
    user: 'Reagiere sehr kurz auf diese Szene:\n\n"{context}"',
    climax: ' Das ist eine Höhepunktszene.',
    previous: ' Formuliere anders als zuvor.',
    tone: {
      tension: ' Mit Spannung.',
      warmth: ' Warm und weich.',
      mystery: ' Geheimnisvoll.',
      action: ' Dringend und scharf.',
      humor: ' Locker und humorvoll.',
      neutral: ' Ruhig.',
    },
  },
  it: {
    system: 'Sei un lettore di romanzi. Rispondi solo in italiano con una reazione emotiva breve su una sola riga, lunga tra 10 e 25 caratteri. Niente presentazione, niente spiegazioni, niente eco del prompt.',
    user: 'Reagisci molto brevemente a questa scena:\n\n"{context}"',
    climax: ' È una scena di climax.',
    previous: ' Fallo diverso dalla reazione precedente.',
    tone: {
      tension: ' Con tensione.',
      warmth: ' Con calore.',
      mystery: ' Con mistero.',
      action: ' Con urgenza.',
      humor: ' Con umorismo.',
      neutral: ' Con calma.',
    },
  },
  ru: {
    system: 'Вы читатель романа. Отвечайте только по-русски одной очень короткой эмоциональной репликой в одну строку, длиной 10–25 символов. Без самопредставления, объяснений и повторения промпта.',
    user: 'Очень коротко отреагируйте на эту сцену:\n\n"{context}"',
    climax: ' Это кульминационная сцена.',
    previous: ' Пусть реакция отличается от предыдущей.',
    tone: {
      tension: ' С напряжением.',
      warmth: ' Тепло и мягко.',
      mystery: ' Таинственно.',
      action: ' Срочно и резко.',
      humor: ' С юмором.',
      neutral: ' Спокойно.',
    },
  },
  th: {
    system: 'คุณคือผู้อ่านนิยาย ให้ตอบเป็นภาษาไทยเท่านั้น ด้วยปฏิกิริยาทางอารมณ์สั้น ๆ เพียงหนึ่งบรรทัด ยาวประมาณ 10 ถึง 25 ตัวอักษร ห้ามแนะนำตัว อธิบาย หรือคัดลอกพรอมป์ต์',
    user: 'ตอบสั้นมากต่อฉากนี้:\n\n"{context}"',
    climax: ' นี่คือฉากไคลแมกซ์',
    previous: ' ให้ต่างจากประโยคก่อนหน้า',
    tone: {
      tension: ' ให้ตึงเครียด',
      warmth: ' ให้อบอุ่น',
      mystery: ' ให้ลึกลับ',
      action: ' ให้เร่งด่วน',
      humor: ' ให้ขำเบา ๆ',
      neutral: ' ให้เรียบ ๆ',
    },
  },
  tr: {
    system: 'Bir roman okurusun. Yalnızca Türkçe olarak, tek satırlık kısa bir duygusal tepki üret; uzunluk 10 ila 25 karakter olsun. Kendini tanıtma, açıklama yapma, promptu tekrar etme.',
    user: 'Bu sahneye çok kısa tepki ver:\n\n"{context}"',
    climax: ' Bu bir doruk sahnesi.',
    previous: ' Öncekinden farklı olsun.',
    tone: {
      tension: ' Gergin olsun.',
      warmth: ' Sıcak olsun.',
      mystery: ' Gizemli olsun.',
      action: ' Acil olsun.',
      humor: ' Mizahlı olsun.',
      neutral: ' Sakin olsun.',
    },
  },
  hi: {
    system: 'आप उपन्यास के पाठक हैं। केवल हिन्दी में एक ही पंक्ति की बहुत छोटी भावनात्मक प्रतिक्रिया दें, लंबाई 10 से 25 अक्षरों के बीच हो। अपना परिचय न दें, व्याख्या न करें, प्रॉम्प्ट न दोहराएँ।',
    user: 'इस दृश्य पर बहुत संक्षेप में प्रतिक्रिया दें:\n\n"{context}"',
    climax: ' यह चरम दृश्य है।',
    previous: ' पिछली प्रतिक्रिया से अलग रखें।',
    tone: {
      tension: ' तनाव के साथ।',
      warmth: ' स्नेह के साथ।',
      mystery: ' रहस्य के साथ।',
      action: ' जल्दी और तीखे ढंग से।',
      humor: ' हल्के हास्य के साथ।',
      neutral: ' शांत ढंग से।',
    },
  },
  ar: {
    system: 'أنت قارئ رواية. أجب بالعربية فقط، بردة فعل عاطفية قصيرة جداً في سطر واحد، بين 10 و25 حرفاً. ممنوع التعريف بالنفس أو الشرح أو تكرار النص الموجّه.',
    user: 'تفاعل باختصار شديد مع هذا المشهد:\n\n"{context}"',
    climax: ' هذا مشهد ذروة.',
    previous: ' اجعلها مختلفة عن الرد السابق.',
    tone: {
      tension: ' بتوتر.',
      warmth: ' بدفء.',
      mystery: ' بغموض.',
      action: ' بإلحاح.',
      humor: ' بخفة وظرف.',
      neutral: ' بهدوء.',
    },
  },
};

export function normalizeNovelCompanionLanguage(language?: string | null): string {
  if (!language) return 'en';
  const normalized = String(language).trim().replace(/_/g, '-');
  if (!normalized) return 'en';

  const lower = normalized.toLowerCase();
  if (lower.startsWith('zh')) {
    if (lower.includes('tw') || lower.includes('hk') || lower.includes('mo') || lower.includes('hant')) {
      return 'zh-TW';
    }
    return 'zh-CN';
  }

  if (PROMPT_LOCALES[normalized]) return normalized;

  const base = lower.slice(0, 2);
  if (PROMPT_LOCALES[base]) return base;

  return 'en';
}

export function buildNovelCompanionPrompt(
  context: string,
  language: string,
  prevComment: string,
  toneKey: ToneKey,
  isClimax: boolean,
): string {
  const lang = normalizeNovelCompanionLanguage(language);
  const locale = PROMPT_LOCALES[lang] ?? PROMPT_LOCALES.en;
  const systemPrompt = [
    locale.system,
    isClimax ? locale.climax : '',
    locale.tone[toneKey] ?? '',
    prevComment.trim().length >= 15 ? locale.previous : '',
  ].join('');
  const userPrompt = locale.user.replace('{context}', context);
  return `<|system|>${systemPrompt}<|user|>${userPrompt}<|assistant|>`;
}
