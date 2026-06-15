/* eslint-disable @typescript-eslint/no-unused-vars */
// src/store/chatStore.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { appStorage, FastStorage } from '../utils/storage';
import { DatabaseService } from '../services/DatabaseService';
import { EditorEmotions } from '../types/StoryContract';
import { normalizeSpeakerId, speakerToDbId } from '../utils/ChatUtils';

/**
 * ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧
 * 梨꾪똿 ?ㅽ넗?????몄뀡 ?곸냽??+ 硫붿떆吏 愿由? * ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧
 *
 * ??[FIX] ChatMessage / StoredChatMessage ????듯빀
 *    湲곗〈: ???명꽣?섏씠?ㅺ? ?낅┰?곸쑝濡??뺤쓽?섏뼱 蹂??肄붾뱶 ?꾩쟻.
 *          ChatMessage ??StoredChatMessage 罹먯뒪?낆씠 怨녠납???곗옱.
 *    ?섏젙: ChatMessage ??optional ?뺤옣 ?꾨뱶瑜??듯빀.
 *          StoredChatMessage ???섏쐞 ?명솚 alias 濡쒕쭔 ?좎?.
 */

// ?? ????뺤쓽 ?????????????????????????????????????????????????

export interface ChatMessage {
  id:          string;
  speaker:     number;
  speakerName: string;
  content:     string;
  /**
   * [BUG-2 FIX] role ?꾨뱶 異붽? ??DB ?щ줈??fromStoredMessageToCore) ??speaker?뭨ole 蹂?섏쓣
   * 留ㅻ쾲 ?ш퀎?고븯吏 ?딆븘???섎룄濡?????쒖젏???뺤젙?쒕떎.
   * 'user' = speaker 1, 'narrator' = speaker 0, 'ai' = speaker ??2
   */
  role?: 'user' | 'ai' | 'narrator';
  // Optional legacy/display aliases used by admin preview
  speakerType?: string;
  speakerLabel?: string;
  text?: string;
  timestamp:   number;
  isImportant?: boolean;
  isIntro?:    boolean;
  characterProfileUrl?: string;
  chapter_id?: string;
  emotionDeltas?: Record<number, { e1?: number; e2?: number; e3?: number; e4?: number; e5?: number }>;

  // ??[FIX] StoredChatMessage ?꾨뱶 ?듯빀 ??optional?대?濡??섏쐞 ?명솚 ?좎?
  bookmarked?: boolean;
  setId?:      string;
  reactions?:  string[];
  replyTo?:    { id: string; text: string; senderName: string } | null;
  // [?섏젙] isChoiceResult 異붽? ??EmotionFlash 移??쒖떆 ?щ?
  isChoiceResult?: boolean;
  choices?:        import('../screens/chat/types/ChatTypes').ChoiceOption[];
  genre?: string;
}

/**
 * @deprecated ChatMessage 濡??듯빀?? 湲곗〈 肄붾뱶 ?명솚?깆쓣 ?꾪븳 alias.
 *             ??肄붾뱶?먯꽌??ChatMessage 瑜?吏곸젒 ?ъ슜?섏꽭??
 */
export type StoredChatMessage = ChatMessage;

export interface ChatSession {
  storyId:             string;
  messages:            ChatMessage[];
  currentChapterIndex: number;
  emotions:            Record<number, EditorEmotions>;
  dialogueHistory:     string[];
  turnCount:           number;
  lastUpdated:         number;
  modelId?:            string;
  /** ConversationsScreen 紐⑸줉 ?쒖떆??硫뷀? */
  storyMeta?: ChatSessionTypes.storyMeta;
}

export namespace ChatSessionTypes {
  /** ConversationsScreen 紐⑸줉 ?쒖떆??硫뷀? ???*/
  export interface storyMeta {
    title:      string;
    coverUrl:   string;
    authorName: string;
    charNames:  string[];
    genre?:     string; // ??[NEW]
    modelId?:   string;
  }
}


// ?? DB row ??ChatMessage 蹂???????????????????????????????????
// DatabaseService.getMessages()??conversations ?뚯씠釉?raw row瑜?諛섑솚.
// ChatMessage ?꾨뱶紐?id, speaker, isImportant)怨?DB 而щ읆紐?client_id, speaker_id, is_important)???ㅻⅤ誘濡?蹂???꾩닔.
function dbRowToChatMessage(row: any, storyId?: string): ChatMessage {
  const speaker = normalizeSpeakerId(row.speaker_id);
  const speakerName: string =
    row.speaker_name ||
    row.character_name ||
    (speaker === 1 ? 'user' : speaker === 0 ? 'narrator' : '');

  // ??[BUG FIX #4] 寃곗젙濡좎쟻 ID ?앹꽦
  // id, client_id ?????놁쑝硫?storyId + timestamp + speaker 議고빀?쇰줈 ?앹꽦
  const timestamp = Number(row.timestamp ?? 0);
  const fallbackId = `msg_${storyId ?? 'unknown'}_${timestamp}_${speaker}`;

  // [BUG-2 FIX] Resolve role once at load time instead of recalculating later.
  const role: ChatMessage['role'] = speaker === 1 ? 'user' : speaker === 0 ? 'narrator' : 'ai';

  return {
    id:          String(row.client_id ?? row.id ?? '') || fallbackId,
    speaker,
    role,
    speakerName,
    content:     String(row.content ?? ''),
    timestamp,
    isImportant: row.is_important === 1 || row.is_important === true,
    chapter_id:  row.chapter_id ?? undefined,
    emotionDeltas: undefined,
    bookmarked:  false };
}

