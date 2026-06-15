
// src/screens/chat/ChatHistorySearch.tsx
// BM25 기반 채팅 히스토리 검색 + 멀티 캐릭터 선택기
// 기존 대화 기록을 빠르게 탐색

import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, StatusBar, TextInput,
  ScrollView, TouchableHighlight } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Search, X, MessageSquare, Clock, ArrowLeft } from 'lucide-react-native';
  
 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useShallow } from 'zustand/react/shallow';

import { PressableOpacity } from '../../components/PressableOpacity';
import { EmptyState } from '../../components/EmptyState';
import { Radius, Typography } from '../../constants/tokens';
import { useTranslation } from '../../hooks/useTranslation';

// ── BM25 경량 구현 ─────────────────────────────────────────────────────────
// (facebook/lexical 참고 간략 구현 – 실제 대용량에는 서버 검색 권장)
const K1 = 1.5;
const B = 0.75;
const DEFAULT_HISTORY_SEARCH_TITLE = 'History Search';
const DEFAULT_SEARCH_PLACEHOLDER = 'Search chat history...';
const DEFAULT_RESULT_COUNT = '{n} results';
const DEFAULT_NO_RESULTS_TITLE = 'No results found';
const DEFAULT_NO_RESULTS_HINT = 'Try different keywords';
const DEFAULT_NO_HISTORY_TITLE = 'No chat history';

interface Doc { id: string; text: string; }

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^ㄱ-ㅎ가-힣a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
}

function buildBM25Index(docs: Doc[]) {
  const tf: Map<string, Map<string, number>> = new Map();
  const df: Map<string, number> = new Map();
  const avgLen = docs.reduce((s, d) => s + tokenize(d.text).length, 0) / (docs.length || 1);

  for (const doc of docs) {
    const tokens = tokenize(doc.text);
    const freq: Record<string, number> = {};
    for (const t of tokens) freq[t] = (freq[t] || 0) + 1;
    const docTf = new Map(Object.entries(freq));
    tf.set(doc.id, docTf);
    for (const t of Object.keys(freq)) df.set(t, (df.get(t) || 0) + 1);
  }

  return {
    score(docId: string, query: string): number {
      const tokens = tokenize(query);
      const docTf = tf.get(docId);
      if (!docTf) return 0;
      const docLen = Array.from(docTf.values()).reduce((s, v) => s + v, 0);
      let score = 0;
      for (const t of tokens) {
        const freq = docTf.get(t) || 0;
        const idf = Math.log((docs.length - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));
        const tf_ = freq * (K1 + 1) / (freq + K1 * (1 - B + B * docLen / avgLen));
        score += idf * tf_;
      }
      return score;
    } };
}

// ── Types ──────────────────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  characterId: string;
  characterName: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface Character {
  id: string;
  name: string;
  avatarUrl?: string;
}

