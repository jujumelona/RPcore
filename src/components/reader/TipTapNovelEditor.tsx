import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  Bold,
  FileText,
  Heading1,
  Heading2,
  Italic,
  Minus,
  Quote,
  RotateCcw,
  Save,
  Trash2,
  Underline,
} from 'lucide-react-native';

import { Radius, Typography, Typo } from '../../constants/tokens';
import { useLanguageStore } from '../../store/languageStore';
import { appStorage } from '../../utils/storage';

interface TipTapNovelEditorProps {
  content: string;
  onChangeContent: (text: string) => void;
  novelId?: string;
  editable?: boolean;
}

type FormatAction = 'bold' | 'italic' | 'underline' | 'h1' | 'h2' | 'quote' | 'divider';

interface ToolItem {
  action: FormatAction;
  icon: React.ReactNode;
}

const DRAFT_PREFIX = '@novel_draft_';
const DEFAULT_DRAFT_ID = '0';
const ICON_SIZE = 16;
const ICON_COLOR = '#D4A853';
const TOOLS: ToolItem[] = [
  { action: 'bold', icon: <Bold size={ICON_SIZE} color={ICON_COLOR} /> },
  { action: 'italic', icon: <Italic size={ICON_SIZE} color={ICON_COLOR} /> },
  { action: 'underline', icon: <Underline size={ICON_SIZE} color={ICON_COLOR} /> },
  { action: 'h1', icon: <Heading1 size={ICON_SIZE} color={ICON_COLOR} /> },
  { action: 'h2', icon: <Heading2 size={ICON_SIZE} color={ICON_COLOR} /> },
  { action: 'quote', icon: <Quote size={ICON_SIZE} color={ICON_COLOR} /> },
  { action: 'divider', icon: <Minus size={ICON_SIZE} color={ICON_COLOR} /> },
];

function getDraftKey(id?: string) {
  return `${DRAFT_PREFIX}${id || DEFAULT_DRAFT_ID}`;
}

function applyFormat(text: string, selStart: number, selEnd: number, action: FormatAction): { text: string; cursor: number } {
  const selected = text.slice(selStart, selEnd);
  const before = text.slice(0, selStart);
  const after = text.slice(selEnd);

  switch (action) {
    case 'bold':
      return { text: `${before}**${selected || 'text'}**${after}`, cursor: selStart + 2 };
    case 'italic':
      return { text: `${before}_${selected || 'text'}_${after}`, cursor: selStart + 1 };
    case 'underline':
      return { text: `${before}<u>${selected || 'text'}</u>${after}`, cursor: selStart + 3 };
    case 'h1': {
      const lineStart = text.lastIndexOf('\n', selStart - 1) + 1;
      return { text: `${text.slice(0, lineStart)}# ${text.slice(lineStart)}`, cursor: selStart + 2 };
    }
    case 'h2': {
      const lineStart = text.lastIndexOf('\n', selStart - 1) + 1;
      return { text: `${text.slice(0, lineStart)}## ${text.slice(lineStart)}`, cursor: selStart + 3 };
    }
    case 'quote': {
      const lineStart = text.lastIndexOf('\n', selStart - 1) + 1;
      return { text: `${text.slice(0, lineStart)}> ${text.slice(lineStart)}`, cursor: selStart + 2 };
    }
    case 'divider':
      return { text: `${before}\n\n---\n\n${after}`, cursor: selStart + 6 };
    default:
      return { text, cursor: selEnd };
  }
}

function countStats(text: string) {
  return {
    chars: text.length,
    words: text.trim().split(/\s+/).filter(Boolean).length,
  };
}

