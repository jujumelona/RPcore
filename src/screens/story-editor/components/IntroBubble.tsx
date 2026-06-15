/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * src/screens/story-editor/components/IntroBubble.tsx
 * StoryEditorScreen.tsx의 인트로 버블 컴포넌트
 */

import { Typography } from '../../../constants/tokens';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useLanguageStore } from '../../../store/languageStore';
import type { IntroMessage, CharacterDraft } from '../types/StoryEditorLegacyTypes';

interface IntroBubbleProps {
  msg: IntroMessage;
  chars: CharacterDraft[];
  onLongPress: () => void;
}

export function IntroBubble({ msg, chars, onLongPress }: IntroBubbleProps) {
  const t = useLanguageStore(s => s.t);
  const char = chars.find(c => c.id === msg.speakerCharId);

  // 수정: speakerCharId 0은 character 없는 narrator 폴백 (이전 방식)
  const effectiveSpeakerType = (msg.speakerType === 'character' && msg.speakerCharId == null)
    ? 'narrator'
    : msg.speakerType;

  if (effectiveSpeakerType === 'image') {
    return (
      <TouchableOpacity onLongPress={onLongPress} style={styles.introBubbleImageWrap}>
        <View style={styles.fullWidth}>
          {msg.imageUri
            ? <Image source={{ uri: msg.imageUri }} style={styles.introBubbleImage} contentFit="contain" />
            : <Text style={styles.narratorText}>{t?.editorIntroImage}</Text>}
          {msg.content ? <Text style={styles.introBubbleImageCaption}>{msg.content}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  }

  if (effectiveSpeakerType === 'narrator') {
    return (
      <TouchableOpacity onLongPress={onLongPress} style={styles.narratorBubble}>
        <Text style={styles.narratorText}>{msg.content}</Text>
      </TouchableOpacity>
    );
  }

  if (effectiveSpeakerType === 'user') {
    return (
      <TouchableOpacity onLongPress={onLongPress} style={styles.userBubbleRow}>
        <View style={styles.userBubble}><Text style={styles.userText}>{msg.content}</Text></View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onLongPress={onLongPress} style={styles.aiBubbleRow}>
      <View style={styles.aiAvatar}><Text style={styles.aiAvatarText}>{char?.name?.[0] ?? 'AI'}</Text></View>
      <View>
        <Text style={styles.aiName}>{char?.name ?? t?.character}</Text>
        <View style={styles.aiBubble}><Text style={styles.aiText}>{msg.content}</Text></View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  introBubbleImageWrap: {
    marginBottom: 8,
    alignItems: 'center' },
  fullWidth: {
    width: '100%' },
  introBubbleImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#1A1A24' },
  introBubbleImageCaption: {
    marginTop: 8,
    fontSize: 12,
    color: '#A0A0B0',
    textAlign: 'center' },
  narratorBubble: {
    backgroundColor: 'rgba(74,222,128,0.10)',
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4ADE80' },
  narratorText: {
    color: '#C8C8D4',
    fontSize: 14,
    lineHeight: 20 },
  userBubbleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginVertical: 8 },
  userBubble: {
    backgroundColor: '#7C3AED',
    borderRadius: 16,
    borderTopRightRadius: 4,
    padding: 12,
    maxWidth: '80%' },
  userText: {
    color: '#0E0E14',
    fontSize: 14 },
  aiBubbleRow: {
    flexDirection: 'row',
    marginVertical: 8,
    alignItems: 'flex-start' },
  aiAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2C2C38',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8 },
  aiAvatarText: {
    color: '#8A8A9E',
    fontSize: 14,
    fontFamily: Typography.fontFamily.bold },
  aiName: {
    fontSize: 12,
    color: '#8A8A9E',
    marginBottom: 4 },
  aiBubble: {
    backgroundColor: '#1A1A24',
    borderRadius: 16,
    borderTopLeftRadius: 4,
    padding: 12,
    maxWidth: '80%' },
  aiText: {
    color: '#C8C8D4',
    fontSize: 14 } });
