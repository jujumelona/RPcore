import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Modal, TouchableWithoutFeedback } from 'react-native';
import Animated, {
  SlideInDown,
  SlideOutDown,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  withTiming,
  runOnJS
} from 'react-native-reanimated';
import { Copy, Bookmark, BookmarkCheck, CornerDownLeft, PenLine, Trash2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Typo, Typography } from '../../../constants/tokens';
import { useLanguageStore } from '../../../store/languageStore';
import type { ChatMessage } from '../types/ChatMessageTypes';

interface MessageActionSheetProps {
  message: ChatMessage | null;
  onClose: () => void;
  onReply?: (message: ChatMessage) => void;
  onCopy?: (content: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  onBookmark?: (messageId: string) => void;
}

export function MessageActionSheet({
  message,
  onClose,
  onReply,
  onCopy,
  onEdit,
  onBookmark,
}: MessageActionSheetProps) {
  const insets = useSafeAreaInsets();
  const t = useLanguageStore(s => s.t);
  const [isVisible, setIsVisible] = React.useState(false);
  const closing = useSharedValue(false);

  React.useEffect(() => {
    if (message) {
      setIsVisible(true);
      closing.value = false;
    }
  }, [message, closing]);

  const handleClose = () => {
    closing.value = true;
    setTimeout(() => {
      setIsVisible(false);
      onClose();
    }, 300); // Wait for animated exit
  };

  if (!message || !isVisible) return null;

  const isUser = message.role === 'user';
  const isBookmarked = message.bookmarked || message.isImportant;

  return (
    <Modal visible={true} transparent animationType="none" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <View style={styles.sheetContainer} pointerEvents="box-none">
        <Animated.View
          entering={SlideInDown.springify().damping(22).stiffness(200)}
          exiting={SlideOutDown.duration(200)}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) + 10 }]}
        >
          <View style={styles.dragPill} />
          
          <View style={styles.actionList}>
            {onReply && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnAccent]}
                onPress={() => {
                  onReply(message);
                  handleClose();
                }}
              >
                <CornerDownLeft size={20} color="#D4A853" />
                <Text style={[styles.actionBtnLabel, styles.actionBtnLabelAccent]}>
                  {t.reply}
                </Text>
              </TouchableOpacity>
            )}

            {onCopy && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => {
                  onCopy(message.content ?? '');
                  handleClose();
                }}
              >
                <Copy size={20} color="#C7D0DF" />
                <Text style={styles.actionBtnLabel}>{t.copy}</Text>
              </TouchableOpacity>
            )}

            {isUser && onEdit && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => {
                  onEdit(message.id, message.content ?? '');
                  handleClose();
                }}
              >
                <PenLine size={20} color="#C7D0DF" />
                <Text style={styles.actionBtnLabel}>{t.editMessage}</Text>
              </TouchableOpacity>
            )}

            {onBookmark && (
              <TouchableOpacity
                style={[styles.actionBtn, isBookmarked && styles.actionBtnAccent]}
                onPress={() => {
                  onBookmark(message.id);
                  handleClose();
                }}
              >
                {isBookmarked ? (
                  <BookmarkCheck size={20} color="#D4A853" />
                ) : (
                  <Bookmark size={20} color="#C7D0DF" />
                )}
                <Text style={[styles.actionBtnLabel, isBookmarked && styles.actionBtnLabelAccent]}>
                  {t.bookmark}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheetContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1E1E28',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  dragPill: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3E3E4E',
    alignSelf: 'center',
    marginBottom: 20,
  },
  actionList: {
    gap: 6,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    gap: 12,
  },
  actionBtnAccent: {
    backgroundColor: 'rgba(212, 168, 83, 0.1)',
  },
  actionBtnLabel: {
    fontSize: 16,
    color: '#E0E0EF',
    fontFamily: Typo.fontFamily.medium,
  },
  actionBtnLabelAccent: {
    color: '#D4A853',
    fontFamily: Typo.fontFamily.semibold,
  },
});
