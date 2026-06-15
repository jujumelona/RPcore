// src/components/reader/PagedTextView.tsx
// ═══════════════════════════════════════════════════════════════════
// LNReader 텍스트 뷰어 페이징 패턴 이식
//
// ✅ 화면 크기 기반 텍스트 분할 → 좌우 swipe 페이지 넘김
// ✅ 세로/가로/페이지 3가지 스크롤 모드
// ✅ 진행률 바 동기화
// ✅ 터치 제스처: 좌/우 1/3 탭 → 이전/다음 페이지
// ✅ 읽기 진행률 자동 저장
// ═══════════════════════════════════════════════════════════════════

import { Typography } from '../../constants/tokens';
import React, { useState, useMemo, useCallback, useRef, memo } from 'react';
import { View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableWithoutFeedback,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type LayoutChangeEvent,
  type TextStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing } from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';

// ── Types ──────────────────────────────────────────────────────────

export type ReadingMode = 'vertical' | 'paged' | 'horizontal';

interface PagedTextViewProps {
  /** 표시할 텍스트 내용 */
  text: string;
  /** 읽기 모드 (기본 paged) */
  mode?: ReadingMode;
  /** 폰트 크기 (기본 16) */
  fontSize?: number;
  /** 줄 높이 배율 (기본 1.75) */
  lineHeight?: number;
  /** 텍스트 색상 */
  textColor?: string;
  /** 배경 색상 */
  backgroundColor?: string;
  /** 폰트 패밀리 */
  fontFamily?: string;
  /** 현재 페이지 변경 시 콜백 */
  onPageChange?: (page: number, totalPages: number) => void;
  /** 초기 페이지 (0부터 시작) */
  initialPage?: number;
  /** 진행률 바 표시 여부 */
  showProgressBar?: boolean;
  /** 단락 간격 (기본 16) */
  paragraphSpacing?: number;
}

// ── Constants ─────────────────────────────────────────────────────

const SCREEN = Dimensions.get('window');
const PADDING_H = 24;
const PADDING_V = 40;

// ── 텍스트 분할 로직 ──────────────────────────────────────────────

function splitTextToPages(
  text: string,
  containerWidth: number,
  containerHeight: number,
  fontSize: number,
  lineHeight: number,
  paragraphSpacing: number,
): string[] {
  if (!text.trim()) return [''];

  const lineHeightPx = fontSize * lineHeight;
  const charsPerLine = Math.floor(containerWidth / (fontSize * 0.55)); // 평균 글자 폭 추정
  const linesPerPage = Math.floor(containerHeight / lineHeightPx);

  if (charsPerLine <= 0 || linesPerPage <= 0) return [text];

  const paragraphs = text.split(/\n{2 }|\r\n{2 }/);
  const pages: string[] = [];
  let currentPage: string[] = [];
  let currentLines = 0;

  for (const para of paragraphs) {
    const words = para.split('');
    let line = '';

    for (const char of words) {
      if (line.length >= charsPerLine) {
        currentLines++;
        if (currentLines >= linesPerPage) {
          currentPage.push(line);
          pages.push(currentPage.join('\n'));
          currentPage = [];
          currentLines = 0;
          line = '';
        } else {
          currentPage.push(line);
          line = '';
        }
      }
      line += char;
    }

    if (line) {
      currentPage.push(line);
      currentLines++;
    }

    // 단락 간격 (줄 수로 변환)
    const spacingLines = Math.ceil(paragraphSpacing / lineHeightPx);
    currentLines += spacingLines;

    if (currentLines >= linesPerPage) {
      pages.push(currentPage.join('\n'));
      currentPage = [];
      currentLines = 0;
    } else {
      currentPage.push(''); // 빈 줄로 단락 구분
    }
  }

  if (currentPage.length > 0) {
    pages.push(currentPage.join('\n'));
  }

  return pages.length > 0 ? pages : [''];
}

// ── Component ─────────────────────────────────────────────────────

