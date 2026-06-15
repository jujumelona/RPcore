import { type LanguageCode, getSupportedLanguage } from './languages';

export type EmotionKey = 'e1' | 'e2' | 'e3' | 'e4' | 'e5';

export interface EmotionMetaLabel {
  key: EmotionKey;
  title: string;
  low: string;
  high: string;
  color: string;
}

export interface UIPhrases {
  emotionMeta: EmotionMetaLabel[];
  emotionStrongPrefix: string;
  emotionNeutral: string;
  emotionDockTitle: string;
  emotionDockSubtitle: string;
  emotionStatusShow: string;
  emotionStatusHide: string;
  readingBasisPrefix: string;
  readingBasisLine: string;
  readingBasisParagraph: string;
  kvLoadingHints: string[];
  modelSwitching: string;
  nearChapterEnd: string;
  endingReached: string;
  chapterLabel: string;
  loadingLabel: string;
  storyCompletedTitle: string;
  storyCompletedMessage: string;
  storyCompletedAction: string;
  myWebNovelsAction: string;
  modelLockTitle: string;
  modelLockMessage: string;
  webNovelNotFound: string;
  webNovelShareTitle: string;
  webNovelShareMessage: string;
  webNovelShareLater: string;
  webNovelShareNow: string;
  contentRefusedHint: string;
  dataCleaningLabel?: string;
  characterFallback?: string;
}

// ✅ [FIX] 모듈 레벨 Color 즉시 평가 -> 인라인 hex 값
const META_COLORS: Record<EmotionKey, string> = {
  e1: '#FF5555',  // '#FF5555'
  e2: '#60A5FA',  // '#60A5FA'
  e3: '#4ADE80',  // '#4ADE80'
  e4: '#F59E0B',  // '#F59E0B'
  e5: '#8B5CF6',  // '#8B5CF6'
};

const BASE: UIPhrases = {
  emotionMeta: [
    { key: 'e1', title: 'Valence',    low: 'Negative',    high: 'Positive',   color: META_COLORS.e1 },
    { key: 'e2', title: 'Trust',      low: 'Distrust',    high: 'Trust',      color: META_COLORS.e2 },
    { key: 'e3', title: 'Dominance',  low: 'Submissive',  high: 'Dominant',   color: META_COLORS.e3 },
    { key: 'e4', title: 'Arousal',    low: 'Calm',        high: 'Excited',    color: META_COLORS.e4 },
    { key: 'e5', title: 'Attachment', low: 'Detached',    high: 'Attached',   color: META_COLORS.e5 },
  ],
  emotionStrongPrefix: 'Strong',
  emotionNeutral: 'Neutral',
  emotionDockTitle: 'Emotion Status',
  emotionDockSubtitle: 'Character reactions to the user',
  emotionStatusShow: 'Show emotion status',
  emotionStatusHide: 'Hide emotion status',
  readingBasisPrefix: 'Emotion basis',
  readingBasisLine: 'reading line',
  readingBasisParagraph: 'paragraph',
  kvLoadingHints: [
    'Preparing context...',
    'Warming up the model...',
    'Building chapter cache...',
    'Almost ready...',
  ],
  modelSwitching: 'Switching model...',
  nearChapterEnd: 'This chapter is close to the ending section.',
  endingReached: 'Ending chapter reached.',
  chapterLabel: 'CHAPTER',
  loadingLabel: 'Loading...',
  storyCompletedTitle: 'THE END',
  storyCompletedMessage: 'The story has finished.\nYou can convert it to a web novel now.',
  storyCompletedAction: 'Convert to Web Novel',
  myWebNovelsAction: 'My Web Novels',
  modelLockTitle: 'Model switch is locked',
  modelLockMessage: 'Model switching is blocked while the KV cache session is active.',
  webNovelNotFound: 'The selected web novel could not be loaded.',
  webNovelShareTitle: 'Post to community',
  webNovelShareMessage: 'Do you want to open the post editor with this web novel?',
  webNovelShareLater: 'Later',
  webNovelShareNow: 'Open editor',
  contentRefusedHint: 'The model declined to generate this content. Try rephrasing your message.',
  dataCleaningLabel: 'Cleaning up data...',
  characterFallback: 'Character' };

