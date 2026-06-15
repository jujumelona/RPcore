/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * src/screens/story-editor/components/TranslationPasteModal.tsx
 * StoryEditorScreen.tsx의 번역 붙여넣기 모달 컴포넌트
 */


import { useEffect, useState, memo, useCallback } from 'react';
import { ScrollView, Text, View, Modal, BackHandler, StatusBar } from 'react-native';
import { useLanguageStore } from '../../../store/languageStore';
import { ToastService } from '../../../components/Toast';
import { clipboardSetString } from '../../../utils/ClipboardUtils';
import { LANGUAGE_LIST, Language } from '../../../i18n/languages';
import { PressableOpacity } from '../../../components/PressableOpacity';
import { getScreenTranslations } from '../../../i18n/SCREENS-TRANSLATION';
import { getStoryEditorTranslateCopy } from '../../../i18n/storyEditorTranslateCopy';
import { StyleSheet } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';

// ✅ [PERF] 언어 칩 컴포넌트 분리 - memo로 불필요한 리렌더링 방지
const LangChip = memo(({ code, nativeName, selected, onToggle }: {
  code: string;
  nativeName: string;
  selected: boolean;
  onToggle: (code: string) => void;
}) => (
  <PressableOpacity
    onPress={() => onToggle(code)}
    style={[
      styles.tLangChip,
      {
        borderColor: selected ? 'rgba(212,168,83,0.30)' : '#2C2C38',
        backgroundColor: selected ? 'rgba(212,168,83,0.07)' : '#0E0E14'
      }
    ]}
  >
    <Text style={[styles.tLangItemText, { color: selected ? '#D4A853' : '#797990' }]}>
      {nativeName}
    </Text>
  </PressableOpacity>
));

