// src/components/modals/EditModal.tsx
// ChatScreen에서 분리된 메시지 편집 모달 — BottomSheet 기반

import { Typography } from '../../constants/tokens';
import React, { useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableOpacity } from '../PressableOpacity';
import { useLanguageStore } from '../../store/languageStore';

interface EditModalProps {
  visible: boolean;
  text: string;
  onChangeText: (t: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function EditModal({
  visible, text, onChangeText, onCancel, onConfirm }: EditModalProps) {
  const t = useLanguageStore(s => s.t);
  const sheetRef = useRef<BottomSheet>(null);
  const { bottom } = useSafeAreaInsets();

  useEffect(() => {
    if (visible) sheetRef.current?.expand();
    else sheetRef.current?.close();
  }, [visible]);

  const renderBackdrop = useCallback((props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.6} onPress={onCancel} />
  ), [onCancel]);

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={['55%']}
      enablePanDownToClose
      onClose={onCancel}
      backdropComponent={renderBackdrop}
      backgroundStyle={s.sheet}
      handleIndicatorStyle={s.handle}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      bottomInset={bottom}
    >
      <View style={s.container}>
        <Text style={s.title}>{t.editMessage}</Text>
        <Text style={s.desc}>{t.editMessageDesc}</Text>
        <BottomSheetTextInput
          style={s.input}
          value={text}
          onChangeText={onChangeText}
          multiline
          maxLength={500}
          autoFocus
          placeholderTextColor={'#797990'}
        />
        <View style={s.btnRow}>
          <PressableOpacity style={s.cancelBtn} onPress={onCancel}>
            <Text style={s.cancelTxt}>{t.cancel}</Text>
          </PressableOpacity>
          <PressableOpacity
            style={[s.confirmBtn, !text.trim() && s.confirmBtnDis]}
            onPress={onConfirm}
            disabled={!text.trim()}
          >
            <Text style={s.confirmTxt}>{t.confirm}</Text>
          </PressableOpacity>
        </View>
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  sheet:      { backgroundColor: '#050507' },
  handle:     { backgroundColor: '#757585' },
  container:  { flex: 1, paddingHorizontal: 20, paddingTop: 8 },
  title:      { fontSize: 17, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5', marginBottom: 6 },
  desc:       { fontSize: 13, color: '#8A8A9E', marginBottom: 14 },
  input:      { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: 12, color: '#F0F0F5', fontSize: 15, minHeight: 100, textAlignVertical: 'top', marginBottom: 16 },
  btnRow:     { flexDirection: 'row', gap: 10 },
  cancelBtn:  { flex: 1, padding: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center' },
  cancelTxt:  { color: '#aaa', fontSize: 15 },
  confirmBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#8B5CF6', alignItems: 'center' },
  confirmBtnDis: { opacity: 0.4 },
  confirmTxt: { color: '#F0F0F5', fontSize: 15, fontFamily: Typography.fontFamily.semibold } });
