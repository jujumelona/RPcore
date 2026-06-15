import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import SyntaxHighlighter from 'react-native-syntax-highlighter';
import { atomOneDark } from 'react-syntax-highlighter/dist/cjs/styles/hljs';
import { Copy, Check } from 'lucide-react-native';
import { Typo } from '../../../constants/tokens';
import Clipboard from '@react-native-clipboard/clipboard';
import type { Translations } from '../../../i18n/translations';

interface MarkdownCodeBlockProps {
  code: string;
  lang?: string;
  t?: Translations;
}

export const MarkdownCodeBlock: React.FC<MarkdownCodeBlockProps> = ({ code, lang = 'javascript', t }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    Clipboard.setString(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.langText}>{lang || 'code'}</Text>
        <TouchableOpacity style={styles.copyBtn} onPress={handleCopy} activeOpacity={0.7}>
          {copied ? <Check size={14} color="#66EE99" /> : <Copy size={14} color="#A0AAB8" />}
          <Text style={[styles.copyText, copied && { color: '#66EE99' }]}>
            {copied ? (t?.copied || 'Copied!') : (t?.copyCode || 'Copy Code')}
          </Text>
        </TouchableOpacity>
      </View>
      <SyntaxHighlighter
        language={lang || 'javascript'}
        style={atomOneDark}
        customStyle={styles.syntax}
        fontSize={13}
        highlighter={"hljs"}
      >
        {code}
      </SyntaxHighlighter>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1E1E24',
    borderWidth: 1,
    borderColor: '#2A2A35',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2A2A35',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  langText: {
    color: '#A0AAB8',
    fontSize: 11,
    fontFamily: Typo.fontFamily.medium,
    textTransform: 'uppercase',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  copyText: {
    color: '#A0AAB8',
    fontSize: 11,
    fontFamily: Typo.fontFamily.medium,
  },
  syntax: {
    padding: 12,
    margin: 0,
    backgroundColor: 'transparent',
  },
});
