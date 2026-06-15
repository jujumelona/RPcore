/* eslint-disable @typescript-eslint/no-unused-vars */
// src/ui/ModelSelector.tsx — v4
// ✅ 셀룰러 다이얼로그 — t 기반 15개 언어 자동 적용
//    "Wi-Fi가 연결되어 있지 않습니다 / 데이터를 이용해서 다운로드하시겠습니까? (요금이 부과될 수 있습니다)"
// ✅ 임베딩 모델 — WiFi 대기 안내 + 수동 다운로드 버튼
// ✅ Gemma 라이선스 고지

import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Linking } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { CheckCircle, Download, Trash2, Info } from 'lucide-react-native';
import { MODELS, type ModelInfo } from '../models/ModelConfig';
import { useModelStore } from '../store/modelStore';
import { modelDownloader, DownloadProgress } from '../core/llama/ModelDownloader';
import { networkMonitor } from '../utils/NetworkMonitor';
import { Spring, Typography } from '../constants/tokens';
import { PressableOpacity } from '../components/PressableOpacity';
import { useTranslation } from '../hooks/useTranslation';
import { ConfirmModal } from '../components/ConfirmModal';

const GOLD     = '#D4A853';
const GOLD_DIM = 'rgba(212,168,83,0.4)';
const EMBED_ID = 'embeddinggemma-300m';

const TIER_LABEL: Record<string, string> = { pro: 'PRO', lite: 'LITE', mini: 'MINI' };
const TIER_COLOR: Record<string, string> = { pro: GOLD, lite: '#60A5FA', mini: '#797990' };

function ramLabel(mb: number): string {
  if (mb >= 12288) return 'RAM 12GB+';
  if (mb >= 8192)  return 'RAM 8GB+';
  if (mb >= 6144)  return 'RAM 6GB+';
  return 'RAM < 6GB';
}

// ── 셀룰러 확인 다이얼로그 상태 타입 ───────────────────────────
interface CellularConfirmState {
  visible:   boolean;
  title:     string;
  message:   string;
  cancelTxt: string;
  okTxt:     string;
  onConfirm: () => void;
}
const CONFIRM_HIDDEN: CellularConfirmState = {
  visible: false, title: '', message: '', cancelTxt: '', okTxt: '', onConfirm: () => {} };

// 애니메이션 진행 바
function AnimatedProgressBar({ pct, color }: { pct: number; color: string }) {
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withTiming(pct >= 0 ? pct : 50, { duration: 300 });
  }, [pct, width]);
  const barStyle = useAnimatedStyle(() => ({
    width: `${width.value}%` as `${number}%`,
    opacity: pct >= 0 ? 1 : 0.4 }));
  return (
    <View style={s.progressTrack}>
      <Animated.View style={[s.progressFill, { backgroundColor: color }, barStyle]} />
    </View>
  );
}

