/**
 * src/screens/chat/components/ChoicePanel.tsx
 *
 * 선택지 패널 — 구 ChatScreen에서 완전 이식
 * ✅ 골드 구분선
 * ✅ 프롬프트 박스
 * ✅ 엔딩 태그
 * ✅ 선택 후 비활성화
 * ✅ 다국어 오버라이드 지원
 */

import { Typography } from '../../../constants/tokens';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import type { ChoiceOption } from '../types/ChatMessageTypes';

interface ChoicePanelProps {
  choices: ChoiceOption[];
  prompt?: string;
  onSelect: (choice: ChoiceOption) => void;
  userName?: string;
  langOverrides?: {
    prompt?: string;
    options?: Record<string, string>;
  };
}

function applyName(text: string, name: string): string {
  if (!name) return text;
  return text
    .replace(/\{\{user\}\}/gi, name)
    .replace(/\[유저\]/g, name)
    .replace(/\[User\]/g, name);
}

export function ChoicePanel({ choices, prompt, onSelect, userName = '', langOverrides }: ChoicePanelProps) {
  const displayPrompt = langOverrides?.prompt ?? prompt;

  return (
    <View style={styles.fixedChoiceBar}>
      <View style={styles.container}>
        {/* 골드 구분선 */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerLabel}>CHOICE</Text>
          <View style={styles.dividerLine} />
        </View>

        {!!displayPrompt && (
          <View style={styles.promptBox}>
            <Text style={styles.promptText}>{applyName(displayPrompt, userName)}</Text>
          </View>
        )}        {choices.map((choice, i) => {
          // Use a stable fallback key when choice.id is empty so reordered options do not reuse state.
          const label = langOverrides?.options?.[choice.id] ?? choice.label;
          // [수정] key를 choice.id || String(i) 로 변경
          // 기존: choice.id or i -> id가 빈 문자열('')이면 index i 사용 -> 선택지 순서 변경 시 상태 오염
          const stableKey = (choice.id != null && String(choice.id).length > 0) ? String(choice.id) : `choice_${i}`;
          return (
            <TouchableOpacity
              key={stableKey}
              testID={`chat-choice-${i}`}
              accessibilityLabel={`chat-choice-${i}`}
              style={[styles.optionBtn, choice.isSelected && styles.optionBtnSelected]}
              onPress={() => onSelect(choice)}
              disabled={choice.isSelected}
              activeOpacity={0.75}
            >
              <Text style={[styles.optionLabel, choice.isSelected && styles.optionLabelSelected]}>
                {applyName(label, userName)}
              </Text>
              {choice.isEnding && <Text style={styles.endingTag}>END</Text>}
              <ChevronRight size={16} color={choice.isSelected ? '#D4A853' : '#5A5A70'} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fixedChoiceBar: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,92,246,0.30)',
    backgroundColor: 'rgba(8,8,12,0.97)',
    paddingBottom: 8,
    elevation: 5
  },
  container: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(212,168,83,0.30)',
    elevation: 1
  },
  dividerLabel: {
    color: '#D4A853',
    fontSize: 10,
    fontFamily: Typography.fontFamily.semibold,
    letterSpacing: 2,
    marginHorizontal: 10, backgroundColor: 'rgba(212,168,83,0.50)'
  },
  promptBox: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)'
  },
  promptText: {
    color: '#BBBBBB',
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 20,
    textAlign: 'center'
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.10)'
  },
  optionBtnSelected: {
    backgroundColor: 'rgba(212,168,83,0.10)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(212,168,83,0.55)'
  },
  optionLabel: {
    color: '#F0F0F5',
    fontSize: 15,
    flex: 1,
    lineHeight: 22
  },
  optionLabelSelected: {
    color: '#E0B85A', textShadowColor: 'rgba(212,168,83,0.40)'
  },
  endingTag: {
    fontSize: 10,
    color: '#E24B4A',
    fontFamily: Typography.fontFamily.semibold,
    letterSpacing: 1,
    marginRight: 6,
    borderWidth: 1,
    borderColor: 'rgba(226,75,74,0.4)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4
  }
  });