export function TipTapNovelEditor({
  content,
  onChangeContent,
  novelId,
  editable = true,
}: TipTapNovelEditorProps) {
  const t = useLanguageStore(s => s.t);
  const inputRef = useRef<TextInput>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const stats = useMemo(() => countStats(content), [content]);
  const toolbarOpacity = useSharedValue(1);
  const toolbarStyle = useAnimatedStyle(() => ({ opacity: toolbarOpacity.value }));

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      toolbarOpacity.value = withTiming(1, { duration: 150 });
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      toolbarOpacity.value = withTiming(0.6, { duration: 200 });
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [toolbarOpacity]);

  useEffect(() => {
    if (!novelId) {
      return;
    }

    try {
      const savedDraft = appStorage.getString(getDraftKey(novelId));
      if (savedDraft && savedDraft !== content && content.length === 0) {
        setShowDraftBanner(true);
      }
    } catch {}
  }, [content, novelId]);

  const restoreDraft = useCallback(() => {
    if (!novelId) {
      return;
    }

    try {
      const savedDraft = appStorage.getString(getDraftKey(novelId));
      if (savedDraft) {
        onChangeContent(savedDraft);
        setShowDraftBanner(false);
      }
    } catch {}
  }, [novelId, onChangeContent]);

  const dismissDraft = useCallback(() => {
    setShowDraftBanner(false);
    if (!novelId) {
      return;
    }

    try {
      appStorage.delete(getDraftKey(novelId));
    } catch {}
  }, [novelId]);

  useEffect(() => {
    if (!novelId || !content || content.length < 10) {
      return;
    }

    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
    }

    autoSaveTimer.current = setTimeout(() => {
      try {
        appStorage.set(getDraftKey(novelId), content);
        const now = new Date();
        setLastSavedAt(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
      } catch {}
    }, 5000);

    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
    };
  }, [content, novelId]);

  const handleManualSave = useCallback(() => {
    if (!novelId || !content) {
      return;
    }

    try {
      appStorage.set(getDraftKey(novelId), content);
      const now = new Date();
      setLastSavedAt(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
    } catch {}
  }, [content, novelId]);

  const handleFormat = useCallback((action: FormatAction) => {
    const { start, end } = selectionRef.current;
    const result = applyFormat(content, start, end, action);
    onChangeContent(result.text);

    setTimeout(() => {
      inputRef.current?.setNativeProps({ selection: { start: result.cursor, end: result.cursor } });
    }, 50);
  }, [content, onChangeContent]);

  const handleSelection = useCallback((event: any) => {
    selectionRef.current = event.nativeEvent.selection;
  }, []);

  return (
    <View style={styles.container}>
      {showDraftBanner && (
        <Animated.View entering={FadeInDown.springify()} style={styles.draftBanner}>
          <View style={styles.draftBannerRow}>
            <RotateCcw size={14} color="#D4A853" />
            <Text style={styles.draftBannerText}>{t?.draftFound ?? ''}</Text>
          </View>
          <View style={styles.draftBannerButtons}>
            <TouchableOpacity style={styles.draftBtnRestore} onPress={restoreDraft}>
              <Text style={styles.draftBtnRestoreText}>{t?.draftRestore ?? ''}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.draftBtnDismiss} onPress={dismissDraft}>
              <Trash2 size={12} color="#8A8A9E" />
              <Text style={styles.draftBtnDismissText}>{t?.draftDiscard ?? ''}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      <Animated.View style={[styles.toolbar, toolbarStyle]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolScroll}>
          {TOOLS.map(tool => (
            <TouchableOpacity
              key={tool.action}
              style={styles.toolBtn}
              onPress={() => handleFormat(tool.action)}
              activeOpacity={0.6}
            >
              {tool.icon}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.saveBtn} onPress={handleManualSave}>
            <Save size={14} color="#D4A853" />
            <Text style={styles.saveBtnText}>{t?.saveDraft ?? t?.save ?? ''}</Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>

      <TextInput
        ref={inputRef}
        style={styles.textInput}
        multiline
        editable={editable}
        placeholder={t?.tipTapPlaceholder ?? ''}
        placeholderTextColor="#8A8A9E"
        value={content}
        onChangeText={onChangeContent}
        onSelectionChange={handleSelection}
        textAlignVertical="top"
        autoCorrect={false}
        scrollEnabled
      />

      <View style={styles.statusBar}>
        <View style={styles.statusLeft}>
          <FileText size={11} color="#8A8A9E" />
          <Text style={styles.statusText}>
            {stats.chars.toLocaleString()} {t?.editorChars ?? ''} / {stats.words.toLocaleString()} {t?.editorWords ?? ''}
          </Text>
        </View>
        {lastSavedAt ? (
          <Animated.Text entering={FadeIn} style={styles.autoSaveText}>
            {t?.editorAutoSaved ?? ''} {lastSavedAt}
          </Animated.Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 400,
    overflow: 'hidden',
    backgroundColor: '#0C0C14',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.30)',
  },
  draftBanner: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(212,168,83,0.12)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212,168,83,0.25)',
  },
  draftBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  draftBannerText: {
    flex: 1,
    color: '#D4A853',
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
  },
  draftBannerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  draftBtnRestore: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: 'rgba(212,168,83,0.20)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.40)',
  },
  draftBtnRestoreText: {
    color: '#D4A853',
    fontSize: 12,
    fontFamily: Typography.fontFamily.semibold,
  },
  draftBtnDismiss: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  draftBtnDismissText: {
    color: '#8A8A9E',
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
  },
  toolbar: {
    backgroundColor: '#1A1A24',
    borderBottomWidth: 1,
    borderBottomColor: '#303040',
  },
  toolScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  toolBtn: {
    minWidth: 38,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    marginLeft: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(212,168,83,0.12)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.30)',
  },
  saveBtnText: {
    color: '#D4A853',
    fontSize: 12,
    fontFamily: Typography.fontFamily.semibold,
  },
  textInput: {
    flex: 1,
    padding: 16,
    color: '#F0F0F5',
    fontSize: Typo.size.md,
    fontFamily: Typography.fontFamily.medium,
    lineHeight: 26,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#1A1A24',
    borderTopWidth: 1,
    borderTopColor: '#303040',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    color: '#8A8A9E',
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
  },
  autoSaveText: {
    color: '#5A9E6F',
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
  },
});