// 모델 카드
function ModelCard({ model, prog, onDownload, onDelete, t }: {
  model: typeof MODELS[0];
  prog?: DownloadProgress;
  onDownload: () => void;
  onDelete: () => void;
  t: Record<string, string>;
}) {
  const status        = prog?.status ?? 'idle';
  const pct           = prog?.progress ?? 0;
  const isDownloaded  = status === 'completed';
  const isDownloading = status === 'downloading';
  const hasError      = status === 'error';
  const modelTier = ((model as ModelInfo & { tier?: keyof typeof TIER_COLOR }).tier ?? 'mid') as keyof typeof TIER_COLOR;
  const tierColor = TIER_COLOR[modelTier] ?? '#8A8A9E';

  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));

  const modelName = t[model.nameKey];
  const modelDesc = t[model.descKey];

  return (
    <Animated.View style={[s.card, isDownloaded && { borderColor: GOLD_DIM }]}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={[s.tierBadge, { borderColor: tierColor + '55' }]}>
            <Text style={[s.tierText, { color: tierColor }]}>{TIER_LABEL[modelTier]}</Text>
          </View>
          <Text style={s.modelName}>{modelName}</Text>
        </View>
        {isDownloaded && (
          <View style={s.downloadedBadge}>
            <CheckCircle size={12} color={GOLD} style={sx._mr3} />
            <Text style={s.downloadedText}>{t.installed}</Text>
          </View>
        )}
      </View>

      <Text style={s.desc}>{modelDesc}</Text>

      <View style={s.specRow}>
        <Text style={s.specLabel}>{ramLabel(model.minRAM)}</Text>
        <Text style={s.specDot}>·</Text>
        <Text style={s.specLabel}>{model.sizeMB >= 1000
          ? `${(model.sizeMB / 1000).toFixed(1)}GB`
          : `${model.sizeMB}MB`}</Text>
      </View>

      {isDownloading && (
        <View style={s.progressWrap}>
          <AnimatedProgressBar pct={pct} color={tierColor} />
          <Text style={s.progressPct}>{pct >= 0 ? `${pct}%` : '...'}</Text>
        </View>
      )}

      {hasError && (
        <View style={s.errorView}>
          <Text style={s.errorText}>{t.downloadError}</Text>
        </View>
      )}

      {!isDownloading && (
        <Animated.View style={[s.btnRow, btnStyle]}>
          {isDownloaded ? (
            <PressableOpacity
              style={s.btnDelete}
              onPress={onDelete}
              onPressIn={() => { btnScale.value = withSpring(0.96, Spring.press); }}
              onPressOut={() => { btnScale.value = withSpring(1, Spring.enter); }}
              activeOpacity={1}
            >
              <View style={styles.row}>
                <Trash2 size={14} color="#6B2020" />
                <Text style={s.btnDeleteText}>{t.delete}</Text>
              </View>
            </PressableOpacity>
          ) : (
            <PressableOpacity
              style={[s.btnDownload, { borderColor: tierColor + '44' }]}
              onPress={onDownload}
              onPressIn={() => { btnScale.value = withSpring(0.96, Spring.press); }}
              onPressOut={() => { btnScale.value = withSpring(1, Spring.enter); }}
              activeOpacity={1}
            >
              <Download size={14} color={tierColor} style={sx._mr4} />
              <Text style={[s.btnDownloadText, { color: tierColor }]}>{t.downloadModel}</Text>
            </PressableOpacity>
          )}
        </Animated.View>
      )}
    </Animated.View>
  );
}

// 임베딩 모델 카드
function EmbeddingModelCard({
  prog,
  onManualDownload,
  t }: {
  prog?: DownloadProgress;
  onManualDownload: () => void;
  t: Record<string, string>;
}) {
  const status        = prog?.status ?? 'idle';
  const pct           = prog?.progress ?? 0;
  const isDownloaded  = status === 'completed';
  const isDownloading = status === 'downloading';
  const hasError      = status === 'error';
  const isCellular    = networkMonitor.getStatus().isCellular;

  // WiFi이고 아직 시작 안 한 상태는 숨김 (자동으로 처리됨)
  if (status === 'idle' && !isCellular) return null;

  return (
    <View style={s.embedCard}>
      <View style={s.embedHeader}>
        <View style={s.embedInfo}>
          <Text style={s.embedTitle}>{t.embedModelName}</Text>
          <Text style={s.embedSubtitle}>{t.embedModelDesc}</Text>
        </View>
        {isDownloaded && <CheckCircle size={14} color={'#4ADE80'} />}
      </View>

      {/* 셀룰러 → 수동 설치 안내 */}
      {status === 'idle' && isCellular && (
        <View style={s.embedWifiSection}>
          <Text style={s.embedWifiText}>
            {t.embedWifiWait}
          </Text>
          <PressableOpacity
            style={s.embedDownloadBtn}
            onPress={onManualDownload}
            activeOpacity={0.8}
          >
            <Download size={12} color={'#8B5CF6'} style={sx._mr3} />
            <Text style={s.embedDownloadBtnText}>
              {t.embedInstallNow}
            </Text>
          </PressableOpacity>
        </View>
      )}

      {isDownloading && (
        <View style={s.embedProgressWrap}>
          <AnimatedProgressBar pct={pct} color={'#8B5CF6'} />
          <Text style={s.embedProgressPct}>{pct >= 0 ? `${pct}%` : '...'}</Text>
        </View>
      )}

      {hasError && (
        <Text style={s.errorText}>
          {t.embedInstallError}
        </Text>
      )}

      {isDownloaded && (
        <Text style={s.embedDoneText}>
          ✓ {t.embedInstalled}
        </Text>
      )}
    </View>
  );
}

// ── ModelSelector ────────────────────────────────────────────────

