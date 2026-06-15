import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { RichEditor, RichToolbar, actions } from 'react-native-pell-rich-editor';
import {
  Bold,
  Heading,
  Image as ImageIcon,
  Italic,
  Link,
  Quote,
  Strikethrough,
  Underline,
} from 'lucide-react-native';

import { useLanguageStore } from '../../store/languageStore';

interface NovelEditorProps {
  initialContent?: string;
  onSave?: (html: string) => void;
}

export function NovelEditor({ initialContent = '', onSave }: NovelEditorProps) {
  const editorRef = useRef<RichEditor>(null);
  const [content, setContent] = useState(initialContent);
  const { isRTL, t } = useLanguageStore(state => ({ isRTL: state.isRTL, t: state.t }));

  const iconMap = {
    [actions.setBold]: () => <Bold size={20} color="#D0D0E0" />,
    [actions.setItalic]: () => <Italic size={20} color="#D0D0E0" />,
    [actions.setUnderline]: () => <Underline size={20} color="#D0D0E0" />,
    [actions.setStrikethrough]: () => <Strikethrough size={20} color="#D0D0E0" />,
    [actions.heading1]: () => <Heading size={20} color="#D0D0E0" />,
    [actions.insertImage]: () => <ImageIcon size={20} color="#D0D0E0" />,
    [actions.blockquote]: () => <Quote size={20} color="#D0D0E0" />,
    [actions.insertLink]: () => <Link size={20} color="#D0D0E0" />,
  };

  const editorCss = `body { font-family: sans-serif; font-size: 16px; line-height: 1.6; direction: ${isRTL ? 'rtl' : 'ltr'}; }`;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <RichToolbar
        editor={editorRef}
        actions={[
          actions.setBold,
          actions.setItalic,
          actions.setUnderline,
          actions.setStrikethrough,
          actions.heading1,
          actions.blockquote,
          actions.insertLink,
          actions.insertImage,
        ]}
        iconMap={iconMap}
        style={styles.toolbar}
        unselectedButtonStyle={styles.button}
        selectedButtonStyle={styles.buttonSelected}
      />

      <ScrollView style={styles.scrollWrapper}>
        <RichEditor
          ref={editorRef}
          initialContentHTML={content}
          onChange={html => setContent(html)}
          placeholder={t?.tipTapPlaceholder ?? ''}
          style={styles.editor}
          editorStyle={{
            backgroundColor: '#050507',
            color: '#E0E0EF',
            placeholderColor: '#4A4A5A',
            cssText: editorCss,
          }}
        />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.saveButton} onPress={() => onSave?.(content)}>
          <Text style={styles.saveText}>{t?.save ?? ''}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050507',
  },
  toolbar: {
    backgroundColor: '#11111A',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A3A',
  },
  button: {
    padding: 8,
  },
  buttonSelected: {
    padding: 8,
    backgroundColor: '#D4A853',
    borderRadius: 8,
  },
  scrollWrapper: {
    flex: 1,
    padding: 16,
  },
  editor: {
    flex: 1,
    minHeight: 400,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#2A2A3A',
    backgroundColor: '#0A0A0F',
  },
  saveButton: {
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#D4A853',
    paddingVertical: 14,
  },
  saveText: {
    color: '#050507',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
