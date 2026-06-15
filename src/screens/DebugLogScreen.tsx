/* eslint-disable @typescript-eslint/no-unused-vars */
// src/screens/DebugLogScreen.tsx

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  RefreshControl,
  TextInput,
  Share,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { readDevLog, clearDevLog, getDevLogPath } from '../utils/DevLogCollector';
import { useLanguageStore } from '../store/languageStore';
import { useShallow } from 'zustand/react/shallow';
import { ArrowLeft, RefreshCcw, FlaskConical } from 'lucide-react-native';

const CAT_COLOR: Record<string, string> = {
  CRASH: '#FF4444',
  RAM: '#FF8C00',
  KV: '#00BFFF',
  APP: '#7CFC00',
  WARN: '#FFD700',
  ERR: '#FF6347',
};

interface LogLine {
  ts: string;
  cat: string;
  body: string;
  raw: string;
}

function parseLine(raw: string): LogLine {
  const m = raw.match(/^(\d{2}:\d{2}:\d{2}\.\d{3}) \[(\w+)\] (.*)$/);
  if (m) return { ts: m[1], cat: m[2], body: m[3], raw };
  return { ts: '', cat: 'LOG', body: raw, raw };
}

const CATS = ['ALL', 'CRASH', 'RAM', 'KV', 'APP', 'WARN', 'ERR'];