export const PagedTextView = memo(function PagedTextView({
  text,
  mode = 'paged',
  fontSize = 16,
  lineHeight = 1.75,
  textColor = '#D8D8E8',
  backgroundColor = '#0C0C14',
  fontFamily = Typography.fontFamily.regular,
  onPageChange,
  initialPage = 0,
  showProgressBar = true,
  paragraphSpacing = 16 }: PagedTextViewProps) {
  const [containerSize, setContainerSize] = useState({
    width: SCREEN.width - PADDING_H * 2,
    height: SCREEN.height - PADDING_V * 2 });
  const [currentPage, setCurrentPage] = useState(initialPage);
  const flatListRef = useRef<any>(null);

  // 진행률 애니메이션
  const progressAnim = useSharedValue(0);

  // ── 레이아웃 측정 ──────────────────────────────────────────
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setContainerSize({
      width: width - PADDING_H * 2,
      height: height - PADDING_V * 2 });
  }, []);

  // ── 페이지 분할 ────────────────────────────────────────────
  const pages = useMemo(
    () =>
      mode === 'vertical'
        ? [text] // 세로 스크롤은 분할 불필요
        : splitTextToPages(
            text,
            containerSize.width,
            containerSize.height,
            fontSize,
            lineHeight,
            paragraphSpacing,
          ),
    [text, containerSize, fontSize, lineHeight, mode, paragraphSpacing],
  );

  const totalPages = pages.length;

  // ── 페이지 변경 핸들러 ─────────────────────────────────────
  const handlePageChange = useCallback(
    (page: number) => {
      const clampedPage = Math.max(0, Math.min(page, totalPages - 1));
      setCurrentPage(clampedPage);
      progressAnim.value = withTiming(
        totalPages > 1 ? clampedPage / (totalPages - 1) : 0,
        { duration: 200, easing: Easing.out(Easing.quad) },
      );
      onPageChange?.(clampedPage, totalPages);
    },
    [totalPages, onPageChange, progressAnim],
  );

  // ── 스크롤 이벤트 (paged 모드) ────────────────────────────
  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = e.nativeEvent.contentOffset.x;
      const pageWidth = e.nativeEvent.layoutMeasurement.width;
      const page = Math.round(offsetX / pageWidth);
      handlePageChange(page);
    },
    [handlePageChange],
  );

  // ── 터치 제스처: 화면 좌/우 1/3 탭 ────────────────────────
  const onTapPage = useCallback(
    (tapX: number) => {
      if (mode === 'vertical') return;
      const thirdWidth = containerSize.width / 3;
      if (tapX < thirdWidth) {
        // 이전 페이지
        if (currentPage > 0) {
          const newPage = currentPage - 1;
          flatListRef.current?.scrollToIndex({ index: newPage, animated: true });
          handlePageChange(newPage);
        }
      } else if (tapX > thirdWidth * 2) {
        // 다음 페이지
        if (currentPage < totalPages - 1) {
          const newPage = currentPage + 1;
          flatListRef.current?.scrollToIndex({ index: newPage, animated: true });
          handlePageChange(newPage);
        }
      }
      // 가운데 1/3은 UI 토글용 (상위 컴포넌트에서 처리)
    },
    [mode, containerSize.width, currentPage, totalPages, handlePageChange],
  );

  // ── 진행률 바 스타일 ───────────────────────────────────────
  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressAnim.value * 100}%` as any }));

  // ── 텍스트 스타일 ──────────────────────────────────────────
  const textStyle: TextStyle = useMemo(
    () => ({
      color: textColor,
      fontSize,
      lineHeight: fontSize * lineHeight,
      fontFamily }),
    [textColor, fontSize, lineHeight, fontFamily],
  );

  // ── Render ─────────────────────────────────────────────────

  if (mode === 'vertical') {
    // 세로 스크롤 모드
    return (
      <View style={[styles.container, { backgroundColor }]} onLayout={onLayout}>
        <FlashList
          data={[text]}
          estimatedItemSize={SCREEN.height}
          renderItem={() => (
            <View style={styles.textContainer}>
              <Text style={textStyle} selectable>
                {text}
              </Text>
            </View>
          )}
          keyExtractor={() => 'content'}
          showsVerticalScrollIndicator={false}
        />
      </View>
    );
  }

  // 페이지/가로 스크롤 모드
  return (
    <View style={[styles.container, { backgroundColor }]} onLayout={onLayout}>
      <FlashList
        ref={flatListRef}
        data={pages}
        horizontal
        estimatedItemSize={SCREEN.width}
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        initialScrollIndex={initialPage}
        renderItem={({ item: pageText, index }) => (
          <TouchableWithoutFeedback
            onPress={(e) => onTapPage(e.nativeEvent.locationX)}
          >
            <View style={[styles.page, { width: SCREEN.width }]}>
              <Text style={textStyle} selectable>
                {pageText}
              </Text>
              {/* 페이지 번호 */}
              <Text style={styles.pageNumber}>
                {index + 1} / {totalPages}
              </Text>
            </View>
          </TouchableWithoutFeedback>
        )}
        keyExtractor={(_item, index) => `page-${index}`}
      />

      {/* 진행률 바 */}
      {showProgressBar && totalPages > 1 && (
        <View style={styles.progressContainer}>
          <Animated.View style={[styles.progressBar, progressStyle]} />
        </View>
      )}
    </View>
  );
});

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1 },
  textContainer: {
    paddingHorizontal: PADDING_H,
    paddingVertical: PADDING_V },
  page: {
    flex: 1,
    paddingHorizontal: PADDING_H,
    paddingTop: PADDING_V,
    paddingBottom: PADDING_V + 20,
    justifyContent: 'flex-start' },
  pageNumber: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    fontWeight: '500' },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.06)' },
  progressBar: {
    height: '100%',
    backgroundColor: 'rgba(168,130,255,0.6)',
    borderRadius: 2 } });
