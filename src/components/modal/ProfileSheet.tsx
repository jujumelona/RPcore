import { Typography } from '../../constants/tokens';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { CachedImage } from '../CachedImage';
import { PressableOpacity } from '../PressableOpacity';
import { useLanguageStore } from '../../store/languageStore';
import { ImageViewerModal } from '../ImageViewerModal';

interface ProfileSheetProps {
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
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

export function ProfileSheet({
  visible,
  onClose,
  images,
  name,
  age,
  gender,
  traits,
  personality,
  personalityExample,
  description,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
}: ProfileSheetProps) {
  const { width } = useWindowDimensions();
  const { bottom } = useSafeAreaInsets();
  const t = useLanguageStore(s => s.t);
  const sheetRef = useRef<BottomSheet>(null);
  const galleryRef = useRef<ScrollView>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  useEffect(() => {
    if (visible) {
      setHeroIndex(0);
      galleryRef.current?.scrollTo({ x: 0, animated: false });
      sheetRef.current?.snapToIndex(0);
    } else {
      sheetRef.current?.close();
    }
  }, [visible]);

  const renderBackdrop = useCallback((props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop
      {...props}
      disappearsOnIndex={-1}
      appearsOnIndex={0}
      opacity={0.72}
      onPress={onClose}
    />
  ), [onClose]);

  const introText = (description || personality || '').trim();
  const speechExampleText = (personalityExample || '').trim();
  const metaChips = [age && `${age}${t?.ageUnit ?? ''}`, gender, traits].filter(Boolean) as string[];
  const snapPoints = useMemo(() => ['82%'], []);
  const heroWidth = width - 36;
  const heroHeight = Math.min(320, width * 0.96);

  return (
    <>
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        onClose={onClose}
        backdropComponent={renderBackdrop}
        backgroundStyle={s.sheet}
        handleIndicatorStyle={s.handle}
        keyboardBehavior="interactive"
        bottomInset={bottom}
      >
        <BottomSheetScrollView
          contentContainerStyle={[s.content, { paddingBottom: bottom + 28 }]}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={s.header}>
            <View style={s.headerText}>
              <Text style={s.nameText} numberOfLines={1}>{name}</Text>
              {metaChips.length > 0 ? (
                <View style={s.chipsRow}>
                  {metaChips.map((chip, index) => (
                    <View key={`${chip}_${index}`} style={s.chip}>
                      <Text style={s.chipText}>{chip}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            <PressableOpacity
              style={s.closeButton}
              onPress={onClose}
              accessibilityLabel={t?.close ?? ''}
            >
              <X size={18} color="#D7DCE5" />
            </PressableOpacity>
          </View>

          <View style={s.heroCard}>
            {images.length > 0 ? (
              <ScrollView
                ref={galleryRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={event => {
                  setHeroIndex(Math.round(event.nativeEvent.contentOffset.x / heroWidth));
                }}
                scrollEventThrottle={16}
              >
                {images.map((uri, index) => (
                  <PressableOpacity
                    key={`${uri}_${index}`}
                    activeOpacity={0.94}
                    onPress={() => {
                      setViewerIndex(index);
                      setViewerVisible(true);
                    }}
                  >
                    <CachedImage
                      uri={uri}
                      priority="high"
                      style={{ width: heroWidth, height: heroHeight }}
                      contentFit="cover"
                    />
                  </PressableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={[s.heroPlaceholder, { width: heroWidth, height: Math.min(240, width * 0.66) }]}>
                <Text style={s.heroInitial}>{name.charAt(0) || '?'}</Text>
              </View>
            )}

            {images.length > 1 ? (
              <View style={s.dots}>
                {images.map((_, index) => (
                  <View key={index} style={[s.dot, index === heroIndex && s.dotActive]} />
                ))}
              </View>
            ) : null}
          </View>

          {primaryActionLabel || secondaryActionLabel ? (
            <View style={s.actionRow}>
              {primaryActionLabel ? (
                <PressableOpacity
                  style={[s.actionButton, s.actionButtonPrimary]}
                  onPress={onPrimaryAction}
                  accessibilityLabel={primaryActionLabel}
                >
                  <Text style={[s.actionButtonText, s.actionButtonTextPrimary]}>
                    {primaryActionLabel}
                  </Text>
                </PressableOpacity>
              ) : null}
              {secondaryActionLabel ? (
                <PressableOpacity
                  style={s.actionButton}
                  onPress={onSecondaryAction}
                  accessibilityLabel={secondaryActionLabel}
                >
                  <Text style={s.actionButtonText}>{secondaryActionLabel}</Text>
                </PressableOpacity>
              ) : null}
            </View>
          ) : null}

          {introText ? (
            <View style={s.section}>
              <Text style={s.sectionTitle}>{t?.profileIntroLabel ?? ''}</Text>
              <Text style={s.sectionBody}>{introText}</Text>
            </View>
          ) : null}

          {speechExampleText ? (
            <View style={s.section}>
              <Text style={s.sectionTitle}>{t?.speechPatternLabel ?? ''}</Text>
              <Text style={s.sectionBody}>{speechExampleText}</Text>
            </View>
          ) : null}
        </BottomSheetScrollView>
      </BottomSheet>

      <ImageViewerModal
        visible={viewerVisible}
        images={images}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />
    </>
  );
}

const s = StyleSheet.create({
  sheet: {
    backgroundColor: '#05070C',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  handle: {
    width: 42,
    backgroundColor: '#6F7788',
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 8,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  nameText: {
    fontSize: 24,
    fontFamily: Typography.fontFamily.bold,
    color: '#F0F0F5',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chipText: {
    color: '#C8C8D4',
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
  },
  heroCard: {
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#10131B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  heroPlaceholder: {
    backgroundColor: '#181820',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroInitial: {
    fontSize: 64,
    color: '#F0F0F5',
    fontFamily: Typography.fontFamily.bold,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  dotActive: {
    width: 18,
    backgroundColor: '#D4A853',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
  },
  actionButtonPrimary: {
    backgroundColor: 'rgba(212,168,83,0.16)',
    borderColor: 'rgba(212,168,83,0.28)',
  },
  actionButtonText: {
    color: '#E6EBF4',
    fontSize: 14,
    fontFamily: Typography.fontFamily.semibold,
  },
  actionButtonTextPrimary: {
    color: '#F4E3A7',
  },
  section: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.semibold,
    color: '#8A8A9E',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionBody: {
    fontSize: 15,
    color: '#D6DCE7',
    lineHeight: 24,
    fontFamily: Typography.fontFamily.regular,
  },
});