export function DebugLogScreen() {
  const { t } = useLanguageStore(useShallow((s: any) => ({ t: s.t })));
  const navigation = useNavigation();
  const scrollRef = useRef<ScrollView>(null);

  const [rawLog, setRawLog] = useState('');
  const [lines, setLines] = useState<LogLine[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [logPath, setLogPath] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const content = await readDevLog();
      setRawLog(content);
      setLogPath(getDevLogPath());
      const parsed = content
        .split('\n')
        .filter((line) => line.trim())
        .map(parseLine);
      setLines(parsed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!autoScroll) return;
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [autoScroll, load]);

  useEffect(() => {
    if (autoScroll && !loading) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
    }
  }, [lines, autoScroll, loading]);

  const visible = lines.filter((line) => {
    const catOk = filter === 'ALL' || line.cat === filter;
    const searchOk = !search || line.body.toLowerCase().includes(search.toLowerCase());
    return catOk && searchOk;
  });

  const share = async () => {
    try {
      await Share.share({ message: rawLog.slice(-10000), title: 'dev_unified.log' });
    } catch {}
  };

  const clear = () => {
    Alert.alert(t?.clearLogs ?? '', t?.clearLogsConfirm ?? '', [
      { text: t?.cancel ?? '', style: 'cancel' },
      {
        text: t?.delete ?? '',
        style: 'destructive',
        onPress: async () => { await clearDevLog(); await load(); },
      },
    ]);
  };

  const counts = lines.reduce<Record<string, number>>((acc, line) => {
    acc[line.cat] = (acc[line.cat] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#111" />

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.btn}>
          <ArrowLeft size={20} color="#00BFFF" />
        </TouchableOpacity>
        <View style={s.titleRow}>
          <FlaskConical size={18} color="#eee" />
          <Text style={s.title}>{t?.debugLogTitle ?? ''}</Text>
        </View>
        <View style={s.headerRight}>
          <TouchableOpacity onPress={share} style={s.btn}>
            <Text style={s.btnTxt}>{t?.share ?? ''}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={clear} style={s.btn}>
            <Text style={[s.btnTxt, s.errorText]}>{t?.reset ?? ''}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={s.path} numberOfLines={1}>{logPath}</Text>

      <TextInput
        style={s.search}
        value={search}
        onChangeText={setSearch}
        placeholder={t?.searchDots ?? ''}
        placeholderTextColor="#555"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow}>
        {CATS.map((cat) => (
          <TouchableOpacity
            key={cat}
            onPress={() => setFilter(cat)}
            style={[s.chip, filter === cat && { backgroundColor: CAT_COLOR[cat] ?? '#444' }]}
          >
            <Text style={[s.chipTxt, filter === cat && s.blackText]}>
              {cat === 'ALL' ? (t?.all ?? 'ALL') : cat}
              {cat !== 'ALL' && counts[cat] ? ' (' + counts[cat] + ')' : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={s.toolbar}>
        <Text style={s.count}>{(t?.logLines ?? '{n}').replace('{n}', String(visible.length))}</Text>
        <TouchableOpacity
          onPress={() => setAutoScroll((value) => !value)}
          style={[s.autoBtn, autoScroll && s.autoBtnOn]}
        >
          <Text style={s.autoBtnTxt}>{autoScroll ? (t?.autoScrollOn ?? '') : (t?.autoScrollOff ?? '')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={load} style={s.btn}>
          <RefreshCcw size={16} color="#00BFFF" />
        </TouchableOpacity>
      </View>

      {loading && lines.length === 0 ? (
        <View style={s.center}>
          <ActivityIndicator color="#00BFFF" />
          <Text style={s.empty}>{t?.loading ?? ''}</Text>
        </View>
      ) : visible.length === 0 ? (
        <View style={s.center}>
          <Text style={s.empty}>{t?.logEmpty ?? ''}</Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={s.logScroll}
          onScrollBeginDrag={() => setAutoScroll(false)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#00BFFF" />}
        >
          {visible.map((line, index) => (
            <View key={index} style={s.logLine}>
              {line.ts ? <Text style={s.ts}>{line.ts}</Text> : null}
              <View style={[s.catBadge, { backgroundColor: (CAT_COLOR[line.cat] ?? '#444') + '33' }]}>
                <Text style={[s.catTxt, { color: CAT_COLOR[line.cat] ?? '#aaa' }]}>{line.cat}</Text>
              </View>
              <Text
                style={[
                  s.body,
                  line.cat === 'CRASH' && s.bodyRed,
                  line.cat === 'RAM' && s.bodyOrange,
                  (line.cat === 'WARN' || line.cat === 'ERR') && s.bodyYellow,
                ]}
              >
                {line.body}
              </Text>
            </View>
          ))}
          <View style={s.h40} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d0d' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#222', gap: 4 },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#eee', fontWeight: '600', fontSize: 16 },
  headerRight: { flexDirection: 'row', gap: 4 },
  btn: { paddingHorizontal: 10, paddingVertical: 6 },
  btnTxt: { color: '#00BFFF', fontSize: 14 },
  path: { color: '#444', fontSize: 10, paddingHorizontal: 12, paddingVertical: 4 },
  search: { margin: 8, marginBottom: 0, backgroundColor: '#1a1a1a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, color: '#eee', fontSize: 13, borderWidth: 1, borderColor: '#333' },
  filterRow: { paddingHorizontal: 8, paddingVertical: 6, flexGrow: 0 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginRight: 6, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333' },
  chipTxt: { color: '#aaa', fontSize: 12 },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 6, gap: 8 },
  count: { color: '#555', fontSize: 12, flex: 1 },
  autoBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333' },
  autoBtnOn: { borderColor: '#00BFFF', backgroundColor: '#00BFFF22' },
  autoBtnTxt: { color: '#aaa', fontSize: 11 },
  logScroll: { flex: 1, paddingHorizontal: 8 },
  logLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#1a1a1a', gap: 4 },
  ts: { color: '#444', fontSize: 10, fontFamily: 'monospace', marginTop: 2 },
  catBadge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  catTxt: { fontSize: 10, fontWeight: '700' },
  body: { color: '#ccc', fontSize: 11, fontFamily: 'monospace', flex: 1, flexShrink: 1 },
  bodyRed: { color: '#FF6666' },
  bodyOrange: { color: '#FFA040' },
  bodyYellow: { color: '#FFD700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  empty: { color: '#555', fontSize: 14 },
  errorText: { color: '#FF4444' },
  blackText: { color: '#000' },
  h40: { height: 40 },
});
