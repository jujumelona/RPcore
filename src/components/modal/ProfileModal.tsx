// src/components/modals/ProfileModal.tsx
// ChatScreen에서 분리된 캐릭터/유저 프로필 모달

import { Typography } from '../../constants/tokens';
import { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, ScrollView, StyleSheet,
  useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CachedImage } from '../CachedImage';
import { PressableOpacity } from '../PressableOpacity';
import { useLanguageStore } from '../../store/languageStore';
import { ImageViewerModal } from '../ImageViewerModal';


interface ProfileModalProps {
  visible: boolean;
  onClose: () => void;
  images: string[];
  name: string;
  age?: string;
  gender?: string;
  traits?: string;
  personality?: string;
  personalityExample?: string;
  description?: string;
}

export function ProfileModal({
  visible, onClose, images, name,
  age, gender, traits, personality, personalityExample, description }: ProfileModalProps) {
  const { width } = useWindowDimensions();
  const [heroIdx, setHeroIdx] = useState(0);
  const imgScrollRef = useRef<ScrollView>(null);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const t = useLanguageStore(s => s.t);

  // [BUG FIX] heroImage/heroPlaceholder 스타일을 모듈 레벨 StyleSheet.create에서 제거.
  // width is only available inside the component via useWindowDimensions().
  // Build these styles at render time so module initialization cannot throw.
  const heroImageStyle = { width, height: width * 1.2 };
  const heroPlaceholderStyle = { width, height: width * 0.8, backgroundColor: '#181820', alignItems: 'center' as const, justifyContent: 'center' as const };
  useEffect(() => {
    if (visible) {
      setHeroIdx(0);
      imgScrollRef.current?.scrollTo({ x: 0, animated: false });
    }
  }, [visible]);

  const metaChips = [age && `${age}${t?.ageUnit ?? ''}`, gender, traits].filter(Boolean) as string[];
  const introText = (description || personality || '').trim();
  const speechExampleText = (personalityExample || '').trim();

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView style={[styles._flex1, s.bgDark]}>
        <PressableOpacity
          style={s.closeBtn}
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={s.closeTxt}>✕</Text>
        </PressableOpacity>

        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          {images.length > 0 ? (
            <ScrollView
              ref={imgScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={e =>
                setHeroIdx(Math.round(e.nativeEvent.contentOffset.x / width))
              }
              scrollEventThrottle={16}
            >
              {images.map((uri, i) => (
                <PressableOpacity
                  key={i}
                  activeOpacity={0.9}
                  onPress={() => { setViewerIndex(i); setViewerVisible(true); }}
                >
                  <CachedImage
                    uri={uri}
                    priority="high"
                    style={heroImageStyle}
                    contentFit="cover"
                  />
                </PressableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View style={heroPlaceholderStyle}>
              <Text style={s.heroInitial}>{name.charAt(0) ?? '?'}</Text>
            </View>
          )}

          {images.length > 1 && (
            <View style={s.dots}>
              {images.map((_, i) => (
                <View key={i} style={[s.dot, i === heroIdx && s.dotOn]} />
              ))}
            </View>
          )}

          <View style={styles._marginTop}>
            <Text style={s.nameText}>{name}</Text>
          </View>

          {metaChips.length > 0 && (
            <View style={s.chipsRow}>
              {metaChips.map((c, i) => (
                <View key={i} style={s.chip}>
                  <Text style={s.chipTxt}>{c}</Text>
                </View>
              ))}
            </View>
          )}

          {!!introText && (
            <View style={s.sec}>
              <Text style={s.secTitle}>{t?.profileIntroLabel ?? ''}</Text>
              <Text style={s.secBody}>{introText}</Text>
            </View>
          )}

          {!!speechExampleText && (
            <View style={s.sec}>
              <Text style={s.secTitle}>{t?.speechPatternLabel ?? ''}</Text>
              <Text style={s.secBody}>{speechExampleText}</Text>
            </View>
          )}

          <View style={styles._height} />
        </ScrollView>

        {/* 이미지 전체화면 뷰어 */}
        <ImageViewerModal
          visible={viewerVisible}
          images={images}
          initialIndex={viewerIndex}
          onClose={() => setViewerVisible(false)}
        />
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  bgDark: { backgroundColor: '#050507' },
  closeBtn:      { position: 'absolute', top: 16, right: 16, zIndex: 10, padding: 8 },
  closeTxt:      { color: '#F0F0F5', fontSize: 18, fontFamily: Typography.fontFamily.bold },
  // heroImage / heroPlaceholder: width 기반이라 인라인 스타일로 이동 (모듈 레벨 참조 불가)
  heroInitial:   { fontSize: 64, color: '#F0F0F5', fontFamily: Typography.fontFamily.bold },
  dots:          { flexDirection: 'row', justifyContent: 'center', marginTop: 8, gap: 6 },
  dot:           { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotOn:         { backgroundColor: '#D4A853' },
  nameText:      { fontSize: 24, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  chipsRow:      { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, marginTop: 10, gap: 8 },
  chip:          { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)' },
  chipTxt:       { color: '#C8C8D4', fontSize: 13 },
  sec:           { paddingHorizontal: 20, marginTop: 16 },
  secTitle:      { fontSize: 13, fontFamily: Typography.fontFamily.semibold, color: '#8A8A9E', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 },
  secBody:       { fontSize: 15, color: '#C8C8D4', lineHeight: 22 },
  quoteText:     { fontSize: 15, color: '#aaa', fontStyle: 'italic', lineHeight: 22 } });

const styles = StyleSheet.create({
  _flex1: {
    flex: 1 },
  _marginTop: {
    paddingHorizontal: 20,
    marginTop: 18 },
  _height: {
    height: 50 } });