export function ModelSelector({ onModelChange }: { onModelChange?: () => void } = {}) {
  const [progressMap, setProgressMap] = useState<Record<string, DownloadProgress>>({});
  const [embedProg, setEmbedProg]     = useState<DownloadProgress | undefined>();
  const [cellularConfirm, setCellularConfirm] = useState<CellularConfirmState>(CONFIRM_HIDDEN);
  const refreshModels = useModelStore(s => s.refresh);
  const t = useTranslation() as unknown as Record<string, string>;

  const handleModelChange = useCallback(() => {
    onModelChange?.();
  }, [onModelChange]);

  const initModels = useCallback(() => {
    const listener = (p: DownloadProgress) => {
      if (p.modelId === EMBED_ID) {
        setEmbedProg(p);
        return;
      }
      setProgressMap(prev => ({ ...prev, [p.modelId]: p }));
      if (p.status === 'completed') { refreshModels(); handleModelChange(); }
    };
    modelDownloader.addListener(listener);

    let anyDownloaded = false;
    Promise.all(
      MODELS.map(async m => {
        const done = await modelDownloader.isModelDownloaded(m.id);
        setProgressMap(prev => ({
          ...prev,
          [m.id]: done
            ? { modelId: m.id, progress: 100, status: 'completed' }
            : { modelId: m.id, progress: 0,   status: 'idle' } }));
        if (done) anyDownloaded = true;
      })
    ).then(() => { if (anyDownloaded) refreshModels(); });

    modelDownloader.isEmbeddingModelDownloaded?.().then(done => {
      if (done) setEmbedProg({ modelId: EMBED_ID, progress: 100, status: 'completed' });
    }).catch(() => {});

    return () => modelDownloader.removeListener(listener);
  }, [refreshModels, handleModelChange]);

  useEffect(() => {
    return initModels();
  }, [initModels]);

  // 셀룰러 여부 확인 후 ConfirmModal 띄우는 헬퍼
  const askCellular = useCallback((fileSizeMB: number, onConfirm: () => void) => {
    const status = networkMonitor.getStatus();
    if (!status.isCellular) { onConfirm(); return; }
    setCellularConfirm({
      visible:   true,
      title:     t.cellularAlertTitle,
      message:   t.cellularAlertMessage,
      cancelTxt: t.cellularAlertCancel,
      okTxt:     t.cellularAlertConfirm,
      onConfirm });
  }, [t]);

  // 기본 모델 다운로드 — 셀룰러면 표준 다이얼로그
  const handleDownload = useCallback((modelId: string) => {
    const model = MODELS.find(m => m.id === modelId);
    const sizeMB = model?.sizeMB ?? 2500;
    askCellular(sizeMB, async () => {
      const alreadyDownloaded = await modelDownloader.isModelDownloaded(modelId).catch(() => false);
      if (alreadyDownloaded) {
        setProgressMap(prev => ({ ...prev, [modelId]: { modelId, progress: 100, status: 'completed' } }));
        refreshModels();
        handleModelChange();
        return;
      }
      setProgressMap(prev => ({ ...prev, [modelId]: { modelId, progress: 0, status: 'downloading' } }));
      try {
        await modelDownloader.downloadModel(modelId);
      } catch (thrown) {
        const errMsg = thrown instanceof Error ? thrown.message : String(thrown);
        setProgressMap(prev => ({ ...prev, [modelId]: { modelId, progress: 0, status: 'error', error: errMsg } }));
      }
    });
  }, [askCellular, handleModelChange, refreshModels]);
  const handleEmbedManualDownload = useCallback(() => {
    askCellular(180, async () => {
      setEmbedProg({ modelId: EMBED_ID, progress: 0, status: 'downloading' });
      try {
        await modelDownloader.downloadEmbeddingModel();
      } catch {
        setEmbedProg({ modelId: EMBED_ID, progress: 0, status: 'error' });
      }
    });
  }, [askCellular]);

  const handleDelete = useCallback(async (modelId: string) => {
    await modelDownloader.deleteModel(modelId);
    setProgressMap(prev => ({ ...prev, [modelId]: { modelId, progress: 0, status: 'idle' } }));
    refreshModels();
    onModelChange?.();
  }, [refreshModels, onModelChange]);

  return (
    <>
      <ScrollView style={s.scroll} contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
        {MODELS.map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            prog={progressMap[model.id]}
            onDownload={() => handleDownload(model.id)}
            onDelete={() => handleDelete(model.id)}
            t={t}
          />
        ))}

        <EmbeddingModelCard
          prog={embedProg}
          onManualDownload={handleEmbedManualDownload}
          t={t}
        />

        {/* Gemma 라이선스 고지 */}
        <PressableOpacity
          style={s.licenseNotice}
          onPress={() => Linking.openURL('https://ai.google.dev/gemma/terms').catch(() => {})}
          activeOpacity={0.7}
        >
          <Info size={12} color={'#797990'} />
          <Text style={s.licenseText}>
            {t.gemmaLicenseNotice}{' '}
            <Text style={s.licenseLink}>Google Gemma Terms of Use</Text>.
          </Text>
        </PressableOpacity>
      </ScrollView>

      {/* 셀룰러 다운로드 확인 모달 — ConfirmModal (프로젝트 기본 다이얼로그) */}
      <ConfirmModal
        visible={cellularConfirm.visible}
        icon="information-circle-outline"
        iconColor="#60A5FA"
        title={cellularConfirm.title}
        message={cellularConfirm.message}
        onRequestClose={() => setCellularConfirm(CONFIRM_HIDDEN)}
        actions={[
          {
            label: cellularConfirm.cancelTxt,
            variant: 'default',
            onPress: () => setCellularConfirm(CONFIRM_HIDDEN) },
          {
            label: cellularConfirm.okTxt,
            variant: 'primary',
            onPress: () => {
              const fn = cellularConfirm.onConfirm;
              setCellularConfirm(CONFIRM_HIDDEN);
              fn();
            } },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

const s = StyleSheet.create({
  scroll:    { width: '100%' },
  container: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 10 },

  card:       { backgroundColor: '#050507', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#0E0E14' },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tierBadge:  { borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  tierText:   { fontSize: 9, fontFamily: Typography.fontFamily.bold, letterSpacing: 1.5 },
  modelName:  { fontSize: 15, fontFamily: Typography.fontFamily.semibold, color: '#F0F0F5', letterSpacing: 0.2 },
  downloadedBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(212,168,83,0.08)', borderRadius: 5,
    paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(212,168,83,0.2)' },
  downloadedText: { fontSize: 10, color: GOLD, fontFamily: Typography.fontFamily.semibold, letterSpacing: 0.5 },
  desc:       { fontSize: 12, color: '#797990', lineHeight: 18, marginBottom: 10 },
  specRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  specLabel:  { fontSize: 11, color: '#2C2C38' },
  specDot:    { fontSize: 11, color: '#25252F' },
  progressWrap:  { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressTrack: { flex: 1, height: 2, backgroundColor: '#08080C', borderRadius: 1, overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: 1 },
  progressPct:   { color: '#757585', fontSize: 11, width: 30, textAlign: 'right' },
  errorText:     { marginTop: 8, color: '#FF5555', fontSize: 12, lineHeight: 18 },
  errorView:     { gap: 6 },
  btnRow:        { marginTop: 14, flexDirection: 'row' },
  btnDownload: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', borderRadius: 10, paddingVertical: 13, borderWidth: 1 },
  btnDownloadText: { fontFamily: Typography.fontFamily.semibold, fontSize: 13, letterSpacing: 0.3 },
  btnDelete: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', borderRadius: 10, paddingVertical: 13,
    borderWidth: 1, borderColor: '#050507' },
  btnDeleteText: { color: '#FF5555', fontFamily: Typography.fontFamily.medium, fontSize: 13 },

  // 임베딩 카드
  embedCard: {
    backgroundColor: 'rgba(139,92,246,0.05)',
    borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
    padding: 14, gap: 8 },
  embedHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  embedInfo:       { flex: 1 },
  embedTitle:      { fontSize: 13, color: '#C8C8D4', fontFamily: Typography.fontFamily.semibold },
  embedSubtitle:   { fontSize: 10, color: '#797990', marginTop: 2 },
  embedWifiSection:{ gap: 8 },
  embedWifiText:   { fontSize: 11, color: '#5A5A70', lineHeight: 17 },
  embedDownloadBtn: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 8, borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.35)',
    backgroundColor: 'rgba(139,92,246,0.08)' },
  embedDownloadBtnText: { fontSize: 11, color: '#8B5CF6', fontFamily: Typography.fontFamily.semibold },
  embedProgressWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  embedProgressPct:  { color: '#8B5CF6', fontSize: 11, width: 40, textAlign: 'right' },
  embedDoneText:     { fontSize: 11, color: '#4ADE80' },

  // 라이선스
  licenseNotice: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 7, paddingVertical: 12, paddingHorizontal: 4 },
  licenseText: { flex: 1, fontSize: 10, color: '#5A5A70', lineHeight: 16 },
  licenseLink: { color: '#8B5CF6', textDecorationLine: 'underline' } });

const sx = StyleSheet.create({
  _mr3: { marginRight: 3 },
  _mr4: { marginRight: 4 } });
