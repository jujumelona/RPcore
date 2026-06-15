/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * src/screens/story-editor/components/TranslationPastePage.tsx
 * StoryEditorScreen.tsx의 번역 붙여넣기 페이지 컴포넌트
 */


import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View, Modal, TextInput, KeyboardAvoidingView, BackHandler, StyleSheet } from 'react-native';
import { useLanguageStore } from '../../../store/languageStore';
import { ToastService } from '../../../components/Toast';
import { clipboardGetString } from '../../../utils/ClipboardUtils';
import { PressableOpacity } from '../../../components/PressableOpacity';
import { getScreenTranslations } from '../../../i18n/SCREENS-TRANSLATION';
import { getStoryEditorTranslateCopy } from '../../../i18n/storyEditorTranslateCopy';
import { ArrowLeft } from 'lucide-react-native';

export function TranslationPastePage({
  visible, onClose, onConfirm, parseFn }: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (text: string) => void;
  parseFn: (text: string) => Record<string, any>;
}) {
  const [text, setText] = useState('');
  const currentLanguage = useLanguageStore(s => s.currentLanguage);
  const t = useLanguageStore(s => s.t);
  const st = getScreenTranslations(currentLanguage);
  const copy = getStoryEditorTranslateCopy(currentLanguage);
  
  // ✅ [PERF] recognized 계산은 유지하되 확인 버튼 활성화와 무관하게 처리
  const [recognized, setRecognized] = useState(0);
  
  useEffect(() => {
    if (!text.trim()) {
      setRecognized(0);
      return;
    }
    
    // 디바운스로 파싱 - UI 블록 방지
    const timer = setTimeout(() => {
      try {
        const result = parseFn(text);
        setRecognized(Object.keys(result).length);
      } catch {
        setRecognized(0);
      }
    }, 300); // 300ms 디바운스
    
    return () => clearTimeout(timer);
  }, [text, parseFn]);

  // 안드로이드 뒤로가기 키
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [visible, onClose]);

  const handleClipboardPaste = async () => {
    try {
      const clipText = await clipboardGetString();
      if (!clipText?.trim()) { ToastService.info(copy.clipboardEmpty); return; }
      setText(clipText);
    } catch { ToastService.info(copy.pasteFailed); }
  };

  const handleConfirm = () => {
    if (!text.trim()) { ToastService.info(copy.translationResultRequired); return; }
    // ✅ [PERF] 검증 제거 - 바로 확인, 파싱은 onConfirm에서 처리
    onConfirm(text);
    setText('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.tContainer, { backgroundColor: '#050507' }]}>
        {/* ── 헤더 ── */}
        <View style={[styles.tHeaderRow, { borderBottomColor: '#181820' }]}>
          <PressableOpacity onPress={onClose} style={styles._marginRight}>
            <ArrowLeft size={24} color="#8A8A9E" />
          </PressableOpacity>
          <Text style={[styles.tHeaderTitle, { color: '#F0F0F5' }]}>{st.pasteTranslationResult}</Text>
          {recognized > 0 && (
            <View style={[styles.tDoneBadge, { backgroundColor: 'rgba(212,168,83,0.14)', borderColor: 'rgba(212,168,83,0.30)' }]}>
              <Text style={[styles.tDoneBadgeText, { color: '#D4A853' }]}>{copy.doneCount.replace('{count}', String(recognized))}</Text>
            </View>
          )}
        </View>

        {/* ── 버튼 영역 (ScrollView 밖 — 항상 고정) ── */}
        <View style={[styles.tActionRow, { borderBottomColor: '#0E0E14' }]}>
          {/* 클립보드 붙여넣기 버튼 */}
          <PressableOpacity
            style={[styles.tPrimaryBtn, { backgroundColor: 'rgba(212,168,83,0.07)', borderColor: 'rgba(212,168,83,0.30)' }]}
            onPress={handleClipboardPaste}
            activeOpacity={0.7}
          >
            <Text style={[styles.tPrimaryBtnText, { color: '#D4A853' }]}>{st.pasteFromClipboard}</Text>
          </PressableOpacity>

          {/* 확인 버튼 */}
          <PressableOpacity
            style={[styles.tApplyBtn, !text.trim() && styles.tBtnDisabled]}
            onPress={handleConfirm}
            activeOpacity={0.7}
          >
            <Text style={[styles.tPrimaryBtnText, { color: '#D4A853' }]}>
              {recognized > 0 ? copy.applyRecognizedCount.replace('{count}', String(recognized)) : (t?.confirm ?? 'Confirm')}
            </Text>
          </PressableOpacity>
        </View>

        {/* ── 텍스트 미리보기 (ScrollView 안) ── */}
        <KeyboardAvoidingView behavior={'height'} style={styles._flex}>
      <ScrollView style={styles._flex} keyboardShouldPersistTaps="handled">
          <View style={[styles.tEditorCard, styles.tEditorCardBg]}>
            <View style={[styles.tEditorHeader, { borderBottomColor: '#181820' }]}>
              <Text style={[styles.tEditorLabel, { color: '#797990' }]}>{st.editableContent}</Text>
              {text.trim() && (
                <PressableOpacity onPress={() => setText('')}>
                  <Text style={[styles.tEditorClearText, { color: '#797990' }]}>{st.clearBtn}</Text>
                </PressableOpacity>
              )}
            </View>
            <TextInput
              style={[styles.tEditorInput, { color: '#C8C8D4' }]}
              value={text}
              onChangeText={setText}
              multiline
              placeholder={st.aiPastePlaceholder}
              placeholderTextColor={'#2C2C38'}
            />
          </View>
          <View style={styles._height} />
        </ScrollView>
      </KeyboardAvoidingView>

      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  tContainer: { flex: 1 },
  tHeaderRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  _marginRight: { marginRight: 12 },
  tHeaderTitle: { fontSize: 18, fontWeight: '700', flex: 1 },
  tDoneBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  tDoneBadgeText: { fontSize: 12, fontWeight: '600' },
  tActionRow: { flexDirection: 'row', gap: 12, padding: 16, borderBottomWidth: 1 },
  tPrimaryBtn: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tPrimaryBtnText: { fontSize: 15, fontWeight: '600' },
  tApplyBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#D4A853', alignItems: 'center', justifyContent: 'center' },
  tBtnDisabled: { opacity: 0.5 },
  _flex: { flex: 1 },
  tEditorCard: { margin: 16, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  tEditorCardBg: { backgroundColor: '#0C0C14', borderColor: '#1A1A24' },
  tEditorHeader: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tEditorLabel: { fontSize: 12, fontWeight: '600' },
  tEditorClearText: { fontSize: 12, fontWeight: '500' },
  tEditorInput: { padding: 16, fontSize: 14, lineHeight: 22, textAlignVertical: 'top', minHeight: 400 },
  _height: { height: 40 }
});
