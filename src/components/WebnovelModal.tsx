import { useCallback, useEffect, useRef } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot from 'react-native-view-shot';

import { clipboardSetString } from '../utils/ClipboardUtils';
import { PressableOpacity } from './PressableOpacity';
import { Radius, Space, Typo, Typography } from '../constants/tokens';
import { useLanguageStore } from '../store/languageStore';

interface Props {
  visible: boolean;
  converting: boolean;
  result: string | null;
  storyTitle: string;
  onClose: () => void;
}

export function WebnovelModal({ visible, converting, result, storyTitle, onClose }: Props) {
  const viewShotRef = useRef<any>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const { bottom } = useSafeAreaInsets();
  const t = useLanguageStore(s => s.t);

  useEffect(() => {
    if (visible) {
      sheetRef.current?.expand();
    } else {
      sheetRef.current?.close();
    }
  }, [visible]);

  const renderBackdrop = useCallback((props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.8} onPress={onClose} />
  ), [onClose]);

  const handleShare = async () => {
    try {
      const capture = viewShotRef.current?.capture;
      if (typeof capture !== 'function') {
        return;
      }
      const uri = await capture();
      await Share.share({ url: uri, message: storyTitle });
    } catch {}
  };

  const handleCopy = () => {
    if (result) {
      clipboardSetString(result);
    }
  };

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={['80%']}
      enablePanDownToClose
      onClose={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheet}
      handleIndicatorStyle={styles.handle}
      bottomInset={bottom}
    >
      <View style={styles.box}>
        <Text style={styles.title}>{converting ? (t?.loading ?? '') : storyTitle}</Text>

        <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 0.95 }}>
          <View style={styles.shareCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardApp}>RPcore</Text>
              <Text style={styles.cardStory} numberOfLines={1}>{storyTitle}</Text>
            </View>
            <BottomSheetScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.content} selectable>{result ?? ''}</Text>
              {converting ? <Text style={styles.cursor}>...</Text> : null}
            </BottomSheetScrollView>
          </View>
        </ViewShot>

        <View style={styles.actions}>
          <PressableOpacity style={styles.button} onPress={handleCopy}>
            <Text style={styles.buttonText}>{t?.copy ?? ''}</Text>
          </PressableOpacity>
          <PressableOpacity style={[styles.button, styles.shareButton]} disabled={converting} onPress={handleShare}>
            <Text style={styles.buttonText}>{converting ? (t?.loading ?? '') : (t?.share ?? '')}</Text>
          </PressableOpacity>
          <PressableOpacity style={[styles.button, styles.closeButton]} onPress={onClose}>
            <Text style={styles.buttonText}>{t?.close ?? ''}</Text>
          </PressableOpacity>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: '#0E0E14' },
  handle: { backgroundColor: '#757585' },
  box: { flex: 1, paddingHorizontal: Space['5'], paddingTop: 8 },
  title: { color: '#D4A853', fontSize: Typo.size.lg, fontFamily: Typography.fontFamily.bold, marginBottom: Space['4'], textAlign: 'center' },
  shareCard: { backgroundColor: '#050507', borderRadius: Radius.lg, overflow: 'hidden', marginBottom: Space['1'] },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Space['4'], paddingVertical: Space['3'], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#181820' },
  cardApp: { color: '#D4A853', fontSize: Typo.size.sm, fontFamily: Typography.fontFamily.bold },
  cardStory: { color: '#8A8A9E', fontSize: Typo.size.sm, flex: 1, textAlign: 'right' },
  scroll: { maxHeight: 280, paddingHorizontal: Space['4'], paddingVertical: Space['3'] },
  content: { color: '#C8C8D4', fontSize: Typo.size.md, lineHeight: 22 },
  cursor: { color: '#D4A853', fontSize: Typo.size.lg },
  actions: { flexDirection: 'row', gap: Space['2'], marginTop: Space['4'] },
  button: { flex: 1, backgroundColor: '#111118', borderRadius: Radius.md, paddingVertical: Space['3'], alignItems: 'center' },
  shareButton: { backgroundColor: 'rgba(82,168,120,0.15)', borderWidth: 1, borderColor: '#4ADE80' },
  closeButton: { backgroundColor: '#181820' },
  buttonText: { color: '#C8C8D4', fontSize: Typo.size.md, fontFamily: Typography.fontFamily.semibold },
});
