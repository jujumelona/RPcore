// src/core/llama/KeywordToneDetector.ts
// ─────────────────────────────────────────────────────────────────────────────
//  KeywordToneDetector — embedding 'off' 상태용 15개국어 키워드 폴백
//
//  각 tone별로 15개국어 핵심 키워드를 하나의 RegExp로 컴파일.
//  단순 포함 여부 카운트 → 최다 매칭 tone 선택.
//  embed 호출 0, 지연 < 1ms, CPU 부하 무시 가능.
//
//  언어: ko en ja zh es fr de it ru pt ar hi th tr (+ zh-TW)
// ─────────────────────────────────────────────────────────────────────────────

export type ToneKey = 'tension' | 'warmth' | 'mystery' | 'action' | 'humor' | 'neutral';

export interface KeywordToneResult {
  key: ToneKey;
  score: number;  // 매칭된 키워드 수
}

// ── 키워드 정의 (15개국어) ────────────────────────────────────────────────────
//
//  각 배열: [ko, en, ja, zh, es, fr, de, it, ru, pt, ar, hi, th, tr, zh-TW]
//
// ─────────────────────────────────────────────────────────────────────────────

const KEYWORDS: Record<ToneKey, string[]> = {
  tension: [
    // ko
    '죽', '살', '피', '죽음', '공포', '위험', '살인', '폭력', '공격', '절망', '비명', '추격',
    // en
    'blood', 'death', 'kill', 'fear', 'danger', 'murder', 'scream', 'terror', 'die', 'dead',
    'threat', 'wound', 'pain', 'chase', 'gun', 'knife', 'weapon', 'attack', 'survive', 'desperate',
    // ja
    '死', '血', '恐怖', '危険', '殺', '絶望', '悲鳴', '逃げ', '追跡', '脅威',
    // zh
    '死', '血', '恐惧', '危险', '杀', '绝望', '尖叫', '逃跑', '威胁', '伤',
    // es
    'muerte', 'sangre', 'miedo', 'peligro', 'matar', 'terror', 'grito', 'huir', 'herida', 'amenaza',
    // fr
    'mort', 'sang', 'peur', 'danger', 'tuer', 'terreur', 'cri', 'fuir', 'blessure', 'menace',
    // de
    'Tod', 'Blut', 'Angst', 'Gefahr', 'töten', 'Terror', 'Schrei', 'fliehen', 'Wunde', 'Bedrohung',
    // it
    'morte', 'sangue', 'paura', 'pericolo', 'uccidere', 'terrore', 'grido', 'fuggire',
    // ru
    'смерть', 'кровь', 'страх', 'опасность', 'убить', 'террор', 'крик', 'бежать', 'рана',
    // pt
    'morte', 'sangue', 'medo', 'perigo', 'matar', 'terror', 'grito', 'fugir', 'ferida',
    // ar
    'موت', 'دم', 'خوف', 'خطر', 'قتل', 'رعب', 'صراخ', 'هرب',
    // hi
    'मृत्यु', 'खून', 'डर', 'खतरा', 'हत्या', 'आतंक', 'चीख',
    // th
    'ตาย', 'เลือด', 'กลัว', 'อันตราย', 'ฆ่า', 'หนี', 'กรีดร้อง',
    // tr
    'ölüm', 'kan', 'korku', 'tehlike', 'öldür', 'terör', 'çığlık', 'kaç',
    // zh-TW
    '死亡', '血液', '恐懼', '危險', '殺害',
  ],

  warmth: [
    // ko
    '사랑', '포옹', '눈물', '따뜻', '행복', '미소', '그리움', '가족', '친구', '위로',
    // en
    'love', 'hug', 'embrace', 'warm', 'happy', 'smile', 'joy', 'family', 'friend', 'comfort',
    'tender', 'gentle', 'heart', 'sweet', 'laugh', 'together', 'peace', 'hope', 'care',
    // ja
    '愛', '抱擁', '涙', '温かい', '幸せ', '笑顔', '家族', '友達', '優しい', '癒し',
    // zh
    '爱', '拥抱', '泪水', '温暖', '幸福', '微笑', '家人', '朋友', '温柔', '安慰',
    // es
    'amor', 'abrazo', 'lágrima', 'cálido', 'feliz', 'sonrisa', 'familia', 'amigo', 'ternura',
    // fr
    'amour', 'étreinte', 'larme', 'chaud', 'heureux', 'sourire', 'famille', 'ami', 'tendresse',
    // de
    'Liebe', 'Umarmung', 'Träne', 'warm', 'glücklich', 'Lächeln', 'Familie', 'Freund', 'Zärtlichkeit',
    // it
    'amore', 'abbraccio', 'lacrima', 'caldo', 'felice', 'sorriso', 'famiglia', 'amico',
    // ru
    'любовь', 'объятие', 'слеза', 'тёплый', 'счастье', 'улыбка', 'семья', 'друг',
    // pt
    'amor', 'abraço', 'lágrima', 'quente', 'feliz', 'sorriso', 'família', 'amigo',
    // ar
    'حب', 'عناق', 'دموع', 'دافئ', 'سعادة', 'ابتسامة', 'عائلة', 'صديق',
    // hi
    'प्यार', 'आलिंगन', 'आंसू', 'गर्म', 'खुशी', 'मुस्कान', 'परिवार', 'दोस्त',
    // th
    'รัก', 'กอด', 'น้ำตา', 'อบอุ่น', 'มีความสุข', 'ยิ้ม', 'ครอบครัว', 'เพื่อน',
    // tr
    'sevgi', 'kucak', 'gözyaşı', 'sıcak', 'mutlu', 'gülümseme', 'aile', 'arkadaş',
    // zh-TW
    '愛情', '擁抱', '溫暖', '幸福', '微笑',
  ],

  mystery: [
    // ko
    '비밀', '수수께끼', '그림자', '속삭임', '의문', '숨겨진', '단서', '수상', '어둠',
    // en
    'secret', 'mystery', 'shadow', 'whisper', 'clue', 'hidden', 'strange', 'unknown', 'dark',
    'riddle', 'suspicious', 'reveal', 'conceal', 'enigma', 'ominous', 'lurk', 'discover',
    // ja
    '秘密', '謎', '影', '囁き', '手がかり', '隠れた', '奇妙', '未知', '暗闇',
    // zh
    '秘密', '谜', '阴影', '耳语', '线索', '隐藏', '奇怪', '未知', '黑暗',
    // es
    'secreto', 'misterio', 'sombra', 'susurro', 'pista', 'oculto', 'extraño', 'desconocido',
    // fr
    'secret', 'mystère', 'ombre', 'murmure', 'indice', 'caché', 'étrange', 'inconnu',
    // de
    'Geheimnis', 'Rätsel', 'Schatten', 'Flüstern', 'Hinweis', 'verborgen', 'seltsam',
    // it
    'segreto', 'mistero', 'ombra', 'sussurro', 'indizio', 'nascosto', 'strano',
    // ru
    'тайна', 'загадка', 'тень', 'шёпот', 'улика', 'скрытый', 'странный',
    // pt
    'segredo', 'mistério', 'sombra', 'sussurro', 'pista', 'escondido', 'estranho',
    // ar
    'سر', 'غموض', 'ظل', 'همس', 'دليل', 'مخفي', 'غريب',
    // hi
    'रहस्य', 'पहेली', 'छाया', 'फुसफुसाहट', 'सुराग', 'छिपा', 'अजीब',
    // th
    'ความลับ', 'ปริศนา', 'เงา', 'กระซิบ', 'เบาะแส', 'ซ่อน', 'แปลก',
    // tr
    'sır', 'gizem', 'gölge', 'fısıltı', 'ipucu', 'gizli', 'garip',
    // zh-TW
    '神秘', '謎團', '陰影', '線索', '隱藏',
  ],

  action: [
    // ko
    '달리', '폭발', '전투', '추격', '싸움', '격렬', '충돌', '급박', '탈출', '도망',
    // en
    'run', 'explosion', 'battle', 'chase', 'fight', 'crash', 'escape', 'rush', 'burst',
    'sprint', 'clash', 'slam', 'roar', 'speed', 'pursuit', 'race', 'dodge', 'strike',
    // ja
    '走る', '爆発', '戦闘', '追跡', '戦い', '衝突', '逃げる', '急ぐ', 'スピード',
    // zh
    '奔跑', '爆炸', '战斗', '追击', '搏斗', '碰撞', '逃跑', '冲', '速度',
    // es
    'correr', 'explosión', 'batalla', 'persecución', 'lucha', 'choque', 'escape', 'velocidad',
    // fr
    'courir', 'explosion', 'bataille', 'poursuite', 'combat', 'collision', 'fuir', 'vitesse',
    // de
    'rennen', 'Explosion', 'Kampf', 'Verfolgung', 'Kampf', 'Kollision', 'fliehen', 'Tempo',
    // it
    'correre', 'esplosione', 'battaglia', 'inseguimento', 'lotta', 'scontro', 'fuggire',
    // ru
    'бежать', 'взрыв', 'битва', 'погоня', 'борьба', 'столкновение', 'бегство', 'скорость',
    // pt
    'correr', 'explosão', 'batalha', 'perseguição', 'luta', 'colisão', 'fugir', 'velocidade',
    // ar
    'ركض', 'انفجار', 'معركة', 'مطاردة', 'قتال', 'تصادم', 'هروب', 'سرعة',
    // hi
    'दौड़', 'विस्फोट', 'युद्ध', 'पीछा', 'लड़ाई', 'टकराव', 'भागना', 'गति',
    // th
    'วิ่ง', 'ระเบิด', 'การต่อสู้', 'ไล่ล่า', 'ต่อสู้', 'ชน', 'หลบหนี', 'ความเร็ว',
    // tr
    'koş', 'patlama', 'savaş', 'kovalama', 'kavga', 'çarpışma', 'kaçış', 'hız',
    // zh-TW
    '奔跑', '爆炸', '戰鬥', '追逐', '碰撞',
  ],

  humor: [
    // ko
    '웃음', '황당', '재미', '농담', '해프닝', '어처구니', '엉뚱', '유머', '익살',
    // en
    'laugh', 'absurd', 'funny', 'joke', 'silly', 'ridiculous', 'humor', 'irony', 'wit',
    'comic', 'gag', 'prank', 'hilarious', 'chuckle', 'grin', 'amusing', 'clumsy',
    // ja
    '笑い', '馬鹿げた', '面白い', '冗談', 'ユーモア', '皮肉', 'おかしい', 'おどけ',
    // zh
    '笑', '荒谬', '有趣', '玩笑', '幽默', '讽刺', '搞笑', '滑稽',
    // es
    'reír', 'absurdo', 'divertido', 'broma', 'humor', 'ironía', 'cómico', 'gracioso',
    // fr
    'rire', 'absurde', 'drôle', 'blague', 'humour', 'ironie', 'comique', 'amusant',
    // de
    'lachen', 'absurd', 'lustig', 'Witz', 'Humor', 'Ironie', 'komisch', 'amüsant',
    // it
    'ridere', 'assurdo', 'divertente', 'barzelletta', 'umorismo', 'ironia', 'comico',
    // ru
    'смех', 'абсурдный', 'смешной', 'шутка', 'юмор', 'ирония', 'комический',
    // pt
    'rir', 'absurdo', 'engraçado', 'piada', 'humor', 'ironia', 'cômico',
    // ar
    'ضحك', 'سخافة', 'مضحك', 'نكتة', 'فكاهة', 'سخرية',
    // hi
    'हंसी', 'बेतुका', 'मजेदार', 'मजाक', 'हास्य', 'व्यंग्य',
    // th
    'หัวเราะ', 'ไร้สาระ', 'ตลก', 'เรื่องตลก', 'อารมณ์ขัน',
    // tr
    'gülmek', 'saçma', 'komik', 'şaka', 'mizah', 'ironi',
    // zh-TW
    '笑聲', '荒謬', '有趣', '玩笑', '幽默',
  ],

  neutral: [
    // catch-all: 이 tone은 다른 tone이 낮을 때 기본값으로 사용
    // 몇 가지 평온/일상 키워드만 추가
    '평온', '일상', 'calm', 'quiet', 'ordinary', 'daily', 'peaceful',
    '静か', '平凡', '平静', 'tranquilo', 'calme', 'ruhig',
    'спокойный', 'calmo', 'هادئ', 'शांत', 'สงบ', 'sakin',
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
//  컴파일된 RegExp 캐시 (앱 시작 시 1회)
// ─────────────────────────────────────────────────────────────────────────────

function _compilePatterns(): Record<ToneKey, RegExp> {
  const result = {} as Record<ToneKey, RegExp>;
  for (const [key, words] of Object.entries(KEYWORDS) as [ToneKey, string[]][]) {
    // 단어 경계 \b 는 CJK에서 동작 안 함 — 단순 포함 검색으로 대체
    const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    result[key] = new RegExp(escaped.join('|'), 'iu');
  }
  return result;
}

const PATTERNS = _compilePatterns();

// ─────────────────────────────────────────────────────────────────────────────

export class KeywordToneDetector {
  /**
   * 텍스트에서 tone 분류.
   * 각 패턴의 전체 매칭 횟수를 세어 최다 매칭 tone 반환.
   * neutral은 다른 tone 최고 점수가 낮을 때 기본값.
   */
  analyze(text: string): { key: ToneKey; score: number } {
    let bestKey:   ToneKey = 'neutral';
    let bestScore = 0;

    for (const [key, pattern] of Object.entries(PATTERNS) as [ToneKey, RegExp][]) {
      if (key === 'neutral') continue;
      // matchAll로 전체 매칭 횟수 카운트
      const matches = [...text.matchAll(new RegExp(pattern.source, 'giu'))];
      if (matches.length > bestScore) {
        bestScore = matches.length;
        bestKey   = key;
      }
    }

    // 매칭이 거의 없으면 neutral
    if (bestScore < 2) bestKey = 'neutral';

    return { key: bestKey, score: bestScore };
  }
}

export const keywordDetector = new KeywordToneDetector();