// ?? ?ㅽ넗???명꽣?섏씠???????????????????????????????????????????

export interface ChatStore {
  sessions:      Record<string, ChatSession>;
  recentStoryId: string | null;

  initialize:     () => Promise<void>;
  loadSession:    (_storyId: string) => Promise<ChatSession | null>;
  saveSession:    (_session: ChatSession) => void;
  createSession:  (_storyId: string, _emotions: Record<number, EditorEmotions>, _storyMeta?: ChatSessionTypes.storyMeta) => ChatSession;
  setRecentStory: (_storyId: string) => Promise<void>;
  flushPending:   () => Promise<void>;
  addMessage:     (_storyId: string, _msg: ChatMessage, _dialogueLines?: string[]) => Promise<void>;
  /** ??[OPT v4] Batch INSERT ??AI ?묐떟 ?꾨즺 ??蹂듭닔 硫붿떆吏瑜??⑥씪 ?몃옖??뀡?쇰줈 ???*/
  addMessages:    (_storyId: string, _msgs: ChatMessage[], _dialogueLines?: string[]) => Promise<void>;
  loadHistory:    (_storyId: string) => Promise<void>;
  deleteMessages:  (_storyId: string, _messageIds: string[]) => void;
  updateMessage:   (_storyId: string, _messageId: string, _patch: Partial<ChatMessage>) => void;
  toggleReaction:  (_storyId: string, _messageId: string, _emoji: string) => void;

  // ?? ?꾨씫 硫붿꽌??(由ы뙥?좊쭅 ???몄텧遺 ?낅뜲?댄듃 ?꾨씫?쇰줈 ?명븳 異붽?) ??????????
  removeMessage:      (_storyId: string, _messageId: string) => void;
  updateEmotions:     (_storyId: string, _charId: number, _delta: Partial<EditorEmotions>) => void;
  advanceChapter:     (_storyId: string, _newChapterIndex: number, _emotions?: Record<number, EditorEmotions>) => void;
  clearSession:       (_storyId: string) => Promise<void>;
  bulkSyncMessages:   (_storyId: string, _messages: ChatMessage[]) => void;
  getSession:         (_storyId: string) => ChatSession | null;
  setCurrentEmotions: (_storyId: string, _emotions: Record<number, EditorEmotions>) => void;
}

// ?? ?곸닔 ??????????????????????????????????????????????????????

import {
  UI_MESSAGE_LIMIT,
  MMKV_MSG_LIMIT,
} from '../constants/chatLimits';

const RECENT_KEY     = '@recent_story';
const SESSION_PREFIX = 'session:';
const HEAD_PREFIX    = 'session_head:';

// UI쨌MMKV쨌Zustand 硫붾え由??쒕룄瑜?chatLimits?먯꽌 ?듭씪 import.
// DB(SQLite)??臾댁젣????saveMessagesBatch/saveMessageAsync媛 吏곸젒 INSERT.
//
// [MSG-LIMIT-FIX] MEMORY_MSG_LIMIT瑜?湲곌린 RAM 湲곕컲?쇰줈 ?숈쟻 寃곗젙.
// 100?쇰줈 怨좎젙?섎㈃ addMessage/addMessages ?????UI??蹂댁씠??92媛쒓? ?섎┛??
// ?ъ떆????loadHistory(DB ??100媛?? UI 硫붿떆吏 ?섍? ?щ씪???ъ슜?먯뿉寃?// 硫붿떆吏媛 ?щ씪吏?寃껋쿂??蹂댁씠???꾩긽 諛쒖깮.
// deviceProfiler.getCachedProfile()? ?숆린 ?몄텧?대ŉ ??湲곕룞 ???대? 罹먯떆??
function resolveMemoryMsgLimit(): number {
  try {
    // DeviceProfiler???쒗솚 ?섏〈???쇳븯湲??꾪빐 lazy require ?ъ슜.
    // chatStore????理쒖긽?⑥뿉??import?섎?濡?吏곸젒 import ??珥덇린???쒖꽌 臾몄젣 諛쒖깮 媛??
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { deviceProfiler } = require('../core/llama/DeviceProfiler') as
      { deviceProfiler: { getCachedProfile: () => { totalMB: number } | null } };
    const totalMB = deviceProfiler.getCachedProfile()?.totalMB ?? 0;
    if (totalMB >= 8 * 1024) return 192;  // ?? GB
    if (totalMB >= 6 * 1024) return 128;  // ?? GB
    if (totalMB >= 4 * 1024) return 96;   // ?? GB
  } catch {
    // DeviceProfiler 濡쒕뱶 ?ㅽ뙣 ???뚯뒪???섍꼍 ?? ?덉쟾??湲곕낯媛??ъ슜
  }
  return UI_MESSAGE_LIMIT; // 100 ??湲곕낯媛뮻룹??ъ뼇 湲곌린
}