// ── 채팅 기록 로더 (실제 앱의 KV schema에 맞게 수정 필요) ────────────────
// MMKV는 Nitro lazy init이 필요하므로 require 패턴 사용
function loadChatMessages(): ChatMessage[] {
  try {
    const mod = require('react-native-mmkv');
    const createFn = mod?.createMMKV ?? mod?.MMKV;
    if (!createFn) return [];
    const kv = typeof createFn === 'function'
      ? createFn({ id: 'chat-history' })
      : new createFn({ id: 'chat-history' });
    const raw = kv.getString('all_messages');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function loadCharacters(): Character[] {
  try {
    const mod = require('react-native-mmkv');
    const createFn = mod?.createMMKV ?? mod?.MMKV;
    if (!createFn) return [];
    const kv = typeof createFn === 'function'
      ? createFn({ id: 'chat-history' })
      : new createFn({ id: 'chat-history' });
    const raw = kv.getString('characters');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

// ── Highlight helper ───────────────────────────────────────────────────────
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <Text style={hs.base}>{text}</Text>;
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(re);
  const highlightedParts = parts.map((part, index) => (
    index % 2 === 1 ? <Text key={index} style={hs.mark}>{part}</Text> : part
  ));
  return (
    <Text style={hs.base}>
      {highlightedParts}
    </Text>
  );
}

const hs = StyleSheet.create({
  base: { fontSize: 13, color: '#9A9AB4', lineHeight: 20, fontFamily: Typography.fontFamily.regular },
  mark: { backgroundColor: 'rgba(212,168,83,0.25)', color: '#D4A853', fontFamily: Typography.fontFamily.semibold } });

// ── Main ───────────────────────────────────────────────────────────────────
export function ChatHistorySearch({ navigation }: any) {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const [selectedChar, setSelectedChar] = useState<string | null>(null);
  const [messages] = useState<ChatMessage[]>(loadChatMessages);
  const [characters] = useState<Character[]>(loadCharacters);
  const historySearchTitle = t?.historySearchTitle ?? DEFAULT_HISTORY_SEARCH_TITLE;
  const searchPlaceholder = t?.searchPlaceholder ?? t?.chatSearchPlaceholder ?? DEFAULT_SEARCH_PLACEHOLDER;
  const filterAllLabel = t?.filterAll ?? t?.all ?? 'All';
  const roleUserLabel = t?.roleUser ?? t?.meLabel ?? 'Me';
  const noSearchResultTitle = t?.noSearchResult ?? t?.searchNoResults ?? DEFAULT_NO_RESULTS_TITLE;
  const noSearchResultHint = t?.noSearchResultHint ?? t?.searchTryOther ?? DEFAULT_NO_RESULTS_HINT;
  const noHistoryTitle = t?.noHistory ?? t?.noChatHistory ?? DEFAULT_NO_HISTORY_TITLE;

  // BM25 인덱스 빌드 (memoize)
  const index = useMemo(() => buildBM25Index(messages.map(m => ({ id: m.id, text: m.content }))), [messages]);

  const results = useMemo(() => {
    let list = messages;
    if (selectedChar) list = list.filter(m => m.characterId === selectedChar);
    if (!query.trim()) {
      return list.slice(-50).reverse(); // 최근 50개
    }
    const scored = list.map(m => ({ msg: m, score: index.score(m.id, query) }));
    return scored.filter(s => s.score > 0.1).sort((a, b) => b.score - a.score).slice(0, 30).map(s => s.msg);
  }, [query, selectedChar, messages, index]);
  const resultCountLabel = (t?.resultCount ?? DEFAULT_RESULT_COUNT).replace('{n}', String(results.length));

  const navigateToSession = useCallback((msg: ChatMessage) => {
    navigation.navigate('Chat', {
      characterId: msg.characterId,
      sessionId: msg.sessionId,
      highlightMessageId: msg.id });
  }, [navigation]);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={'#050507'} />

      {/* 헤더 */}
      <View style={s.header}>
        <PressableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={20} color={'#F0F0F5'} />
        </PressableOpacity>
        <Text style={s.headerTitle}>{historySearchTitle}</Text>
      </View>

      {/* 검색 */}
      <View style={s.searchWrap}>
        <Search size={15} color={'#797990'} />
        <TextInput
          style={s.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={searchPlaceholder}
          placeholderTextColor={'#757585'}
          autoFocus
        />
        {!!query && (
          <PressableOpacity onPress={() => setQuery('')}>
            <X size={14} color={'#797990'} />
          </PressableOpacity>
        )}
      </View>

      {/* 캐릭터 필터 */}
      {characters.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.charRow}
        >
          <PressableOpacity
            style={[s.charChip, !selectedChar && s.charChipActive]}
            onPress={() => setSelectedChar(null)}
          >
            <Text style={[s.charChipTxt, !selectedChar && s.charChipTxtActive]}>{filterAllLabel}</Text>
          </PressableOpacity>
          {characters.map(c => (
            <PressableOpacity
              key={c.id}
              style={[s.charChip, selectedChar === c.id && s.charChipActive]}
              onPress={() => setSelectedChar(prev => prev === c.id ? null : c.id)}
            >
              <View style={s.charAvatar}>
                <Text style={s.charAvatarTxt}>{c.name[0]}</Text>
              </View>
              <Text style={[s.charChipTxt, selectedChar === c.id && s.charChipTxtActive]}>{c.name}</Text>
            </PressableOpacity>
          ))}
        </ScrollView>
      )}

      {/* 결과 카운트 */}
      {query.trim() && (
        <Text style={s.resultCount}>
          {resultCountLabel}
        </Text>
      )}

      {/* 결과 목록 */}
      {results.length === 0 ? (
        <EmptyState
          type="empty"
          title={query ? noSearchResultTitle : noHistoryTitle}
          subtitle={query ? noSearchResultHint : ''}
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.listPad}
        >
          { }
          {results.map((msg, idx) => (
            <Animated.View key={msg.id} entering={FadeInDown.delay(idx * 30).springify()}>
              <TouchableHighlight
                style={s.msgCard}
                underlayColor={'#1A1A2E'}
                onPress={() => navigateToSession(msg)}
              >
                <>
                  <View style={s.msgTop}>
                    <View style={s.roleBadge}>
                      <MessageSquare size={10} color={msg.role === 'user' ? '#60A5FA' : '#8B5CF6'} />
                      <Text style={[s.roleTxt, msg.role !== 'user' && { color: '#8B5CF6' }]}>
                        {msg.role === 'user' ? roleUserLabel : msg.characterName}
                      </Text>
                    </View>
                    <View style={s.timeBadge}>
                      <Clock size={9} color={'#5A5A70'} />
                      <Text style={s.timeTxt}>
                        {new Date(msg.timestamp).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                  <Highlight text={msg.content} query={query} />
                </>
              </TouchableHighlight>
            </Animated.View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050507' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 54, gap: 12 },
  headerTitle: { fontSize: 20, fontFamily: Typography.fontFamily.extrabold, color: '#F0F0F5' },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#0C0C14' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 14, marginBottom: 10, height: 44,
    backgroundColor: '#0C0C14', borderRadius: Radius.md,
    paddingHorizontal: 12, borderWidth: 1, borderColor: '#1A1A24' },
  searchInput: { flex: 1, fontSize: 14, color: '#F0F0F5', fontFamily: Typography.fontFamily.regular },
  charRow: { paddingHorizontal: 14, gap: 8, paddingBottom: 10 },
  charChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#0E0E18', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#1A1A24' },
  charChipActive: { borderColor: '#D4A853', backgroundColor: 'rgba(212,168,83,0.1)' },
  charChipTxt: { fontSize: 12, color: '#797990', fontFamily: Typography.fontFamily.medium },
  charChipTxtActive: { color: '#D4A853', fontFamily: Typography.fontFamily.semibold },
  charAvatar: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#1A1A2E', alignItems: 'center', justifyContent: 'center' },
  charAvatarTxt: { fontSize: 8, color: '#8B5CF6', fontFamily: Typography.fontFamily.bold },

  resultCount: { fontSize: 11, color: '#5A5A70', fontFamily: Typography.fontFamily.regular, paddingHorizontal: 16, marginBottom: 4 },
  listPad: { paddingHorizontal: 14, paddingBottom: 100 },
  msgCard: {
    backgroundColor: '#0C0C14', borderRadius: Radius.lg,
    borderWidth: 1, borderColor: '#181820',
    padding: 14, marginBottom: 8, gap: 8 },
  msgTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  roleTxt: { fontSize: 11, color: '#60A5FA', fontFamily: Typography.fontFamily.semibold },
  timeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  timeTxt: { fontSize: 10, color: '#5A5A70', fontFamily: Typography.fontFamily.regular } });
