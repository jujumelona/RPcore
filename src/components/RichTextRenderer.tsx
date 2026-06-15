// src/components/RichTextRenderer.tsx
// ═══════════════════════════════════════════════════════════════════
//  Bluesky RichText 렌더러 이식
//  — 파싱된 세그먼트를 탭 가능한 Text로 렌더링
//  — URL → InAppBrowser, @멘션 → UserProfile, #태그 → TagBrowser
// ═══════════════════════════════════════════════════════════════════

import React, { useCallback } from 'react';
import { Text, StyleSheet, Linking, type TextStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { parseRichText, type TextSegment } from '../utils/RichTextParser';

interface RichTextRendererProps {
  text: string;
  style?: TextStyle;
  linkColor?: string;
  mentionColor?: string;
  hashtagColor?: string;
  numberOfLines?: number;
  selectable?: boolean;
}

export default function RichTextRenderer({
  text,
  style,
  linkColor = '#5B9BD5',
  mentionColor = '#8B5CF6',
  hashtagColor = '#D4A853',
  numberOfLines,
  selectable = false }: RichTextRendererProps) {
  const nav = useNavigation<any>();
  const segments = parseRichText(text);

  const handlePress = useCallback(
    (segment: TextSegment) => {
      switch (segment.type) {
        case 'url':
          Linking.openURL(segment.value!).catch(() => {});
          break;
        case 'mention':
          nav.push('UserProfileDetail', { authorId: segment.value });
          break;
        case 'hashtag':
          nav.push('TagBrowser', { initialTag: segment.value });
          break;
      }
    },
    [nav],
  );

  if (segments.length === 0) {
    return <Text style={[styles.base, style]}>{text}</Text>;
  }

  return (
    <Text style={[styles.base, style]} numberOfLines={numberOfLines} selectable={selectable}>
      {segments.map((seg, i) => {
        switch (seg.type) {
          case 'url':
            return (
              <Text
                key={i}
                style={[styles.link, { color: linkColor }]}
                onPress={() => handlePress(seg)}
              >
                {seg.text}
              </Text>
            );
          case 'mention':
            return (
              <Text
                key={i}
                style={[styles.mention, { color: mentionColor }]}
                onPress={() => handlePress(seg)}
              >
                {seg.text}
              </Text>
            );
          case 'hashtag':
            return (
              <Text
                key={i}
                style={[styles.hashtag, { color: hashtagColor }]}
                onPress={() => handlePress(seg)}
              >
                {seg.text}
              </Text>
            );
          default:
            return <Text key={i}>{seg.text}</Text>;
        }
      })}
    </Text>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  base: {
    fontSize: 15,
    color: '#E8E6E3',
    lineHeight: 22 },
  link: {
    textDecorationLine: 'underline' },
  mention: {
    fontWeight: '600' },
  hashtag: {
    fontWeight: '500' } });
