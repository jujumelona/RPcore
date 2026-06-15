/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * src/screens/ChatInputBar.tsx
 *
 * Accessible chat composer with reply and delete states.
 */

import { triggerHaptic } from '../utils/haptics';
import React, { type ReactNode } from 'react';
import { View, Text, TextInput, StyleSheet, type TextInputProps, type ViewStyle } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import Animated, { FadeInDown, FadeOut, type AnimatedStyle } from 'react-native-reanimated';
import { ArrowUp, Square, X } from 'lucide-react-native';
import { PressableOpacity } from '../components/PressableOpacity';
import { Radius, Typography } from '../constants/tokens';
import type { EngineState as WarmState } from '../core/llama/EngineTypes';
import type { ActiveChoiceEvent } from '../types/StoryContract';
import { useLanguageStore } from '../store/languageStore';

const MIN_TOUCH = 36;

export interface ReplyTarget {
  id: string;
  role: string;
  text: string;
  senderName?: string;
}

export interface ChatInputBarProps {
  userInput: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onFocus: () => void;
  isTyping: boolean;
  engineWarmState: WarmState;
  activeChoiceEvent: ActiveChoiceEvent | null;
  charName?: string;
  charPulseAnimStyle: AnimatedStyle<ViewStyle>;
  deleteMode: boolean;
  selectedCount: number;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onStopGeneration?: () => void;
  replyTarget?: ReplyTarget | null;
  onCancelReply?: () => void;
  webnovelConverting?: boolean;
  stickToKeyboard?: boolean;
  leadingAccessory?: ReactNode;
  textInputProps?: Partial<TextInputProps>;
  accentColor?: string;
}

const ChatInputBar = React.memo(React.forwardRef<TextInput, ChatInputBarProps>(({ 
  userInput,
  onChangeText,
  onSend,
  onFocus,
  isTyping,
  engineWarmState,
  activeChoiceEvent,
  charName,
  charPulseAnimStyle,
  deleteMode,
  selectedCount,
  onCancelDelete,
  onConfirmDelete,
  onStopGeneration,
  replyTarget,
  onCancelReply,
  webnovelConverting = false,
  stickToKeyboard = true,
  leadingAccessory,
  textInputProps,
  accentColor = '#D4A853',
}: ChatInputBarProps, ref) => {
  const t = useLanguageStore(s => s.t);
  const isReady = engineWarmState === 'ready';
  const sendDisabled = !isReady || isTyping || !userInput.trim() || !!activeChoiceEvent || webnovelConverting;
  const selectedCountLabel = t.selectedCount.replace('{n}', String(selectedCount));
  const replySenderName = replyTarget?.senderName?.trim() || t.reply;

  const placeholder =
    webnovelConverting
      ? t.inputConvertingNovel
      : engineWarmState === 'loading'
        ? t.inputModelLoading
        : engineWarmState === 'warming'
          ? t.inputGpuPreparing
          : isTyping
            ? '...'
            : activeChoiceEvent
              ? t.inputChoosing
              : replyTarget
                ? t.inputReplyingTo.replace('{name}', replySenderName)
                : t.inputPlaceholder;

  const inputA11yHint =
    webnovelConverting
      ? t.inputConvertingNovel
      : engineWarmState !== 'ready'
        ? t.inputModelLoading
        : isTyping
          ? t.aiTypingMsg.replace('{name}', charName ?? 'AI')
          : activeChoiceEvent
            ? t.inputChoosing
            : replyTarget
              ? t.inputReplyingTo.replace('{name}', replySenderName)
              : t.typeMessage;

  const placeholderColor =
    webnovelConverting || engineWarmState === 'loading' || engineWarmState === 'warming'
      ? '#60A5FA'
      : isTyping
        ? '#555568'
        : '#797990';

  const editable =
    textInputProps?.editable ?? (isReady && !isTyping && !activeChoiceEvent && !webnovelConverting);

  const content = (
    <>
      {deleteMode ? (
        <View
          style={s.deleteBar}
          accessible
          accessibilityLabel={`${t.delete} ${selectedCountLabel}`}
        >
          <PressableOpacity
            style={s.deleteCancelBtn}
            onPress={onCancelDelete}
            accessibilityLabel={t.cancel}
            accessibilityRole="button"
          >
            <Text style={s.deleteCancelTxt}>{t.cancel}</Text>
          </PressableOpacity>

          <Text style={s.deleteCountTxt} accessible accessibilityLabel={selectedCountLabel}>
            {selectedCountLabel}
          </Text>

          <PressableOpacity
            style={[s.deleteConfirmBtn, selectedCount === 0 && s.deleteBtnDis]}
            onPress={onConfirmDelete}
            disabled={selectedCount === 0}
            accessibilityLabel={t.delete}
            accessibilityRole="button"
            accessibilityState={{ disabled: selectedCount === 0 }}
            accessibilityHint={selectedCountLabel}
          >
            <Text style={s.deleteConfirmTxt}>{t.delete}</Text>
          </PressableOpacity>
        </View>
      ) : (
        <View>
          {replyTarget ? (
            <Animated.View
              entering={FadeInDown.duration(180).springify()}
              exiting={FadeOut.duration(140)}
              style={s.replyBar}
              accessible
              accessibilityLabel={`${t.a11yReplyTo} ${replySenderName}: ${replyTarget.text}`}
            >
              <View style={[s.replyAccent, { backgroundColor: accentColor }]} importantForAccessibility="no" />
              <View style={styles.flex}>
                <Text style={[s.replyName, { color: accentColor }]} importantForAccessibility="no">
                  {replySenderName}
                </Text>
                <Text style={s.replyText} numberOfLines={1} importantForAccessibility="no">
                  {replyTarget.text}
                </Text>
              </View>

              <PressableOpacity
                onPress={onCancelReply}
                style={s.replyCloseBtn}
                accessibilityLabel={t.cancelReply}
                accessibilityRole="button"
                accessibilityHint={t.cancelReplyHint}
              >
                <X size={16} color="#797990" importantForAccessibility="no" />
              </PressableOpacity>
            </Animated.View>
          ) : null}

          <View style={s.inputArea}>
            {leadingAccessory}

            <TextInput
              ref={ref}
              style={s.textInput}
              {...textInputProps}
              value={userInput}
              onChangeText={onChangeText}
              placeholder={textInputProps?.placeholder ?? placeholder}
              placeholderTextColor={textInputProps?.placeholderTextColor ?? placeholderColor}
              multiline
              maxLength={500}
              editable={editable}
              onFocus={event => {
                textInputProps?.onFocus?.(event);
                onFocus();
              }}
              accessibilityLabel={t.messageInput}
              accessibilityHint={inputA11yHint}
              accessibilityState={{ disabled: !editable }}
              accessibilityValue={{ max: 500, now: userInput.length, text: `${userInput.length}/500` }}
            />

            {userInput.length >= 400 ? (
              <Text style={[s.charCount, userInput.length >= 480 && s.charCountWarn]}>
                {userInput.length}/500
              </Text>
            ) : null}

            {isTyping ? (
              <PressableOpacity
                style={[s.sendBtn, { backgroundColor: accentColor }]}
                onPress={onStopGeneration}
                accessibilityLabel={t.stopAiResponse}
                accessibilityRole="button"
                accessibilityHint={t.stopAiResponseHint}
              >
                <Square size={16} color="#050507" importantForAccessibility="no" />
              </PressableOpacity>
            ) : (
              <PressableOpacity
                style={[s.sendBtn, { backgroundColor: accentColor }, sendDisabled && s.sendBtnDis]}
                onPress={() => {
                  if (!sendDisabled) {
                    triggerHaptic('medium');
                  }
                  onSend();
                }}
                disabled={sendDisabled}
                accessibilityLabel={sendDisabled ? t.a11ySendDisabled : t.a11ySend}
                accessibilityRole="button"
                accessibilityState={{ disabled: sendDisabled }}
                accessibilityHint={sendDisabled ? t.a11ySendDisabledHint : t.a11ySendHint}
              >
                <Animated.View style={charPulseAnimStyle}>
                  <ArrowUp
                    size={18}
                    color={sendDisabled ? '#757585' : '#050507'}
                    importantForAccessibility="no"
                  />
                </Animated.View>
              </PressableOpacity>
            )}
          </View>
        </View>
      )}
    </>
  );

  if (!stickToKeyboard) {
    return content;
  }

  return <KeyboardStickyView>{content}</KeyboardStickyView>;
}));

