import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as RNLocalize from 'react-native-localize';

import { mmkv } from '../../utils/storage';

const CORE_LANGUAGES = [
  'en',
  'es',
  'pt',
  'fr',
  'de',
  'it',
  'ru',
  'ko',
  'ja',
  'zh-CN',
  'zh-TW',
  'th',
  'tr',
  'hi',
  'ar',
] as const;

type CoreLanguage = typeof CORE_LANGUAGES[number];
type TranslationTable = Record<string, string>;
type CoreResources = Record<CoreLanguage, { translation: TranslationTable }>;

const resources: CoreResources = {
  en: {
    translation: {
      push_new_chapter: 'Author {{name}} updated a new chapter for {{title}}!',
      push_novel_reaction: '{{name}} left a comment on your novel.',
      push_community_reaction: 'There\'s a new reaction to your community post.',
      push_chat_message: '{{name}}: {{message}}',
      push_like: '{{name}} liked your post.',
      push_follow: '{{name}} started following you.',
      push_announcement: 'Check the latest announcement.',
      push_system_event: 'Check out the new system event!',
      action_read: 'Read Now',
      action_dismiss: 'Dismiss',
    },
  },
  es: {
    translation: {
      push_new_chapter: '¡El autor {{name}} actualizó un nuevo capítulo de {{title}}!',
      push_novel_reaction: '{{name}} dejó un comentario en tu novela.',
      push_community_reaction: 'Hay una nueva reacción en tu publicación de la comunidad.',
      push_chat_message: '{{name}}: {{message}}',
      push_like: 'A {{name}} le gustó tu publicación.',
      push_follow: '{{name}} comenzó a seguirte.',
      push_announcement: 'Consulta el anuncio más reciente.',
      push_system_event: '¡Mira el nuevo evento del sistema!',
      action_read: 'Leer ahora',
      action_dismiss: 'Cerrar',
    },
  },
  pt: {
    translation: {
      push_new_chapter: 'O autor {{name}} atualizou um novo capítulo de {{title}}!',
      push_novel_reaction: '{{name}} deixou um comentário no seu romance.',
      push_community_reaction: 'Há uma nova reação na sua publicação da comunidade.',
      push_chat_message: '{{name}}: {{message}}',
      push_like: '{{name}} curtiu a sua publicação.',
      push_follow: '{{name}} começou a seguir você.',
      push_announcement: 'Confira o anúncio mais recente.',
      push_system_event: 'Confira o novo evento do sistema!',
      action_read: 'Ler agora',
      action_dismiss: 'Fechar',
    },
  },
  fr: {
    translation: {
      push_new_chapter: 'L\'auteur {{name}} a mis à jour un nouveau chapitre de {{title}} !',
      push_novel_reaction: '{{name}} a laissé un commentaire sur votre roman.',
      push_community_reaction: 'Il y a une nouvelle réaction sur votre publication communautaire.',
      push_chat_message: '{{name}}: {{message}}',
      push_like: '{{name}} a aimé votre publication.',
      push_follow: '{{name}} a commencé à vous suivre.',
      push_announcement: 'Consultez la dernière annonce.',
      push_system_event: 'Découvrez le nouvel événement système !',
      action_read: 'Lire',
      action_dismiss: 'Fermer',
    },
  },
  de: {
    translation: {
      push_new_chapter: 'Autor {{name}} hat ein neues Kapitel von {{title}} aktualisiert!',
      push_novel_reaction: '{{name}} hat Ihren Roman kommentiert.',
      push_community_reaction: 'Es gibt eine neue Reaktion auf Ihren Community-Beitrag.',
      push_chat_message: '{{name}}: {{message}}',
      push_like: '{{name}} hat Ihren Beitrag mit „Gefällt mir“ markiert.',
      push_follow: '{{name}} folgt Ihnen jetzt.',
      push_announcement: 'Sehen Sie sich die neueste Ankündigung an.',
      push_system_event: 'Sehen Sie sich das neue Systemereignis an!',
      action_read: 'Jetzt lesen',
      action_dismiss: 'Schließen',
    },
  },
  it: {
    translation: {
      push_new_chapter: 'L\'autore {{name}} ha aggiornato un nuovo capitolo di {{title}}!',
      push_novel_reaction: '{{name}} ha lasciato un commento sul tuo romanzo.',
      push_community_reaction: 'C\'è una nuova reazione al tuo post della community.',
      push_chat_message: '{{name}}: {{message}}',
      push_like: '{{name}} ha messo mi piace al tuo post.',
      push_follow: '{{name}} ha iniziato a seguirti.',
      push_announcement: 'Controlla l\'ultimo annuncio.',
      push_system_event: 'Scopri il nuovo evento di sistema!',
      action_read: 'Leggi ora',
      action_dismiss: 'Chiudi',
    },
  },
  ru: {
    translation: {
      push_new_chapter: 'Автор {{name}} обновил новую главу {{title}}!',
      push_novel_reaction: '{{name}} оставил комментарий к вашему роману.',
      push_community_reaction: 'На вашу публикацию в сообществе появилась новая реакция.',
      push_chat_message: '{{name}}: {{message}}',
      push_like: '{{name}} поставил(а) лайк вашей публикации.',
      push_follow: '{{name}} подписался(ась) на вас.',
      push_announcement: 'Посмотрите последнее объявление.',
      push_system_event: 'Посмотрите новое системное событие!',
      action_read: 'Читать',
      action_dismiss: 'Закрыть',
    },
  },
  ko: {
    translation: {
      push_new_chapter: '작가 {{name}}님의 {{title}} 새 챕터가 업데이트되었습니다!',
      push_novel_reaction: '{{name}}님이 회원님의 소설에 댓글을 남겼습니다.',
      push_community_reaction: '커뮤니티 게시물에 새로운 반응이 있습니다.',
      push_chat_message: '{{name}}: {{message}}',
      push_like: '{{name}}님이 회원님의 게시물을 좋아합니다.',
      push_follow: '{{name}}님이 회원님을 팔로우하기 시작했습니다.',
      push_announcement: '새 공지사항을 확인해보세요.',
      push_system_event: '새로운 시스템 이벤트를 확인해 보세요!',
      action_read: '지금 읽기',
      action_dismiss: '닫기',
    },
  },
  ja: {
    translation: {
      push_new_chapter: '作家 {{name}} さんが {{title}} の新しいチャプターを更新しました！',
      push_novel_reaction: '{{name}} さんがあなたの小説にコメントしました。',
      push_community_reaction: 'コミュニティ投稿に新しい反応があります。',
      push_chat_message: '{{name}}: {{message}}',
      push_like: '{{name}} さんがあなたの投稿を気に入りました。',
      push_follow: '{{name}} さんがあなたをフォローし始めました。',
      push_announcement: '最新のお知らせを確認してください。',
      push_system_event: '新しいシステムイベントを確認してください！',
      action_read: '今すぐ読む',
      action_dismiss: '閉じる',
    },
  },
  'zh-CN': {
    translation: {
      push_new_chapter: '作者 {{name}} 更新了 {{title}} 的新章节！',
      push_novel_reaction: '{{name}} 评论了你的小说。',
      push_community_reaction: '你的社区帖子有新的互动。',
      push_chat_message: '{{name}}: {{message}}',
      push_like: '{{name}} 赞了你的帖子。',
      push_follow: '{{name}} 开始关注你了。',
      push_announcement: '请查看最新公告。',
      push_system_event: '查看新的系统事件！',
      action_read: '立即阅读',
      action_dismiss: '关闭',
    },
  },
  'zh-TW': {
    translation: {
      push_new_chapter: '作者 {{name}} 更新了 {{title}} 的新章節！',
      push_novel_reaction: '{{name}} 留言了你的小說。',
      push_community_reaction: '你的社群貼文有新的互動。',
      push_chat_message: '{{name}}: {{message}}',
      push_like: '{{name}} 按讚了你的貼文。',
      push_follow: '{{name}} 開始追蹤你了。',
      push_announcement: '請查看最新公告。',
      push_system_event: '查看新的系統事件！',
      action_read: '立即閱讀',
      action_dismiss: '關閉',
    },
  },
  th: {
    translation: {
      push_new_chapter: 'ผู้เขียน {{name}} อัปเดตตอนใหม่ของ {{title}} แล้ว!',
      push_novel_reaction: '{{name}} แสดงความคิดเห็นเกี่ยวกับนิยายของคุณ',
      push_community_reaction: 'มีปฏิกิริยาใหม่ในโพสต์ชุมชนของคุณ',
      push_chat_message: '{{name}}: {{message}}',
      push_like: '{{name}} ถูกใจโพสต์ของคุณ',
      push_follow: '{{name}} เริ่มติดตามคุณแล้ว',
      push_announcement: 'โปรดดูประกาศล่าสุด',
      push_system_event: 'ดูกิจกรรมระบบใหม่!',
      action_read: 'อ่านตอนนี้',
      action_dismiss: 'ปิด',
    },
  },
  tr: {
    translation: {
      push_new_chapter: '{{name}}, {{title}} için yeni bir bölüm güncelledi!',
      push_novel_reaction: '{{name}} romanına yorum yaptı.',
      push_community_reaction: 'Topluluk gönderinde yeni bir etkileşim var.',
      push_chat_message: '{{name}}: {{message}}',
      push_like: '{{name}} gönderini beğendi.',
      push_follow: '{{name}} seni takip etmeye başladı.',
      push_announcement: 'En son duyuruyu kontrol et.',
      push_system_event: 'Yeni sistem etkinliğine göz at!',
      action_read: 'Şimdi oku',
      action_dismiss: 'Kapat',
    },
  },
  hi: {
    translation: {
      push_new_chapter: 'लेखक {{name}} ने {{title}} का नया अध्याय अपडेट किया है!',
      push_novel_reaction: '{{name}} ने आपके उपन्यास पर टिप्पणी की।',
      push_community_reaction: 'आपकी सामुदायिक पोस्ट पर नई प्रतिक्रिया आई है।',
      push_chat_message: '{{name}}: {{message}}',
      push_like: '{{name}} ने आपकी पोस्ट पसंद की।',
      push_follow: '{{name}} ने आपको फॉलो करना शुरू किया।',
      push_announcement: 'नवीनतम घोषणा देखें।',
      push_system_event: 'नए सिस्टम इवेंट को देखें!',
      action_read: 'अभी पढ़ें',
      action_dismiss: 'बंद करें',
    },
  },
  ar: {
    translation: {
      push_new_chapter: 'قام المؤلف {{name}} بتحديث فصل جديد من {{title}}!',
      push_novel_reaction: 'ترك {{name}} تعليقًا على روايتك.',
      push_community_reaction: 'هناك تفاعل جديد على منشورك في المجتمع.',
      push_chat_message: '{{name}}: {{message}}',
      push_like: 'أعجب {{name}} بمنشورك.',
      push_follow: 'بدأ {{name}} بمتابعتك.',
      push_announcement: 'تحقق من أحدث إعلان.',
      push_system_event: 'تحقق من حدث النظام الجديد!',
      action_read: 'اقرأ الآن',
      action_dismiss: 'إغلاق',
    },
  },
};