const MEMORY_MSG_LIMIT = resolveMemoryMsgLimit();
/** [BUG-7 FIX] addMessage / saveSession ??寃쎈줈 dialogueHistory ?쒕룄 ?듭씪 */
const MMKV_DIALOGUE_LIMIT = 32;

// ??[PERF FIX] 硫붾え由????몄뀡 理쒕? 蹂댁쑀 ???쒗븳 (LRU ?뺤콉)
// 湲곗〈: ?몄뀡? 異붽?留??섍퀬 ??젣?섏? ?딆븘 ?ㅽ넗由?100媛??뚮젅????100媛??몄뀡??硫붾え由ъ뿉 ?곸＜
// ?섏젙: MAX_SESSIONS_IN_MEMORY 珥덇낵 ??lastUpdated 媛???ㅻ옒???몄뀡??硫붾え由ъ뿉???닿굅
const MAX_SESSIONS_IN_MEMORY = 10;

// [BUG FIX A-B/A-K] evictOldSessionsInPlace瑜????④퀎濡?遺꾨━
// Immer set() 肄쒕갚 ?덉뿉??appStorage.set/FastStorage.set 媛숈? side effect瑜??ㅽ뻾?섎㈃
// Strict Mode / concurrent rendering?먯꽌 Immer媛 肄쒕갚????踰??몄텧??以묐났 ????곗씠??遺덉씪移?諛쒖깮.
// ?섏젙: ?대뼡 ?몄뀡???닿굅?좎? 怨꾩궛留??섎뒗 pure ?⑥닔?, ?ㅼ젣 ??μ쓣 ?섑뻾?섎뒗 ?⑥닔瑜?遺꾨━.

/** Immer draft ?덉뿉???몄텧 媛?ν븳 pure ?⑥닔 ??吏?뺣맂 ?닿굅 ????ㅻ뱾????젣 */
function evictOldSessionsInPlace(sessions: Record<string, ChatSession>, toEvict: string[]): void {
  for (const k of toEvict) {
    delete sessions[k];
    pendingStories.delete(k);
  }
}

/** 
 * [BUG FIX #5] ?닿굅 ??곸쓣 寃곗젙?섎뒗 pure ?⑥닔
 */
function getKeysToEvict(sessions: Record<string, ChatSession>, storyId: string, currentSession: ChatSession): string[] {
  const nextSessions = { ...sessions, [storyId]: currentSession };
  const keys = Object.keys(nextSessions);
  if (keys.length <= MAX_SESSIONS_IN_MEMORY) return [];
  
  const sorted = keys.sort((a, b) => {
    const timeDiff = (nextSessions[a].lastUpdated ?? 0) - (nextSessions[b].lastUpdated ?? 0);
    return timeDiff !== 0 ? timeDiff : a.localeCompare(b);
  });
  return sorted.slice(0, keys.length - MAX_SESSIONS_IN_MEMORY);
}

/** 
 * 吏?뺣맂 ?ㅻ뱾???몄뀡???ㅽ넗由ъ??????(Side Effect)
 */
function persistSessions(sessions: Record<string, ChatSession>, keys: string[]): void {
  for (const k of keys) {
    try {
      const s = sessions[k];
      if (!s) continue;
      const sRaw = JSON.parse(JSON.stringify(s));
      const toStore: ChatSession = {
        ...sRaw,
        messages: sRaw.messages.slice(-MMKV_MSG_LIMIT),
        dialogueHistory: sRaw.dialogueHistory.slice(-MMKV_DIALOGUE_LIMIT) };
      appStorage.set(SESSION_PREFIX + k, JSON.stringify(toStore));
      FastStorage.set(HEAD_PREFIX + k, toStore);
      pendingStories.delete(k);
    } catch (err) {
      if (__DEV__) console.warn('[chatStore] persistSessions error:', err);
    }
  }
}

// persistEvictedSessions removed as part of unification. Use getKeysToEvict + persistSessions.

// ?? pending ??????????????????????????????????????????????????

const pendingStories = new Set<string>();

// ?? ?ㅽ넗??????????????????????????????????????????????????????

