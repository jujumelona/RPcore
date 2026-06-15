// src/components/messageBubble/styles.ts
import { StyleSheet } from 'react-native';
import { Typography as Typo } from '../../constants/tokens';

export const s = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 14, paddingVertical: 4, gap: 8 },
  rowUser: { flexDirection: 'row-reverse' },

  avatarWrap: {
    width: 32, height: 32, borderRadius: 16, overflow: 'hidden', flexShrink: 0,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)'
  },
  avatar:         { width: 32, height: 32, borderRadius: 16 },
  avatarFallback: { backgroundColor: '#13131A', alignItems: 'center', justifyContent: 'center' },
  avatarInitial:  { fontSize: 13, color: '#C8C8D4', fontFamily: Typo.fontFamily.semibold },

  bubbleWrap:     { flex: 1, alignItems: 'flex-start', gap: 3, maxWidth: '80%' },
  bubbleWrapUser: { alignItems: 'flex-end' },

  charName: {
    fontSize: 11,
    color: '#8A8A9E',
    fontFamily: Typo.fontFamily.medium,
    paddingHorizontal: 4,
    letterSpacing: 0.3,
    marginBottom: 1,
  },

  // ── Bubble shell ────────────────────────────────────────────
  bubble:    { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 11, maxWidth: '100%' },

  bubbleAI:  {
    backgroundColor: '#1E1E28',           // surface1 — 기존 #26282C보다 어둡고 깔끔
    borderBottomLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
    elevation: 1,
  },

  bubbleUser: {
    backgroundColor: 'rgba(212,168,83,0.18)', // accentGlow 반투명 — 기존 솔리드 금색 대신
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.28)',      // accentBorder
    elevation: 2,
  },

  // ── Text segments ───────────────────────────────────────────
  segText: {
    color: '#F0F0F5',
    fontFamily: Typo.fontFamily.medium,
    fontSize: 15,                              // 17 → 15: 호흡감
    letterSpacing: 0.05,
    lineHeight: 24,                            // 28 → 24
  },

  segTextUser: {
    color: '#EDD98A',                          // 반투명 버블이라 밝은 골드 텍스트
    fontFamily: Typo.fontFamily.semibold,
    fontSize: 15,
    letterSpacing: 0.05,
    lineHeight: 24,
  },

  segAction: {
    color: '#A0B0C0',
    fontStyle: 'italic',
    fontFamily: Typo.fontFamily.light,
    letterSpacing: 0.2,
    opacity: 0.9,
  },

  segThought: {
    color: '#D4A853',
    fontStyle: 'italic',
    fontFamily: Typo.fontFamily.light,
    letterSpacing: 0.15,
    opacity: 0.85,
  },

  actionPrefixWrap: {
    paddingBottom: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    marginBottom: 7,
  },

  // ── Narrator ────────────────────────────────────────────────
  // 전체 블록 래퍼 (paddingHorizontal 포함)
  narratorContainer: {
    flexShrink: 1,
    marginVertical: 6,
    paddingHorizontal: 16,
  },

  // 왼쪽 accent border + 배경 카드
  narratorWrap: {
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(212,168,83,0.30)',  // accentBorder
    backgroundColor: 'rgba(212,168,83,0.07)',  // accentSoft
    borderRadius: 8,
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  // scene 구분선 행 (위쪽 씬 레이블용)
  narratorSceneWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  narratorDivider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(212,168,83,0.20)',
  },
  narratorSceneLabel: {
    fontSize: 10,
    color: '#D4A853',
    fontFamily: Typo.fontFamily.semibold,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },

  narratorActionWrap: {
    paddingHorizontal: 0, // narratorWrap 안에서 쓰이므로 별도 패딩 불필요
  },

  narratorText: {
    color: '#A0B0C8',                          // #7070A0 → 더 읽기 좋은 밝기
    fontStyle: 'italic',
    fontFamily: Typo.fontFamily.regular,
    lineHeight: 21,
    textAlign: 'left',                         // center → left: 덜 어지러움
    flexShrink: 1,
    letterSpacing: 0.2,
  },

  narratorActionSeg: {
    color: '#8A9BAB',
    fontStyle: 'italic',
    fontFamily: Typo.fontFamily.light,
    lineHeight: 19,
    letterSpacing: 0.2,
  },

  // ── Reactions ───────────────────────────────────────────────
  reactionsRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 },
  reactionsRowUser: { justifyContent: 'flex-end' },
  reactionBadge: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.09)',
  },
  reactionEmoji: { fontSize: 13 },

  // ── Reply quote ─────────────────────────────────────────────
  replyQuote: {
    flexDirection: 'row', alignItems: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10,
    overflow: 'hidden', maxWidth: '82%', marginBottom: 4,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.07)',
  },
  replyQuoteUser:   { alignSelf: 'flex-end' },
  replyQuoteAccent: { width: 2.5, backgroundColor: '#D4A853' },
  replyQuoteName: {
    fontSize: 10.5, color: '#D4A853',
    fontFamily: Typo.fontFamily.semibold,
    paddingHorizontal: 9, paddingTop: 5,
    letterSpacing: 0.2,
  },
  replyQuoteText: {
    fontSize: 12, color: '#8A8A9E',
    paddingHorizontal: 9, paddingBottom: 5,
    fontFamily: Typo.fontFamily.regular,
  },

  cursor: { color: '#D4A853', opacity: 0.75 },
});

export const styles = StyleSheet.create({
  _flexShrink: { flexShrink: 1 },
  _position: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  _flex:     { flex: 1, overflow: 'hidden' },
});