const DEFAULT_LANGUAGE: CoreLanguage = 'en';

function normalizeCoreLanguage(input) {
  if (typeof input !== 'string') return null;
  const normalized = input.trim().replace(/_/g, '-');
  if (!normalized) return null;
  const lower = normalized.toLowerCase();

  if (lower.startsWith('zh')) {
    if (lower.includes('hant') || lower.includes('tw') || lower.includes('hk') || lower.includes('mo')) {
      return 'zh-TW';
    }
    return 'zh-CN';
  }

  const direct = CORE_LANGUAGES.find(lang => lang.toLowerCase() === lower);
  if (direct) return direct;

  const base = lower.slice(0, 2);
  return CORE_LANGUAGES.find(lang => lang.toLowerCase() === base) ?? null;
}

function detectDeviceLanguage() {
  try {
    const locales = RNLocalize.getLocales();
    for (const locale of locales) {
      const detected = normalizeCoreLanguage(locale?.languageTag || locale?.languageCode);
      if (detected) return detected;
      const combined = [locale?.languageCode, locale?.countryCode].filter(Boolean).join('-');
      const combinedDetected = normalizeCoreLanguage(combined);
      if (combinedDetected) return combinedDetected;
    }
  } catch {}
  return null;
}

function readPersistedAppLanguage() {
  try {
    const raw = mmkv.getString('language-store-v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeCoreLanguage(parsed?.state?.appLanguage ?? parsed?.appLanguage);
  } catch {
    return null;
  }
}

const languageDetector = {
  type: 'languageDetector' as const,
  async: true,
  detect: (cb: (lang: string) => void) => {
    cb(readPersistedAppLanguage() ?? detectDeviceLanguage() ?? DEFAULT_LANGUAGE);
  },
  init: () => {},
  cacheUserLanguage: () => {},
};

i18n
  .use(languageDetector as any)
  .use(initReactI18next)
  .init({
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...CORE_LANGUAGES],
    resources,
    debug: false,
    interpolation: {
      escapeValue: false,
    },
  });

export function syncCoreI18nLanguage(lang) {
  const next = normalizeCoreLanguage(lang) ?? DEFAULT_LANGUAGE;
  if (normalizeCoreLanguage(i18n.language) === next) {
    return;
  }
  void i18n.changeLanguage(next).catch(() => {});
}

export function getCoreI18nLanguage() {
  return normalizeCoreLanguage(i18n.language) ?? DEFAULT_LANGUAGE;
}

export default i18n;
