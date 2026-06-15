import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';
import { Search, StickyNote, Trash2 } from 'lucide-react-native';

import { Typography } from '../constants/tokens';
import { useHighlightStore, HIGHLIGHT_COLORS, type Highlight, type HighlightColor } from '../store/highlightStore';
import { useLanguageStore } from '../store/languageStore';

interface HighlightableTextProps {
  text: string;
  novelId: string;
  chapterId: string;
  style?: TextStyle;
  onSearchContext?: (text: string) => void;
}

interface HighlightMenuState {
  visible: boolean;
  selectedText: string;
  startOffset: number;
  endOffset: number;
}

interface Segment {
  text: string;
  highlight?: Highlight;
}

const COLOR_OPTIONS: HighlightColor[] = ['yellow', 'blue', 'green', 'pink'];

function buildSegments(text: string, highlights: Highlight[]): Segment[] {
  if (highlights.length === 0) {
    return [{ text }];
  }

  const sorted = [...highlights]
    .filter(item => item.startOffset >= 0 && item.endOffset <= text.length)
    .sort((left, right) => left.startOffset - right.startOffset);

  const segments: Segment[] = [];
  let cursor = 0;

  for (const highlight of sorted) {
    if (cursor < highlight.startOffset) {
      segments.push({ text: text.slice(cursor, highlight.startOffset) });
    }

    segments.push({
      text: text.slice(highlight.startOffset, highlight.endOffset),
      highlight,
    });
    cursor = highlight.endOffset;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor) });
  }

  return segments;
}

function ColorPicker({ onSelect }: { onSelect: (color: HighlightColor) => void }) {
  return (
    <View style={styles.colorRow}>
      {COLOR_OPTIONS.map(color => (
        <Pressable
          key={color}
          style={[
            styles.colorDot,
            { backgroundColor: HIGHLIGHT_COLORS[color].replace('40', 'AA') },
          ]}
          onPress={() => onSelect(color)}
        />
      ))}
    </View>
  );
}