const BY_LANG: Record<LanguageCode, UIPhrases> = {
  en: BASE,
  es: { ...BASE, contentRefusedHint: 'El modelo rechazó generar este contenido. Intenta reformular tu mensaje.' },
  pt: { ...BASE, contentRefusedHint: 'O modelo recusou gerar este conteúdo. Tente reformular sua mensagem.' },
  fr: { ...BASE, contentRefusedHint: 'Le modèle a refusé de générer ce contenu. Essayez de reformuler votre message.' },
  de: { ...BASE, contentRefusedHint: 'Das Modell hat die Generierung dieses Inhalts abgelehnt. Formuliere deine Nachricht um.' },
  it: { ...BASE, contentRefusedHint: 'Il modello ha rifiutato di generare questo contenuto. Prova a riformulare il messaggio.' },
  ru: { ...BASE, contentRefusedHint: 'Модель отказалась генерировать этот контент. Попробуйте перефразировать сообщение.' },
  ko: {
    emotionMeta: [
      { key: 'e1', title: 'Valence',    low: '부정/혐오',   high: '긍정/호감',   color: META_COLORS.e1 },
      { key: 'e2', title: 'Trust',      low: '불신/배신',   high: '신뢰/의지',   color: META_COLORS.e2 },
      { key: 'e3', title: 'Dominance',  low: '복종/순종',   high: '지배/주도',   color: META_COLORS.e3 },
      { key: 'e4', title: 'Arousal',    low: '차분/무감',   high: '흥분/긴장',   color: META_COLORS.e4 },
      { key: 'e5', title: 'Attachment', low: '거리감/냉담', high: '친밀감/집착', color: META_COLORS.e5 },
    ],
    emotionStrongPrefix: '강한',
    emotionNeutral: '중립',
    emotionDockTitle: '감정 상태',
    emotionDockSubtitle: '캐릭터의 유저에 대한 반응',
    emotionStatusShow: '감정 상태 보기',
    emotionStatusHide: '감정 상태 숨기기',
    readingBasisPrefix: '감정 기준',
    readingBasisLine: '줄',
    readingBasisParagraph: '단락',
    kvLoadingHints: [
      '컨텍스트 준비 중...',
      '모델 워밍업 중...',
      '챕터 캐시 구성 중...',
      '거의 준비됐어요...',
    ],
    modelSwitching: '모델 변경 중...',
    nearChapterEnd: '이 챕터는 엔딩 구간에 가까워지고 있어요.',
    endingReached: '엔딩 챕터에 도달했습니다.',
    chapterLabel: '챕터',
    loadingLabel: '로딩 중...',
    storyCompletedTitle: 'THE END',
    storyCompletedMessage: '스토리가 완료되었습니다.\n지금 웹소설로 변환할 수 있어요.',
    storyCompletedAction: '웹소설로 변환',
    myWebNovelsAction: '내 웹소설',
    modelLockTitle: '모델 변경 불가',
    modelLockMessage: 'KV 캐시 세션이 활성화된 동안 모델 변경이 차단됩니다.',
    webNovelNotFound: '선택한 웹소설을 불러올 수 없습니다.',
    webNovelShareTitle: '커뮤니티에 게시',
    webNovelShareMessage: '이 웹소설로 게시글 에디터를 열까요?',
    webNovelShareLater: '나중에',
    webNovelShareNow: '에디터 열기',
    contentRefusedHint: '모델이 해당 내용의 생성을 거부했습니다. 표현을 바꿔서 다시 보내보세요.',
    dataCleaningLabel: '데이터 정리 중...',
    characterFallback: '캐릭터' },
  ja: {
    emotionMeta: [
      { key: 'e1', title: '好感度', low: '嫌悪', high: '好感', color: META_COLORS.e1 },
      { key: 'e2', title: '信頼度', low: '不信', high: '信頼', color: META_COLORS.e2 },
      { key: 'e3', title: '支配力', low: '劣等/従属', high: '優越/支配', color: META_COLORS.e3 },
      { key: 'e4', title: '感情強度', low: '穏やか/無気力', high: '激烈/感情爆発', color: META_COLORS.e4 },
      { key: 'e5', title: '愛着度', low: '距離感', high: '愛着/執着', color: META_COLORS.e5 },
    ],
    emotionStrongPrefix: '強い',
    emotionNeutral: '中立',
    emotionDockTitle: '感情状態',
    emotionDockSubtitle: 'キャラクターのユーザーへの反応',
    emotionStatusShow: '感情状態を表示',
    emotionStatusHide: '感情状態を非表示',
    readingBasisPrefix: '感情基準',
    readingBasisLine: '行',
    readingBasisParagraph: '段落',
    kvLoadingHints: [
      'コンテキストを準備中...',
      'モデルをウォームアップ中...',
      'チャプターキャッシュを構築中...',
      'もうすぐ準備完了...',
    ],
    modelSwitching: 'モデルを変更中...',
    nearChapterEnd: 'このチャプターはエンディング区間に近づいています。',
    endingReached: 'エンディングチャプターに到達しました。',
    chapterLabel: 'チャプター',
    loadingLabel: '読み込み中...',
    storyCompletedTitle: 'THE END',
    storyCompletedMessage: 'ストーリーが完了しました。\n今すぐウェブ小説に変換できます。',
    storyCompletedAction: 'ウェブ小説に変換',
    myWebNovelsAction: 'マイウェブ小説',
    modelLockTitle: 'モデル変更不可',
    modelLockMessage: 'KVキャッシュセッションがアクティブな間はモデル変更がブロックされます。',
    webNovelNotFound: '選択したウェブ小説を読み込めませんでした。',
    webNovelShareTitle: 'コミュニティに投稿',
    webNovelShareMessage: 'このウェブ小説で投稿エディターを開きますか？',
    webNovelShareLater: '後で',
    webNovelShareNow: 'エディターを開く',
    contentRefusedHint: 'モデルがこの内容の生成を拒否しました。表現を変えて再送してください。',
    dataCleaningLabel: 'データを整理中...',
    characterFallback: 'キャラクター' },
  'zh-CN': {
    emotionMeta: [
      { key: 'e1', title: '好感度', low: '厌恶', high: '好感', color: META_COLORS.e1 },
      { key: 'e2', title: '信任度', low: '不信任', high: '信任', color: META_COLORS.e2 },
      { key: 'e3', title: '支配力', low: '劣等/服从', high: '优越/支配', color: META_COLORS.e3 },
      { key: 'e4', title: '情感强度', low: '平静/无力', high: '激烈/情绪爆发', color: META_COLORS.e4 },
      { key: 'e5', title: '依恋度', low: '疏离感', high: '依恋/执着', color: META_COLORS.e5 },
    ],
    emotionStrongPrefix: '强烈的',
    emotionNeutral: '中立',
    emotionDockTitle: '情感状态',
    emotionDockSubtitle: '角色对用户的反应',
    emotionStatusShow: '查看情感状态',
    emotionStatusHide: '隐藏情感状态',
    readingBasisPrefix: '情感基准',
    readingBasisLine: '行',
    readingBasisParagraph: '段落',
    kvLoadingHints: [
      '正在准备上下文...',
      '正在预热模型...',
      '正在构建章节缓存...',
      '即将准备完毕...',
    ],
    modelSwitching: '正在切换模型...',
    nearChapterEnd: '本章正在接近结局区段。',
    endingReached: '已到达结局章节。',
    chapterLabel: '章节',
    loadingLabel: '加载中...',
    storyCompletedTitle: 'THE END',
    storyCompletedMessage: '故事已完成。\n现在可以转换为网络小说。',
    storyCompletedAction: '转换为网络小说',
    myWebNovelsAction: '我的网络小说',
    modelLockTitle: '无法更换模型',
    modelLockMessage: 'KV缓存会话激活期间，模型切换被阻止。',
    webNovelNotFound: '无法加载所选网络小说。',
    webNovelShareTitle: '发布到社区',
    webNovelShareMessage: '是否用此网络小说打开发帖编辑器？',
    webNovelShareLater: '稍后',
    webNovelShareNow: '打开编辑器',
    contentRefusedHint: '模型拒绝生成此内容，请换种表达方式重新发送。' },
  'zh-TW': {
    emotionMeta: [
      { key: 'e1', title: '好感度', low: '厭惡', high: '好感', color: META_COLORS.e1 },
      { key: 'e2', title: '信任度', low: '不信任', high: '信任', color: META_COLORS.e2 },
      { key: 'e3', title: '支配力', low: '劣等/服從', high: '優越/支配', color: META_COLORS.e3 },
      { key: 'e4', title: '情感強度', low: '平靜/無力', high: '激烈/情緒爆發', color: META_COLORS.e4 },
      { key: 'e5', title: '依戀度', low: '疏離感', high: '依戀/執著', color: META_COLORS.e5 },
    ],
    emotionStrongPrefix: '強烈的',
    emotionNeutral: '中立',
    emotionDockTitle: '情感狀態',
    emotionDockSubtitle: '角色對使用者的反應',
    emotionStatusShow: '查看情感狀態',
    emotionStatusHide: '隱藏情感狀態',
    readingBasisPrefix: '情感基準',
    readingBasisLine: '行',
    readingBasisParagraph: '段落',
    kvLoadingHints: [
      '正在準備上下文...',
      '正在預熱模型...',
      '正在建構章節快取...',
      '即將準備完畢...',
    ],
    modelSwitching: '正在切換模型...',
    nearChapterEnd: '本章正在接近結局區段。',
    endingReached: '已到達結局章節。',
    chapterLabel: '章節',
    loadingLabel: '載入中...',
    storyCompletedTitle: 'THE END',
    storyCompletedMessage: '故事已完成。\n現在可以轉換為網路小說。',
    storyCompletedAction: '轉換為網路小說',
    myWebNovelsAction: '我的網路小說',
    modelLockTitle: '無法更換模型',
    modelLockMessage: 'KV快取工作階段啟用期間，模型切換被阻止。',
    webNovelNotFound: '無法載入所選網路小說。',
    webNovelShareTitle: '發佈到社群',
    webNovelShareMessage: '是否用此網路小說開啟發文編輯器？',
    webNovelShareLater: '稍後',
    webNovelShareNow: '開啟編輯器',
    contentRefusedHint: '模型拒絕生成此內容，請換個表達方式重新發送。' },
  th: { ...BASE, contentRefusedHint: 'โมเดลปฏิเสธที่จะสร้างเนื้อหานี้ ลองเปลี่ยนคำพูดใหม่' },
  tr: { ...BASE, contentRefusedHint: 'Model bu içeriği oluşturmayı reddetti. Mesajınızı farklı bir şekilde ifade etmeyi deneyin.' },
  hi: { ...BASE, contentRefusedHint: 'मॉडल ने यह सामग्री बनाने से इनकार कर दिया। अपना संदेश दोबारा लिखने का प्रयास करें।' },
  ar: { ...BASE, contentRefusedHint: 'رفض النموذج إنشاء هذا المحتوى. حاول إعادة صياغة رسالتك.' } };

export function getUIPhrases(language: LanguageCode | undefined): UIPhrases {
  return BY_LANG[getSupportedLanguage(language)] ?? BASE;
}