// 번역 모달 (1단계만 — 언어 체크 + 프롬프트 복사 + 붙여넣기 + 확인)
// ══════════════════════════════════════════════════════════════
export function TranslationPasteModal({
  visible, onClose, buildPromptFn, parseFn, onConfirm, title, doneCount }: {
  visible: boolean;
  onClose: () => void;
  buildPromptFn: (langs: Language[]) => string;
  parseFn: (text: string) => Record<string, any>;
  onConfirm: (text: string) => void;
  title?: string;
  doneCount?: number;
}) {
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set(LANGUAGE_LIST.map(l => l.code)));
  const [pasteText, setPasteText] = useState('');
  const [recognized, setRecognized] = useState(0);
  const currentLanguage = useLanguageStore(s => s.currentLanguage);
  const t = useLanguageStore(s => s.t as Record<string, string | undefined>);
  const st = getScreenTranslations(currentLanguage);
  const copy = getStoryEditorTranslateCopy(currentLanguage);

  // 안드로이드 뒤로가기 키
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  // ✅ [PERF] toggleLang을 useCallback으로 감싸서 LangChip 리렌더링 최소화
  const toggleLang = useCallback((code: string) => {
    setSelectedCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) { next.delete(code); } else { next.add(code); }
      return next;
    });
  }, []);

  const selectedLangs = LANGUAGE_LIST.filter(l => selectedCodes.has(l.code));
  const prompt = buildPromptFn(selectedLangs);

  const handleCopyPrompt = () => {
    if (selectedLangs.length === 0) { ToastService.info(copy.selectAtLeastOneLanguage); return; }
    if (!clipboardSetString(prompt)) { ToastService.info(copy.clipboardUnavailable); return; }
    ToastService.success(copy.copiedTranslationPrompt.replace('{count}', String(selectedLangs.length)));
  };

  const handleClipboardPaste = async () => {
    try {
      const { clipboardGetString } = await import('../../../utils/ClipboardUtils');
      const clipText = await clipboardGetString();
      if (!clipText?.trim()) { ToastService.info(copy.clipboardEmpty); return; }
      setPasteText(clipText);
      // 붙여넣기 후 인식 개수 계산 - 비동기로 처리해서 UI 블로킹 방지 (setTimeout으로 UI 업데이트 우선)
      setTimeout(() => {
        try {
          const count = Object.keys(parseFn(clipText)).length;
          setRecognized(count);
        } catch {
          setRecognized(0);
        }
      }, 100);
    } catch { ToastService.info(copy.pasteFailed); }
  };

  const handleConfirm = () => {
    if (!pasteText.trim()) { ToastService.info(copy.translationResultRequired); return; }
    onConfirm(pasteText);
    setPasteText('');
    setRecognized(0);
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
        <StatusBar barStyle="light-content" backgroundColor="#050507" />
        <View style={[styles.tContainer, { backgroundColor: '#050507' }]}>
          {/* 헤더 */}
          <View style={[styles.tHeaderRow, { borderBottomColor: '#181820' }]}>
            <PressableOpacity 
              onPress={onClose} 
              style={styles._marginRight}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <ArrowLeft size={24} color="#8A8A9E" />
            </PressableOpacity>
            <Text style={[styles.tHeaderTitle, { color: '#F0F0F5' }]}>{title ?? copy.multiLanguageTranslation}</Text>
            {(doneCount ?? 0) > 0 && (
              <View style={[styles.tDoneBadge, { backgroundColor: 'rgba(212,168,83,0.14)', borderColor: 'rgba(212,168,83,0.30)' }]}>
                <Text style={[styles.tDoneBadgeText, { color: '#D4A853' }]}>{copy.doneCount.replace('{count}', String(doneCount))}</Text>
              </View>
            )}
          </View>

          <ScrollView contentContainerStyle={styles.scrollContentPad}>
            {/* 언어 선택 */}
            <View style={[styles.tLangCard, { backgroundColor: '#08080C', borderColor: '#181820' }]}>
              <View style={styles.tLangHeaderRow}>
                <Text style={[styles.tLangTitle, { color: '#8A8A9E' }]}>{st.selectLangForTranslation} ({selectedLangs.length}/{LANGUAGE_LIST.length})</Text>
                <View style={styles._flexDirection}>
                  <PressableOpacity onPress={() => setSelectedCodes(new Set(LANGUAGE_LIST.map(l => l.code)))}>
                    <Text style={[styles.tLangSelectText, { color: '#D4A853' }]}>{st.selectAll}</Text>
                  </PressableOpacity>
                  <PressableOpacity onPress={() => setSelectedCodes(new Set())}>
                    <Text style={[styles.tLangDeselectText, { color: '#8A8A9E' }]}>{st.deselectAll}</Text>
                  </PressableOpacity>
                </View>
              </View>
              <View style={styles._flexDirection1}>
                {LANGUAGE_LIST.map(l => (
                  <LangChip
                    key={l.code}
                    code={l.code}
                    nativeName={l.nativeName}
                    selected={selectedCodes.has(l.code)}
                    onToggle={toggleLang}
                  />
                ))}
              </View>
            </View>

            {/* 프롬프트 복사 버튼 */}
            <PressableOpacity
              style={[styles.tCopyBtn, selectedLangs.length === 0 && styles.tBtnDisabled]}
              onPress={handleCopyPrompt}
              activeOpacity={0.7}
            >
              <Text style={[styles.tPromptBtnText, { color: '#C8C8D4' }]}>{st.copyPromptBtn}{selectedLangs.length > 0 ? ` (${selectedLangs.length})` : ''}
              </Text>
            </PressableOpacity>

            {/* Gemini 안내 + 사용 가이드 */}
            <View style={[styles.tGuideCard, { backgroundColor: '#050507', borderColor: 'rgba(212,168,83,0.14)' }]}>
              <Text style={[styles.tDoneBadgeText, { color: '#D4A853' }]}>{copy.geminiGuideTitle}</Text>
              <Text style={[styles.tGuideBody, { color: '#797990' }]}>{copy.geminiGuideBody}</Text>
            </View>

            {/* ✅ 클립보드 붙여넣기 버튼 */}
            <PressableOpacity
              style={[styles.tPasteBtn, { backgroundColor: '#0E0E14', borderColor: 'rgba(139,92,246,0.5)' }]}
              onPress={handleClipboardPaste}
              activeOpacity={0.7}
            >
              <Text style={[styles.tPasteBtnText, { color: '#C084FC' }]}>{(copy as any).pasteFromClipboard}</Text>
            </PressableOpacity>

            {/* ✅ 직접 입력 또는 미리보기 */}
            {pasteText ? (
              <>
                <View style={[styles.tGuideCard, { backgroundColor: '#08080C', borderColor: '#181820', marginTop: 12 }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={[styles.tDoneBadgeText, { color: '#8A8A9E' }]}>{st.previewBtn}</Text>
                    {recognized > 0 && (
                      <View style={[styles.tDoneBadge, { backgroundColor: 'rgba(139,92,246,0.15)', borderColor: 'rgba(139,92,246,0.3)' }]}>
                        <Text style={[styles.tDoneBadgeText, { color: '#C084FC' }]}>{copy.applyRecognizedCount.replace('{count}', String(recognized))}</Text>
                      </View>
                    )}
                  </View>
                  <ScrollView style={{ maxHeight: 200, backgroundColor: '#050507', borderRadius: 8, padding: 8 }} nestedScrollEnabled>
                    <Text style={{ color: '#C8C8D4', fontSize: 11, fontFamily: 'monospace' }}>
                      {pasteText.length > 3000 ? pasteText.substring(0, 3000) + '\\n... [미리보기 생략됨 - 원본 데이터는 정상 처리됩니다.]' : pasteText}
                    </Text>
                  </ScrollView>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <PressableOpacity
                    style={[styles.tCopyBtn, { flex: 1, backgroundColor: '#0E0E14' }]}
                    onPress={() => { setPasteText(''); setRecognized(0); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.tPromptBtnText, { color: '#8A8A9E' }]}>{t.clearText}</Text>
                  </PressableOpacity>
                  <PressableOpacity
                    style={[styles.tPasteBtn, { flex: 2, backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' }]}
                    onPress={handleConfirm}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.tPasteBtnText, { color: '#FFFFFF' }]}>
                      {recognized > 0 ? `${t.confirm} (${recognized})` : t.confirm}
                    </Text>
                  </PressableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={[styles.tGuideFooter, { color: '#757585', marginTop: 12 }]}>
                  {copy.pastePromptHint}
                </Text>
                <View style={[styles.tGuideCard, { backgroundColor: '#08080C', borderColor: '#181820', padding: 0, overflow: 'hidden' }]}>
                  <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#181820' }}>
                    <Text style={{ color: '#797990', fontSize: 11 }}>{t.pasteContentLabel}</Text>
                  </View>
                  <View style={{ padding: 12 }}>
                    <Text style={{ color: '#C8C8D4', fontSize: 12, fontFamily: 'monospace', minHeight: 150 }}
                      onPress={() => {/* TextInput will handle this */}}
                    >
                      {/* Placeholder-like text */}
                    </Text>
                  </View>
                </View>
                <PressableOpacity
                  style={[styles.tPasteBtn, { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6', opacity: 0.4 }]}
                  disabled
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tPasteBtnText, { color: '#FFFFFF' }]}>{t.confirm}</Text>
                </PressableOpacity>
              </>
            )}

            <View style={styles._height} />
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  tContainer: { flex: 1 },
  tHeaderRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  _marginRight: { marginRight: 12 },
  tBackText: { fontSize: 24, fontWeight: '500' },
  tHeaderTitle: { fontSize: 18, fontWeight: '700', flex: 1 },
  tDoneBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  tDoneBadgeText: { fontSize: 12, fontWeight: '600' },
  scrollContentPad: { padding: 16 },
  tLangCard: { borderRadius: 12, padding: 16, borderWidth: 1, marginBottom: 16 },
  tLangHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  tLangTitle: { fontSize: 14, fontWeight: '500' },
  _flexDirection: { flexDirection: 'row', gap: 12 },
  tLangSelectText: { fontSize: 13, fontWeight: '600' },
  tLangDeselectText: { fontSize: 13, fontWeight: '600' },
  _flexDirection1: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tLangChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  tLangItemText: { fontSize: 13, fontWeight: '600' },
  tCopyBtn: { padding: 16, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A1A24', borderColor: '#2C2C38', marginBottom: 16 },
  tBtnDisabled: { opacity: 0.5 },
  tPromptBtnText: { fontSize: 15, fontWeight: '600' },
  tGuideCard: { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  tGuideBody: { fontSize: 13, lineHeight: 20, marginTop: 8 },
  tPasteBtn: { padding: 16, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  tPasteBtnText: { fontSize: 15, fontWeight: '600' },
  tGuideFooter: { fontSize: 13, textAlign: 'center', marginBottom: 8 },
  _height: { height: 40 }
});
