import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import HighlightText from 'react-native-highlight-text';
import { MessageSquare, Share, Bookmark } from 'lucide-react-native';
import { useLanguageStore } from '../../store/languageStore';
interface NovelReaderProps {
  content: string;
  highlightedText?: string;
  onAnnotate?: (text: string) => void;
}
export function NovelReader({ content, highlightedText = '', onAnnotate }: NovelReaderProps) {
  const t = useLanguageStore(s => s.t);
  const handleHighlightPress = () => {
    if (highlightedText && onAnnotate) {
      onAnnotate(highlightedText);
    }
  };
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t?.readerSettingsReadingMode ?? ''}</Text>
      <View style={styles.textWrapper}>
        <HighlightText
          style={styles.novelText}
          highlightStyle={styles.highlightActive}
          // @ts-ignore react-native-highlight-text types are incomplete
          searchWords={[highlightedText]}
          textToHighlight={content}
        />
      </View>
      {highlightedText ? (
        <View style={styles.tooltipBar}>
          <TouchableOpacity style={styles.toolBtn} onPress={handleHighlightPress}>
            <MessageSquare size={16} color="#D4A853" />
            <Text style={styles.toolText}>{t?.comment ?? ''}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn}>
            <Bookmark size={16} color="#D0D0E0" />
            <Text style={styles.toolText}>{t?.bookmark ?? ''}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn}>
            <Share size={16} color="#D0D0E0" />
            <Text style={styles.toolText}>{t?.share ?? ''}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050507',
    padding: 24,
  },
  title: {
    color: '#7E7E92',
    fontSize: 14,
    marginBottom: 20,
    fontWeight: 'bold',
  },
  textWrapper: {
    flex: 1,
  },
  novelText: {
    color: '#E0E0EF',
    fontSize: 18,
    lineHeight: 32,
  },
  highlightActive: {
    backgroundColor: 'rgba(212, 168, 83, 0.3)',
    color: '#D4A853',
    fontWeight: 'bold',
  },
  tooltipBar: {
    flexDirection: 'row',
    backgroundColor: '#11111A',
    borderRadius: 30,
    paddingVertical: 10,
    paddingHorizontal: 20,
    justifyContent: 'space-around',
    alignItems: 'center',
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2A3A',
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 6,
  },
  toolText: {
    color: '#D0D0E0',
    fontSize: 14,
    fontWeight: '600',
  },
});