export default function HighlightableText({
  text,
  novelId,
  chapterId,
  style,
  onSearchContext,
}: HighlightableTextProps) {
  const t = useLanguageStore(s => s.t);
  const { getChapterHighlights, addHighlight, removeHighlight, updateNote } = useHighlightStore();
  const highlights = useMemo(
    () => getChapterHighlights(novelId, chapterId),
    [chapterId, getChapterHighlights, novelId],
  );
  const segments = useMemo(() => buildSegments(text, highlights), [highlights, text]);
  const [menu, setMenu] = useState<HighlightMenuState>({
    visible: false,
    selectedText: '',
    startOffset: 0,
    endOffset: 0,
  });
  const [editHighlight, setEditHighlight] = useState<Highlight | null>(null);
  const [noteText, setNoteText] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);

  const closeSelectionMenu = useCallback(() => {
    setMenu({
      visible: false,
      selectedText: '',
      startOffset: 0,
      endOffset: 0,
    });
  }, []);

  const openEditHighlight = useCallback((highlight: Highlight) => {
    setEditHighlight(highlight);
    setNoteText(highlight.note ?? '');
    setShowNoteInput(false);
  }, []);

  const handleSearchContext = useCallback(() => {
    if (!menu.selectedText || !onSearchContext) {
      return;
    }

    onSearchContext(menu.selectedText);
    closeSelectionMenu();
  }, [closeSelectionMenu, menu.selectedText, onSearchContext]);

  const handleAddHighlight = useCallback((color: HighlightColor) => {
    if (!menu.selectedText) {
      return;
    }

    addHighlight({
      novelId,
      chapterId,
      text: menu.selectedText,
      startOffset: menu.startOffset,
      endOffset: menu.endOffset,
      color,
    });
    closeSelectionMenu();
  }, [addHighlight, chapterId, closeSelectionMenu, menu.endOffset, menu.selectedText, menu.startOffset, novelId]);

  const handleDeleteHighlight = useCallback(() => {
    if (!editHighlight) {
      return;
    }

    removeHighlight(novelId, chapterId, editHighlight.id);
    setEditHighlight(null);
    setShowNoteInput(false);
  }, [chapterId, editHighlight, novelId, removeHighlight]);

  const handleSaveNote = useCallback(() => {
    if (!editHighlight) {
      return;
    }

    updateNote(novelId, chapterId, editHighlight.id, noteText);
    setEditHighlight({ ...editHighlight, note: noteText });
    setShowNoteInput(false);
  }, [chapterId, editHighlight, noteText, novelId, updateNote]);

  return (
    <View>
      <Text style={[styles.text, style]} selectable>
        {segments.map((segment, index) => (
          segment.highlight ? (
            <Text
              key={`${segment.highlight.id}:${index}`}
              style={{ backgroundColor: HIGHLIGHT_COLORS[segment.highlight.color] }}
              onPress={() => openEditHighlight(segment.highlight!)}
            >
              {segment.text}
            </Text>
          ) : (
            <Text key={`segment:${index}`}>{segment.text}</Text>
          )
        ))}
      </Text>

      <Modal transparent visible={menu.visible} animationType="fade" onRequestClose={closeSelectionMenu}>
        <Pressable style={styles.menuBackdrop} onPress={closeSelectionMenu}>
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>{t?.highlightTitle ?? ''}</Text>
            <Text style={styles.menuPreview} numberOfLines={2}>
              "{menu.selectedText}"
            </Text>

            <Pressable
              style={({ pressed }) => [styles.searchBtn, pressed && styles.searchBtnPressed]}
              onPress={handleSearchContext}
            >
              <View style={styles.inlineRow}>
                <Search size={13} color="#D4A853" />
                <Text style={styles.searchBtnText}>{t?.highlightSearchContext ?? ''}</Text>
              </View>
            </Pressable>

            <View style={styles.menuDivider} />
            <Text style={styles.menuSubTitle}>{t?.highlightAdd ?? ''}</Text>
            <ColorPicker onSelect={handleAddHighlight} />
          </View>
        </Pressable>
      </Modal>

      <Modal
        transparent
        visible={!!editHighlight}
        animationType="fade"
        onRequestClose={() => setEditHighlight(null)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setEditHighlight(null)}>
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>{t?.highlightEdit ?? ''}</Text>
            <Text style={styles.menuPreview} numberOfLines={2}>
              "{editHighlight?.text}"
            </Text>

            {showNoteInput ? (
              <View style={styles.noteInputWrap}>
                <TextInput
                  style={styles.noteInput}
                  placeholder={t?.highlightNotePlaceholder ?? ''}
                  placeholderTextColor="#666"
                  value={noteText}
                  onChangeText={setNoteText}
                  multiline
                  autoFocus
                />
                <Pressable style={styles.noteSaveBtn} onPress={handleSaveNote}>
                  <Text style={styles.noteSaveBtnText}>{t?.save ?? ''}</Text>
                </Pressable>
              </View>
            ) : (
              <>
                {editHighlight?.note ? (
                  <View style={styles.noteDisplay}>
                    <View style={styles.inlineRow}>
                      <StickyNote size={12} color="#D4A853" />
                      <Text style={styles.noteText}>{editHighlight.note}</Text>
                    </View>
                  </View>
                ) : null}
                <Pressable style={styles.addNoteBtn} onPress={() => setShowNoteInput(true)}>
                  <View style={styles.inlineRow}>
                    <StickyNote size={13} color="#AAA" />
                    <Text style={styles.addNoteBtnText}>
                      {editHighlight?.note ? (t?.highlightEditNote ?? '') : (t?.highlightAddNote ?? '')}
                    </Text>
                  </View>
                </Pressable>
              </>
            )}

            <Pressable style={styles.deleteBtn} onPress={handleDeleteHighlight}>
              <View style={styles.inlineRow}>
                <Trash2 size={13} color="#E91E63" />
                <Text style={styles.deleteBtnText}>{t?.highlightDelete ?? t?.delete ?? ''}</Text>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 16,
    color: '#E8E6E3',
    lineHeight: 28,
    fontFamily: Typography.fontFamily.regular,
  },
  menuBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  menuCard: {
    width: 280,
    alignItems: 'center',
    backgroundColor: '#1A1A1E',
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: '#333',
    padding: 20,
  },
  menuTitle: {
    marginBottom: 10,
    fontSize: 15,
    fontWeight: '700',
    color: '#E8E6E3',
  },
  menuPreview: {
    marginBottom: 14,
    fontSize: 13,
    lineHeight: 18,
    color: '#999',
    textAlign: 'center',
  },
  menuDivider: {
    width: '100%',
    height: 1,
    marginBottom: 16,
    backgroundColor: '#333',
  },
  menuSubTitle: {
    alignSelf: 'flex-start',
    marginBottom: 8,
    fontSize: 12,
    color: '#777',
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBtn: {
    width: '100%',
    marginBottom: 16,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.4)',
    backgroundColor: 'rgba(212,168,83,0.15)',
    paddingVertical: 12,
  },
  searchBtnPressed: {
    backgroundColor: 'rgba(212,168,83,0.25)',
  },
  searchBtnText: {
    color: '#D4A853',
    fontSize: 13,
    fontFamily: Typography.fontFamily.semibold,
  },
  colorRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#333',
  },
  noteDisplay: {
    width: '100%',
    marginBottom: 8,
  },
  noteText: {
    flex: 1,
    color: '#D4A853',
    fontSize: 12,
    lineHeight: 18,
  },
  addNoteBtn: {
    width: '100%',
    marginBottom: 8,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 10,
  },
  addNoteBtnText: {
    color: '#AAA',
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
  },
  noteInputWrap: {
    width: '100%',
    marginBottom: 12,
  },
  noteInput: {
    width: '100%',
    minHeight: 60,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#444',
    backgroundColor: '#111116',
    color: '#E8E6E3',
    fontSize: 13,
    fontFamily: Typography.fontFamily.regular,
    padding: 10,
    textAlignVertical: 'top',
  },
  noteSaveBtn: {
    alignSelf: 'flex-end',
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.4)',
    backgroundColor: 'rgba(212,168,83,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  noteSaveBtnText: {
    color: '#D4A853',
    fontSize: 12,
    fontFamily: Typography.fontFamily.semibold,
  },
  deleteBtn: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E91E6350',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  deleteBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E91E63',
  },
});