export const useChatStore = create<ChatStore>()(
  immer((set, get) => ({
    sessions:      {},
    recentStoryId: null,

    initialize: async () => {
      const recentId = appStorage.getString(RECENT_KEY);
      if (!recentId) return;
      set(draft => { draft.recentStoryId = recentId; });
      const { ChatSessionSchema } = await import('../types/schemas');
      const cached = FastStorage.getValidatedObject(HEAD_PREFIX + recentId, ChatSessionSchema);
      if (cached) {
        set(draft => { draft.sessions[recentId] = { ...cached, lastUpdated: Date.now() } as ChatSession; });
      }
    },

    loadSession: async (storyId: string): Promise<ChatSession | null> => {
      const inMemory = get().sessions[storyId];
      if (inMemory) return inMemory;

      try {
        const raw = appStorage.getString(SESSION_PREFIX + storyId);
        if (raw) {
          const { ChatSessionSchema } = await import('../types/schemas');
          const result = ChatSessionSchema.safeParse(JSON.parse(raw));
          if (!result.success) {
             if (__DEV__) console.warn('[chatStore] loadSession validation failed:', result.error);
             throw new Error('Validation failed');
          }
          const parsed = result.data;
          const now = Date.now();
          const sessionWithUpdatedTime = { 
          ...parsed, 
          lastUpdated: now, 
          storyId,
          messages: parsed.messages || []
        } as ChatSession;
          
          const toEvictKeys = getKeysToEvict(get().sessions, storyId, sessionWithUpdatedTime);
          // Persist using the latest in-memory snapshot before evicting victims.
          set(draft => {
            draft.sessions[storyId] = sessionWithUpdatedTime;
          });

          // Grab the victims from the LATEST store state to avoid race conditions
          persistSessions(get().sessions, toEvictKeys);

          set(draft => {
            evictOldSessionsInPlace(draft.sessions, toEvictKeys);
          });

          return sessionWithUpdatedTime;
        }
      } catch {
        appStorage.remove(SESSION_PREFIX + storyId);
      }

      try {
        const rawDbRows = await DatabaseService.getMessages(storyId);
        const dbMsgs: ChatMessage[] = (rawDbRows ?? []).map(row => dbRowToChatMessage(row, storyId));
        if (dbMsgs.length > 0) {
          // ... (existing logic for restoring meta/emotions handled correctly in view_file around line 285)
          const { ChatSessionSchema } = await import('../types/schemas');
          const head = FastStorage.getValidatedObject(HEAD_PREFIX + storyId, ChatSessionSchema);
          const session: ChatSession = {
            storyId,
            messages:            dbMsgs.slice(-MEMORY_MSG_LIMIT),
            currentChapterIndex: head?.currentChapterIndex ?? 0,
            emotions:            (head?.emotions as Record<number, EditorEmotions>) ?? {},
            dialogueHistory:     (head?.dialogueHistory ?? []).slice(-MMKV_DIALOGUE_LIMIT),
            turnCount:           head?.turnCount ?? 0,
            lastUpdated:         Date.now(),
            storyMeta: (head?.storyMeta || { title: '', genre: '', coverUrl: '', modelId: '', authorName: '', charNames: [] }) as ChatSessionTypes.storyMeta };
          const toEvict = getKeysToEvict(get().sessions, storyId, session);
          set(draft => {
            draft.sessions[storyId] = session;
          });
          // Persist victims before they disappear from memory.
          persistSessions(get().sessions, toEvict);
          set(draft => {
            evictOldSessionsInPlace(draft.sessions, toEvict);
          });
          return session;
        }
      } catch (e) { if (__DEV__) console.warn(`[chatStore] ignored error:`, e); }

      return null;
    },

    saveSession: (session: ChatSession) => {
      const oldSessions = get().sessions;
      const toEvict = getKeysToEvict(oldSessions, session.storyId, session);
      
      set(draft => {
        draft.sessions[session.storyId] = session;
      });

      // Persist victims before evicting them from memory.
      persistSessions(get().sessions, toEvict);

      set(draft => {
        evictOldSessionsInPlace(draft.sessions, toEvict);
      });
      // [BUG FIX] HEAD_PREFIX 利됱떆 媛깆떊 ??OOM 媛뺤젣醫낅즺 ??理쒖떊 梨뺥꽣/硫뷀? 蹂댁〈
      // [BUG FIX #2] HEAD ?????messages slice ??flushPending怨??숈씪?섍쾶 ?곸슜
      // session.messages媛 硫붾え由??곹븳(理쒕? 192媛?源뚯? ?щ씪?????덉뼱 MMKV 5MB ?쒕룄 珥덇낵 ?꾪뿕.
      // HEAD??鍮좊Ⅸ ?ъ떆?묒슜 罹먯떆?대?濡?MMKV_MSG_LIMIT(100)媛쒕줈 ?쒗븳?대룄 異⑸텇.
      // [BUG FIX] dialogueHistory???몃━諛???messages? ?숈씪???댁쑀濡?MMKV ?쒕룄 珥덇낵 諛⑹?.
      const headSession: ChatSession = {
        ...session,
        messages: session.messages.length > MMKV_MSG_LIMIT
          ? session.messages.slice(-MMKV_MSG_LIMIT)
          : session.messages,
        dialogueHistory: session.dialogueHistory.length > MMKV_DIALOGUE_LIMIT
          ? session.dialogueHistory.slice(-MMKV_DIALOGUE_LIMIT)
          : session.dialogueHistory };
      FastStorage.set(HEAD_PREFIX + session.storyId, headSession);
      pendingStories.add(session.storyId);
    },

    createSession: (
      storyId:    string,
      emotions:   Record<number, EditorEmotions>,
      storyMeta?: ChatSessionTypes.storyMeta,
    ): ChatSession => {
      const session: ChatSession = {
        storyId,
        messages:            [],
        currentChapterIndex: 0,
        emotions:            emotions ?? {},
        dialogueHistory:     [],
        turnCount:           0,
        lastUpdated:         Date.now(),
        storyMeta };
      const oldSessions = get().sessions;
      const toEvict = getKeysToEvict(oldSessions, storyId, session);
      
      set(draft => {
        draft.sessions[storyId] = session;
      });

      // Persist victims before evicting them from memory.
      persistSessions(get().sessions, toEvict);

      set(draft => {
        evictOldSessionsInPlace(draft.sessions, toEvict);
      });
      pendingStories.add(storyId);
      return session;
    },

    setRecentStory: async (storyId: string) => {
      set(draft => { draft.recentStoryId = storyId; });
      try { appStorage.set(RECENT_KEY, storyId); } catch (e) { if (__DEV__) console.warn(`[chatStore] ignored error:`, e); }
    },

    flushPending: async () => {
      if (pendingStories.size === 0) return;
      // [?섏젙] pendingStories.clear() ?꾩뿉 ?꾩옱 ?명듃瑜??ㅻ깄??      // 湲곗〈: clear() ??猷⑦봽 ??flush ?꾩쨷 saveSession??異붽?????ぉ? ?ㅼ쓬 flush源뚯? ?湲?(?뺤긽)
      //       ?섏?留?clear()? 猷⑦봽 ?ъ씠 ??대컢???좉퇋 ??ぉ??clear()???섑빐 ?좎떎?????덉쓬
      // ?섏젙: ?ㅻ깄?룹쑝濡?泥섎━????ぉ ?뺤젙 ?? ?ㅽ뙣????ぉ留??ㅼ떆 pendingStories??異붽?
      const toFlush = Array.from(pendingStories);
      for (const sid of toFlush) {
        const s = get().sessions[sid];
        if (!s) {
          pendingStories.delete(sid);
          continue;
        }
        try {
          const toStore: ChatSession = {
            ...s,
            messages: s.messages.slice(-MMKV_MSG_LIMIT),
            dialogueHistory: s.dialogueHistory.slice(-MMKV_DIALOGUE_LIMIT) };
          appStorage.set(SESSION_PREFIX + sid, JSON.stringify(toStore));
          FastStorage.set(HEAD_PREFIX + sid, toStore);
          
          // [BUG FIX #3] ?깃났 ?쒖뿉留??湲?紐⑸줉?먯꽌 ?쒓굅
          // 湲곗〈: clear() ??猷⑦봽 ??猷⑦봽 ?꾩쨷 諛쒖깮??saveSession ?붿껌???④퍡 吏?뚯쭚
          // Delete only the item that was successfully flushed.
          pendingStories.delete(sid);
        } catch (e) {
          if (__DEV__) console.warn(`[chatStore] flushPending failed for ${sid}:`, e);
          // ?ㅽ뙣 ??pendingStories??洹몃?濡???(?ъ떆??
        }
      }
    },

    // [BUG FIX A-C] _dialogueLines ?뚮씪誘명꽣 紐낆쓣 dialogueLines濡?蹂寃????ㅼ젣 ?ъ슜?섎뒗??_ prefix??誘몄궗??愿濡
    addMessage: async (storyId: string, msg: ChatMessage, dialogueLines?: string[]) => {
      const now = Date.now();
      const oldState = get();
      const stateSessions = oldState.sessions;
      
      let toEvict: string[] = [];
      let sessionToUpdate: ChatSession;

      if (!stateSessions[storyId]) {
        sessionToUpdate = {
          storyId, messages: [msg], currentChapterIndex: 0,
          emotions: {}, dialogueHistory: [...(dialogueLines ?? [])], turnCount: 0, lastUpdated: now };
      } else {
        sessionToUpdate = { 
          ...stateSessions[storyId], 
          lastUpdated: now, 
          messages: [...stateSessions[storyId].messages, msg] 
        };
        if (dialogueLines && dialogueLines.length > 0) {
          sessionToUpdate.dialogueHistory = [...sessionToUpdate.dialogueHistory, ...dialogueLines];
        }
      }

      if (sessionToUpdate.messages.length > MEMORY_MSG_LIMIT) {
        sessionToUpdate.messages = sessionToUpdate.messages.slice(-MEMORY_MSG_LIMIT);
      }
      if (sessionToUpdate.dialogueHistory.length > MMKV_DIALOGUE_LIMIT) {
        sessionToUpdate.dialogueHistory = sessionToUpdate.dialogueHistory.slice(-MMKV_DIALOGUE_LIMIT);
      }

      toEvict = getKeysToEvict(stateSessions, storyId, sessionToUpdate);
      set(draft => {
        draft.sessions[storyId] = sessionToUpdate;
      });
      // [BUG-7 FIX ??媛쒖꽑] pendingStories.add瑜?set() 諛뽰쑝濡??대룞.
      // Immer??Strict Mode / concurrent rendering?먯꽌 draft 肄쒕갚??2???몄텧?????덉쓬.
      // Set.add()??硫깅벑?대씪 ?ㅼ젣 踰꾧렇???놁?留?side effect??set() 諛뽰뿉???ㅽ뻾?섎뒗 寃껋씠 ?먯튃.
      // set() ?꾨즺 吏곹썑?대?濡?"flushPending??媛숈? ?깆뿉 ?ㅽ뻾?쇰룄 ?덉쟾"??蹂댁옣? 洹몃?濡??좎?.
      pendingStories.add(storyId);

      // Persist victims using the latest store state.
      persistSessions(get().sessions, toEvict);

      set(draft => {
        evictOldSessionsInPlace(draft.sessions, toEvict);
      });
      // [BUG FIX #13] FastStorage.set??Immer set 諛붽묑?쇰줈 ?대룞
      // Read back the real store object outside Immer before persisting.
      const session = get().sessions[storyId];
      if (session) {
        FastStorage.set(HEAD_PREFIX + storyId, session);
      }
      // [FIX] fire-and-forget ??await: MMKV ????꾨즺 ??SQLite??蹂댁옣.
      // 媛뺤젣 醫낅즺 ??留덉?留?硫붿떆吏 ?뚯떎 諛⑹?. DB??臾댁젣?????
      await DatabaseService.saveMessageAsync({
        ...msg,
        storyId,
        chapterId: msg.chapter_id ?? undefined,
        timestamp: msg.timestamp ?? Date.now(),
        speakerId: speakerToDbId(msg.speaker),
        isImportant: msg.isImportant ?? false }).catch(() => {});
    },

    /**
     * ??[OPT v4] addMessages ??蹂듭닔 硫붿떆吏 Batch INSERT
     *
     * AI ?묐떟 ?꾨즺 ???щ윭 硫붿떆吏(?섎젅?댄꽣 + AI)瑜???踰덉뿉 ???
     * 湲곗〈: setMessages([...prev, ...newMsgs]) ??媛?硫붿떆吏留덈떎 媛쒕퀎 ???     * ?섏젙: MMKV????踰덉뿉 ???+ DB??saveMessagesBatchFire濡??몃옖??뀡 1??     *
     */
    addMessages: async (storyId: string, msgs: ChatMessage[], dialogueLines?: string[]) => {
      if (!msgs.length) return;
      const now = Date.now();
      const oldState = get();
      const stateSessions = oldState.sessions;

      let toEvict: string[] = [];
      let sessionToUpdate: ChatSession;

      if (!stateSessions[storyId]) {
        sessionToUpdate = {
          storyId, messages: [...msgs], currentChapterIndex: 0,
          emotions: {}, dialogueHistory: [...(dialogueLines ?? [])], turnCount: 0, lastUpdated: now };
      } else {
        sessionToUpdate = { 
          ...stateSessions[storyId], 
          lastUpdated: now, 
          messages: [...stateSessions[storyId].messages, ...msgs] 
        };
        if (dialogueLines && dialogueLines.length > 0) {
          sessionToUpdate.dialogueHistory = [...sessionToUpdate.dialogueHistory, ...dialogueLines];
        }
      }

      if (sessionToUpdate.messages.length > MEMORY_MSG_LIMIT) {
        sessionToUpdate.messages = sessionToUpdate.messages.slice(-MEMORY_MSG_LIMIT);
      }
      if (sessionToUpdate.dialogueHistory.length > MMKV_DIALOGUE_LIMIT) {
        sessionToUpdate.dialogueHistory = sessionToUpdate.dialogueHistory.slice(-MMKV_DIALOGUE_LIMIT);
      }

      toEvict = getKeysToEvict(stateSessions, storyId, sessionToUpdate);
      set(draft => {
        draft.sessions[storyId] = sessionToUpdate;
      });
      // [BUG-7 FIX ??媛쒖꽑] pendingStories.add瑜?set() 諛뽰쑝濡??대룞 (addMessage? ?숈씪 ?댁쑀).
      pendingStories.add(storyId);

      // Persist victims using the latest store state.
      persistSessions(get().sessions, toEvict);

      set(draft => {
        evictOldSessionsInPlace(draft.sessions, toEvict);
      });
      // [BUG FIX #13] FastStorage.set??Immer set 諛붽묑?쇰줈 ?대룞 (Proxy 吏곷젹??諛⑹?)
      const session = get().sessions[storyId];
      if (session) {
        FastStorage.set(HEAD_PREFIX + storyId, session);
      }
      
      // Keep genre metadata when writing the batch to SQLite.
      const genre = session?.storyMeta?.genre;

      // [FIX] fire-and-forget ??await: DB ??μ쓣 蹂댁옣?쒕떎.
      // DB(SQLite)??臾댁젣???????硫붾え由?MMKV ?щ씪?댁뒪? 臾닿??섍쾶 ?꾨웾 INSERT.
      await DatabaseService.saveMessagesBatch(
        msgs.map((msg, idx) => ({
          ...msg,
          storyId,
          chapterId: msg.chapter_id ?? undefined,
          genre,
          timestamp: msg.timestamp ?? (now + idx),
          speakerId: speakerToDbId(msg.speaker),
          isImportant: msg.isImportant ?? false })),
      ).catch(e => {
        if (__DEV__) console.error('[chatStore] addMessages DB ????ㅽ뙣:', e);
      });
    },

    loadHistory: async (storyId: string) => {
      try {
        const rawHistory = await DatabaseService.getMessages(storyId);
        const history: ChatMessage[] = (rawHistory ?? []).map(row => dbRowToChatMessage(row, storyId));
        if (history.length > 0) {
          set(draft => {
            if (!draft.sessions[storyId]) {
              draft.sessions[storyId] = {
                storyId, messages: [], currentChapterIndex: 0,
                emotions: {}, dialogueHistory: [], turnCount: 0, lastUpdated: Date.now() };
            }
            const session = draft.sessions[storyId]!;
            // [BUG-12 FIX] loadHistory: ??뼱?곌린 ???蹂묓빀
            // 湲곗〈: session.messages = history; ??硫붾え由ъ뿉留??덈뜕 理쒖떊 硫붿떆吏 ?좎떎 ?꾪뿕
            // ?섏젙: ID(client_id) 湲곗??쇰줈 以묐났 ?쒓굅?섎ŉ 蹂묓빀
            const existingIds = new Set(session.messages.map(m => m.id));
            const newEntries = history.filter(m => !existingIds.has(m.id));
            session.messages = [...session.messages, ...newEntries]
              // [BUG-SORT FIX] ??꾩뒪?ы봽 ?숈젏(媛숈? ??AI ?뚯떛 寃곌낵) ???쒖꽌媛
              // non-deterministic ???щ줈?쒕쭏??硫붿떆吏 ?쒖꽌媛 ?ㅼ쭛?덈뒗 踰꾧렇 ?섏젙.
              // timestamp 媛숈쑝硫?id ?뚰뙆踰??쒖쑝濡?怨좎젙(msg_<ms>_ai_0 < msg_<ms>_ai_1).
              .sort((a, b) => a.timestamp !== b.timestamp
                ? a.timestamp - b.timestamp
                : a.id.localeCompare(b.id))
              .slice(-MEMORY_MSG_LIMIT);

            // [BUG-13 FIX] HEAD?먯꽌 媛먯젙/??뷀엳?ㅽ넗由?梨뺥꽣 蹂듭썝 ??loadSession怨??숈씪 ?⑦꽩
            try {
              const head = FastStorage.getObject(HEAD_PREFIX + storyId) as ChatSession | null;
              if (head) {
                if (Object.keys(head.emotions ?? {}).length > 0)
                  session.emotions = head.emotions;
                if ((head.dialogueHistory ?? []).length > 0)
                  session.dialogueHistory = head.dialogueHistory;
                if (head.currentChapterIndex != null)
                  session.currentChapterIndex = head.currentChapterIndex;
                if (head.turnCount != null)
                  session.turnCount = head.turnCount;
              }
            } catch {}
          });
        }
      } catch (e) { if (__DEV__) console.warn(`[chatStore] ignored error:`, e); }
    },

    deleteMessages: (storyId: string, messageIds: string[]) => {
      if (!messageIds.length) return;
      const idSet = new Set(messageIds);
      set(draft => {
        const session = draft.sessions[storyId];
        if (!session) return;
        session.messages = session.messages.filter(m => !idSet.has(m.id));
        session.lastUpdated = Date.now();
        // [BUG FIX #13] FastStorage.set??Immer set 諛붽묑?쇰줈 ?대룞 (Proxy 吏곷젹??諛⑹?)
        pendingStories.add(storyId);
      });
      // Persist using the real store object outside Immer.
      const sessionAfter = get().sessions[storyId];
      if (sessionAfter) {
        FastStorage.set(HEAD_PREFIX + storyId, sessionAfter);
      }
      // eslint-disable-next-line no-void
      void DatabaseService.deleteMessages(storyId, messageIds).catch(() => {});
    },

    updateMessage: (storyId: string, messageId: string, patch: Partial<ChatMessage>) => {
      set(draft => {
        const session = draft.sessions[storyId];
        if (!session) return;
        const msg = session.messages.find(m => m.id === messageId);
        if (!msg) return;
        Object.assign(msg, patch);
        session.lastUpdated = Date.now();
        // [BUG FIX #13] FastStorage.set??Immer set 諛붽묑?쇰줈 ?대룞
        pendingStories.add(storyId);
      });
      const sessionAfter = get().sessions[storyId];
      if (sessionAfter) {
        FastStorage.set(HEAD_PREFIX + storyId, sessionAfter);
      }
    },

    toggleReaction: (storyId: string, messageId: string, emoji: string) => {
      set(draft => {
        const session = draft.sessions[storyId];
        if (!session) return;
        const msg = session.messages.find(m => m.id === messageId);
        if (!msg) return;
        const reactions: string[] = msg.reactions ?? [];
        const idx = reactions.indexOf(emoji);
        if (idx >= 0) reactions.splice(idx, 1);
        else reactions.push(emoji);
        msg.reactions = reactions;
        session.lastUpdated = Date.now();
        // [BUG FIX #13] FastStorage.set??Immer set 諛붽묑?쇰줈 ?대룞
        pendingStories.add(storyId);
      });
      const sessionAfter = get().sessions[storyId];
      if (sessionAfter) {
        FastStorage.set(HEAD_PREFIX + storyId, sessionAfter);
      }
    },

    // ?? 由ы뙥?좊쭅 ???꾨씫??硫붿꽌??蹂듦뎄 ???????????????????????????

    removeMessage: (storyId: string, messageId: string) => {
      set(draft => {
        const session = draft.sessions[storyId];
        if (!session) return;
        session.messages = session.messages.filter(m => m.id !== messageId);
        session.lastUpdated = Date.now();
        // [BUG FIX #13] FastStorage.set??Immer set 諛붽묑?쇰줈 ?대룞
        pendingStories.add(storyId);
      });
      const sessionAfter = get().sessions[storyId];
      if (sessionAfter) {
        FastStorage.set(HEAD_PREFIX + storyId, sessionAfter);
      }
      // eslint-disable-next-line no-void
      void DatabaseService.deleteMessages(storyId, [messageId]).catch(() => {});
    },

    updateEmotions: (storyId: string, charId: number, delta: Partial<EditorEmotions>) => {
      set(draft => {
        const session = draft.sessions[storyId];
        if (!session) return;
        const prev = session.emotions[charId] ?? { e1: 0, e2: 0, e3: 0, e4: 0, e5: 0 };
        session.emotions[charId] = {
          e1: Math.max(-100, Math.min(100, (prev.e1 ?? 0) + (delta.e1 ?? 0))),
          e2: Math.max(-100, Math.min(100, (prev.e2 ?? 0) + (delta.e2 ?? 0))),
          e3: Math.max(-100, Math.min(100, (prev.e3 ?? 0) + (delta.e3 ?? 0))),
          e4: Math.max(-100, Math.min(100, (prev.e4 ?? 0) + (delta.e4 ?? 0))),
          e5: Math.max(-100, Math.min(100, (prev.e5 ?? 0) + (delta.e5 ?? 0))) };
        session.lastUpdated = Date.now();
        // [BUG FIX #13] FastStorage.set??Immer set 諛붽묑?쇰줈 ?대룞
        pendingStories.add(storyId);
      });
      const sessionAfter = get().sessions[storyId];
      if (sessionAfter) {
        FastStorage.set(HEAD_PREFIX + storyId, sessionAfter);
      }
    },

    advanceChapter: (storyId: string, newChapterIndex: number, emotions?: Record<number, EditorEmotions>) => {
      set(draft => {
        const session = draft.sessions[storyId];
        if (!session) return;
        session.currentChapterIndex = newChapterIndex;
        session.turnCount = 0;
        // [BUG FIX] emotions ?쒓났 ?쒖뿉留???뼱?곌퀬, 誘몄젣怨????댁쟾 梨뺥꽣 媛먯젙媛??좎?
        if (emotions) {
          session.emotions = emotions;
        }
        session.lastUpdated = Date.now();
        // [BUG FIX #13] FastStorage.set??Immer set 諛붽묑?쇰줈 ?대룞
        pendingStories.add(storyId);
      });
      const sessionAfter = get().sessions[storyId];
      if (sessionAfter) {
        FastStorage.set(HEAD_PREFIX + storyId, sessionAfter);
      }
    },

    clearSession: async (storyId: string): Promise<void> => {
      set(draft => {
        delete draft.sessions[storyId];
      });
      FastStorage.remove(HEAD_PREFIX + storyId);
      appStorage.remove(SESSION_PREFIX + storyId);
      pendingStories.delete(storyId);
      await DatabaseService.deleteMessagesByStory(storyId).catch(() => {});
    },

    bulkSyncMessages: (storyId: string, messages: ChatMessage[]) => {
      set(draft => {
        const session = draft.sessions[storyId];
        if (!session) return;
        session.messages = messages.slice(-MEMORY_MSG_LIMIT);
        session.lastUpdated = Date.now();
        // [BUG FIX #13] FastStorage.set??Immer set 諛붽묑?쇰줈 ?대룞
        pendingStories.add(storyId);
      });
      const sessionAfter = get().sessions[storyId];
      if (sessionAfter) {
        FastStorage.set(HEAD_PREFIX + storyId, sessionAfter);
      }
    },

    getSession: (storyId: string): ChatSession | null => {
      return get().sessions[storyId] ?? null;
    },

    setCurrentEmotions: (storyId: string, emotions: Record<number, EditorEmotions>) => {
      set(draft => {
        const session = draft.sessions[storyId];
        if (!session) return;
        session.emotions = emotions;
        session.lastUpdated = Date.now();
        // [BUG FIX #13] FastStorage.set??Immer set 諛붽묑?쇰줈 ?대룞
        pendingStories.add(storyId);
      });
      const sessionAfter = get().sessions[storyId];
      if (sessionAfter) {
        FastStorage.set(HEAD_PREFIX + storyId, sessionAfter);
      }
    } })),
);

// ?? ?몄뀡 ?좉툑 ?ы띁 ????????????????????????????????????????????

export function hasChatSessionLock(): boolean {
  const { sessions, recentStoryId } = useChatStore.getState();
  if (!recentStoryId) return false;
  const session = sessions[recentStoryId];
  if (!session) return false;
  const isRecent = Date.now() - (session.lastUpdated ?? 0) < 30_000;
  return session.messages.length > 0 && isRecent;
}

/**
 * [NEW] ??醫낅즺/?ъ떆?????뺣━ ?묒뾽 ??HMR ?щ줈??諛??뚯뒪???섍꼍 ?뺥빀??蹂댁옣
 */
export function teardownApp() {
  pendingStories.clear();
}

// Export removeMessage for external use
export const removeMessage = (storyId: string, messageId: string) => {
  useChatStore.getState().removeMessage(storyId, messageId);
};