export default ChatInputBar;

const s = StyleSheet.create({
  inputArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 6,
    backgroundColor: 'transparent',
    gap: 6,
  },
  iconBtn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: 12,
    backgroundColor: '#0F141B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,168,83,0.12)',
    flexShrink: 0,
  },
  textInput: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 6,
    paddingVertical: 6,
    color: '#F3F5F9',
    fontSize: Typography.size.base,
    fontFamily: Typography.fontFamily.regular,
    maxHeight: 110,
    minHeight: 32,
  },
  sendBtn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: MIN_TOUCH / 2,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    elevation: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  sendBtnDis: {
    backgroundColor: '#1A1F27',
    elevation: 0,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0C1016',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(212,168,83,0.10)',
    gap: 8,
    minHeight: MIN_TOUCH,
  },
  replyAccent: {
    width: 3,
    alignSelf: 'stretch',
    backgroundColor: '#7C3AED',
    borderRadius: 2,
  },
  replyName: {
    fontSize: Typography.size.xs,
    color: '#D4A853',
    fontFamily: Typography.fontFamily.semibold,
    marginBottom: 2,
  },
  replyText: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.regular,
    color: '#95A0B0',
  },
  replyCloseBtn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
  },
  deleteBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#050507',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(212,168,83,0.08)',
    minHeight: MIN_TOUCH,
  },
  deleteCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: MIN_TOUCH,
    borderRadius: Radius.md,
    backgroundColor: '#0C0C14',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
  },
  deleteCancelTxt: {
    color: '#C8C8D4',
    fontSize: Typography.size.md,
    fontFamily: Typography.fontFamily.regular,
  },
  deleteCountTxt: {
    flex: 1,
    textAlign: 'center',
    color: '#F0F0F5',
    fontSize: Typography.size.base,
    fontFamily: Typography.fontFamily.semibold,
  },
  deleteConfirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: MIN_TOUCH,
    borderRadius: Radius.md,
    backgroundColor: '#FF5555',
    justifyContent: 'center',
  },
  deleteBtnDis: {
    backgroundColor: 'rgba(255,85,85,0.12)',
  },
  charCount: {
    position: 'absolute',
    bottom: 48,
    right: 66,
    fontSize: 10,
    fontFamily: Typography.fontFamily.regular,
    color: '#A5AFBE',
    backgroundColor: 'rgba(12,16,22,0.92)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  charCountWarn: {
    color: '#FF6B6B',
  },
  deleteConfirmTxt: {
    color: '#0E0E14',
    fontSize: Typography.size.md,
    fontFamily: Typography.fontFamily.semibold,
  },
});

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
