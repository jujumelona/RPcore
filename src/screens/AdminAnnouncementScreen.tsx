
/* eslint-disable @typescript-eslint/no-unused-vars */

import React, { useState, useCallback } from 'react';
import { View,
  Text,
  TextInput,
  StyleSheet,
  StatusBar,
  ScrollView,
  Modal } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';

import { clipboardSetString } from '../utils/ClipboardUtils';

import { Space, Radius, Typography } from '../constants/tokens';
import { ToastService } from '../components/Toast';
import { useAuthStore } from '../store/authStore';
import { useLanguageStore } from '../store/languageStore';
import { createAnnouncement, type AnnouncementTranslations } from '../api/AnnouncementsAPI';
import { SUPPORTED_LANGUAGES } from '../i18n/supportedLanguages';
import { CircleAlert, ArrowLeft, CircleCheckBig, Copy, Megaphone, X } from 'lucide-react-native';
import { PremiumBackdrop } from '../components/ui/PremiumSurface';
import { Spinner } from '../components/ui/Spinner';
import { PressableOpacity } from '../components/PressableOpacity';
import type { ScreenProps } from '../types/navigation';

function buildTranslationPrompt(titleSource: string, bodySource: string): string {
  const languageCodes = SUPPORTED_LANGUAGES.map(language => `"${language.code}"`).join(', ');
  return [
    `Translate this announcement into all supported language codes: ${languageCodes}`,
    '',
    'Return valid JSON only. No markdown, no code block, no extra explanation.',
    '',
    `SOURCE_TITLE: ${titleSource}`,
    `SOURCE_BODY: ${bodySource}`,
    '',
    'Output shape:',
    '{',
    `  "ko": { "title": "${titleSource}", "body": "${bodySource}" },`,
    '  "en": { "title": "...", "body": "..." },',
    '  "ja": { "title": "...", "body": "..." },',
    '  ...',
    '}',
  ].join('\n');
}

function validateTranslations(
  raw: string,
  labels: { parseFailed: string; missingBlocks: string },
): {
  ok: boolean;
  data?: AnnouncementTranslations;
  missing?: string[];
  error?: string;
} {
  let parsed: Record<string, unknown>;
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(clean);
  } catch {
    return { ok: false, error: labels.parseFailed };
  }

  const missing: string[] = [];
  for (const language of SUPPORTED_LANGUAGES) {
    const block = parsed[language.code] as { title?: string; body?: string } | undefined;
    if (!block?.title || !block?.body) {
      missing.push(language.code);
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      error: labels.missingBlocks.replace('{codes}', missing.join(', ')),
    };
  }

  return { ok: true, data: parsed as AnnouncementTranslations };
}

export function AdminAnnouncementScreen({ navigation }: ScreenProps<'AdminAnnouncement'>) {
  const user = useAuthStore(state => state.user);
  const token = (user as unknown as Record<string, unknown>)?.jwtToken as string ?? (user as unknown as Record<string, unknown>)?.token as string ?? '';
  const t = useLanguageStore(s => s.t);

  const [titleSource, setTitleSource] = useState('');
  const [bodySource, setBodySource] = useState('');

  const [jsonInput, setJsonInput] = useState('');
  const [jsonValid, setJsonValid] = useState<boolean | null>(null);
  const [jsonError, setJsonError] = useState('');
  const [parsedData, setParsedData] = useState<AnnouncementTranslations | null>(null);

  const [previewLang, setPreviewLang] = useState('en');
  const [previewModal, setPreviewModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const jsonExamplePlaceholder = [
    '{',
    '  "ko": { "title": "...", "body": "..." },',
    '  "en": { "title": "...", "body": "..." },',
    '  ...',
    '}',
  ].join('\n');

  const canCopyPrompt = titleSource.trim().length > 0 && bodySource.trim().length > 0;

  const labels = {
    title: (t as unknown as Record<string, string>).adminAnnouncementTitle ?? '',
    sourceStep: (t as unknown as Record<string, string>).adminAnnouncementSourceStep ?? '',
    translateStep: (t as unknown as Record<string, string>).adminAnnouncementTranslateStep ?? '',
    validateStep: (t as unknown as Record<string, string>).adminAnnouncementValidateStep ?? '',
    sourceTitle: (t as unknown as Record<string, string>).adminAnnouncementSourceTitle ?? '',
    sourceBody: (t as unknown as Record<string, string>).adminAnnouncementSourceBody ?? '',
    sourceTitlePlaceholder: (t as unknown as Record<string, string>).adminAnnouncementTitlePlaceholder ?? '',
    sourceBodyPlaceholder: (t as unknown as Record<string, string>).adminAnnouncementBodyPlaceholder ?? '',
    copyPrompt: (t as unknown as Record<string, string>).adminAnnouncementCopyPrompt ?? '',
    copiedPrompt: (t as unknown as Record<string, string>).adminAnnouncementPromptCopied ?? '',
    promptHint: (t as unknown as Record<string, string>).adminAnnouncementPromptHint ?? '',
    validateJson: (t as unknown as Record<string, string>).adminAnnouncementValidateJson ?? '',
    validJson: (t as unknown as Record<string, string>).adminAnnouncementValidJson ?? '',
    submit: (t as unknown as Record<string, string>).adminAnnouncementSubmit ?? '',
    created: (t as unknown as Record<string, string>).adminAnnouncementCreated ?? '',
    failed: t?.errorOccurred ?? '',
    preview: (t as unknown as Record<string, string>).adminAnnouncementPreview ?? '',
    close: t?.close ?? '',
    readyToSubmit: (t as unknown as Record<string, string>).adminAnnouncementReady ?? '',
    parseFailed: (t as unknown as Record<string, string>).adminAnnouncementParseFailed ?? '',
    missingBlocks: (t as unknown as Record<string, string>).adminAnnouncementMissingBlocks ?? '',
  };

  const handleCopyPrompt = useCallback(() => {
    if (!canCopyPrompt) return;
    const prompt = buildTranslationPrompt(titleSource.trim(), bodySource.trim());
    clipboardSetString(prompt);
    ToastService.success(labels.copiedPrompt);
  }, [canCopyPrompt, labels.copiedPrompt, titleSource, bodySource]);

  const handleValidateJson = useCallback(() => {
    if (!jsonInput.trim()) return;

    const result = validateTranslations(jsonInput, labels);
    setJsonValid(result.ok);
    setJsonError(result.error ?? '');
    setParsedData(result.data ?? null);

    if (result.ok) {
      ToastService.success(labels.validJson);
    }
  }, [jsonInput, labels]);

  const handleSubmit = useCallback(async () => {
    if (!parsedData || submitting) return;

    setSubmitting(true);
    try {
      const response = await createAnnouncement(parsedData, token);
      if (response.success) {
        ToastService.success(labels.created);
        navigation.goBack();
      } else {
        ToastService.error(response.error ?? labels.failed);
      }
    } finally {
      setSubmitting(false);
    }
  }, [parsedData, submitting, token, labels.created, labels.failed, navigation]);

  return (
    <View style={styles.backdropRoot}>
      <PremiumBackdrop animated />
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
    <SafeAreaView style={styles._flex}>
      <KeyboardAvoidingView style={styles._flex1} behavior="padding">
        <Animated.View entering={FadeIn.duration(180)} style={styles.header}>
          <PressableOpacity activeOpacity={1} style={styles.backButton} onPress={() => navigation.goBack()}>
            <ArrowLeft size={22} color={'#F0F0F5'} />
          </PressableOpacity>
          <Text style={styles.headerTitle}>{labels.title}</Text>
          <View style={styles._width} />
        </Animated.View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInDown.delay(40).duration(240)} style={styles.stepCard}>
            <View style={styles.stepHeader}>
              <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>1</Text></View>
              <Text style={styles.stepTitle}>{labels.sourceStep}</Text>
            </View>

            <Text style={styles.fieldLabel}>{labels.sourceTitle}</Text>
            <TextInput
              style={styles.titleInput}
              value={titleSource}
              onChangeText={text => {
                setTitleSource(text);
                setJsonValid(null);
                setParsedData(null);
              }}
              placeholder={labels.sourceTitlePlaceholder}
              placeholderTextColor={'#797990'}
              maxLength={80}
            />

            <Text style={styles.fieldLabel}>{labels.sourceBody}</Text>
            <TextInput
              style={styles.bodyInput}
              value={bodySource}
              onChangeText={text => {
                setBodySource(text);
                setJsonValid(null);
                setParsedData(null);
              }}
              placeholder={labels.sourceBodyPlaceholder}
              placeholderTextColor={'#797990'}
              multiline
              textAlignVertical="top"
              maxLength={2000}
            />
            <Text style={styles.characterCount}>{bodySource.length}/2000</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(80).duration(240)} style={styles.stepCard}>
            <View style={styles.stepHeader}>
              <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>2</Text></View>
              <Text style={styles.stepTitle}>{labels.translateStep}</Text>
            </View>

            <Text style={styles.stepDescription}>{labels.promptHint}</Text>

            <PressableOpacity
              style={[styles.actionButton, !canCopyPrompt && styles.disabled]}
              onPress={handleCopyPrompt}
              disabled={!canCopyPrompt}
              activeOpacity={0.8}
            >
              <Copy size={18} color={canCopyPrompt ? '#D4A853' : '#797990'} />
              <Text style={[styles.actionButtonText, !canCopyPrompt && { color: '#797990' }]}>{labels.copyPrompt}</Text>
            </PressableOpacity>

            {canCopyPrompt && (
              <View style={styles.promptPreview}>
                <Text style={styles.promptPreviewText} numberOfLines={3}>
                  {buildTranslationPrompt(titleSource, bodySource).slice(0, 180)}...
                </Text>
              </View>
            )}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).duration(240)} style={styles.stepCard}>
            <View style={styles.stepHeader}>
              <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>3</Text></View>
              <Text style={styles.stepTitle}>{labels.validateStep}</Text>
            </View>

            <TextInput
              style={styles.jsonInput}
              value={jsonInput}
              onChangeText={value => {
                setJsonInput(value);
                setJsonValid(null);
                setParsedData(null);
              }}
              placeholder={jsonExamplePlaceholder}
              placeholderTextColor={'#797990'}
              multiline
              textAlignVertical="top"
              autoCorrect={false}
              autoCapitalize="none"
            />

            <PressableOpacity
              style={[styles.actionButton, !jsonInput.trim() && styles.disabled]}
              onPress={handleValidateJson}
              disabled={!jsonInput.trim()}
              activeOpacity={0.8}
            >
              <CircleCheckBig size={18} color={jsonInput.trim() ? '#D4A853' : '#797990'} />
              <Text style={[styles.actionButtonText, !jsonInput.trim() && { color: '#797990' }]}>{labels.validateJson}</Text>
            </PressableOpacity>

            {jsonValid === true && parsedData && (
              <View style={styles.validResult}>
                <CircleCheckBig size={16} color={'#4ADE80'} />
                <Text style={styles.validResultText}>{labels.validJson}</Text>
                <PressableOpacity activeOpacity={1} onPress={() => setPreviewModal(true)} style={styles.previewLink}>
                  <Text style={styles.previewLinkText}>{labels.preview}</Text>
                </PressableOpacity>
              </View>
            )}

            {jsonValid === false && (
              <View style={styles.invalidResult}>
                <CircleAlert size={16} color={'#FF5555'} />
                <Text style={styles.invalidResultText}>{jsonError}</Text>
              </View>
            )}
          </Animated.View>
        </ScrollView>

        <View style={styles.footer}>
          <PressableOpacity
            style={[styles.submitButton, (!parsedData || submitting) && styles.disabled]}
            onPress={handleSubmit}
            disabled={!parsedData || submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <Spinner color={'#050507'} />
            ) : (
              <>
                <Megaphone size={18} color={parsedData ? '#050507' : '#797990'} />
                <Text style={[styles.submitText, !parsedData && { color: '#797990' }]}>
                  {parsedData ? labels.submit : labels.readyToSubmit}
                </Text>
              </>
            )}
          </PressableOpacity>
        </View>

      <Modal visible={previewModal} transparent animationType="slide" onRequestClose={() => setPreviewModal(false)}>
        <View style={previewStyles.overlay}>
          <View style={previewStyles.sheet}>
            <View style={previewStyles.sheetHeader}>
              <Text style={previewStyles.sheetTitle}>{labels.preview}</Text>
              <PressableOpacity activeOpacity={1} onPress={() => setPreviewModal(false)} style={previewStyles.closeButton}>
                <X size={22} color={'#F0F0F5'} />
              </PressableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={previewStyles.langScroll} contentContainerStyle={previewStyles.langRow}>
              {SUPPORTED_LANGUAGES.map(language => (
                <PressableOpacity
                  activeOpacity={1}
                  key={language.code}
                  style={[previewStyles.langChip, previewLang === language.code && previewStyles.langChipActive]}
                  onPress={() => setPreviewLang(language.code)}
                >
                  <Text style={previewStyles.langChipFlag}>{language.flag}</Text>
                  <Text style={[previewStyles.langChipText, previewLang === language.code && previewStyles.langChipTextActive]}>
                    {language.code}
                  </Text>
                </PressableOpacity>
              ))}
            </ScrollView>

            {parsedData && parsedData[previewLang] && (
              <ScrollView style={previewStyles.previewScroll} contentContainerStyle={previewStyles.previewContent}>
                <Text style={previewStyles.previewLangName}>
                  {SUPPORTED_LANGUAGES.find(language => language.code === previewLang)?.flag} {SUPPORTED_LANGUAGES.find(language => language.code === previewLang)?.label}
                </Text>
                <Text style={previewStyles.previewTitle}>{parsedData[previewLang].title}</Text>
                <View style={previewStyles.previewDivider} />
                <Text style={previewStyles.previewBody}>{parsedData[previewLang].body}</Text>
              </ScrollView>
            )}

            <PressableOpacity activeOpacity={0.8} style={previewStyles.closeFooterButton} onPress={() => setPreviewModal(false)}>
              <Text style={previewStyles.closeFooterText}>{labels.close}</Text>
            </PressableOpacity>
          </View>
        </View>
      </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdropRoot: { flex: 1, backgroundColor: '#050507' },
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space['4'],
    height: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1A1A24' },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },

  scroll: { flex: 1 },
  content: { padding: Space['4'], gap: Space['3'], paddingBottom: 40 },

  stepCard: {
    backgroundColor: '#0C0C14',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#1A1A24',
    padding: Space['4'],
    gap: Space['3'] },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#D4A853', alignItems: 'center', justifyContent: 'center' },
  stepBadgeText: { fontSize: 13, fontFamily: Typography.fontFamily.extrabold, color: '#050507' },
  stepTitle: { fontSize: 15, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  stepDescription: { fontSize: 13, color: '#8A8A9E', lineHeight: 20 },

  fieldLabel: { fontSize: 12, color: '#797990', fontFamily: Typography.fontFamily.semibold, marginBottom: -4 },
  titleInput: {
    backgroundColor: '#050507',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#1A1A24',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#F0F0F5' },
  bodyInput: {
    backgroundColor: '#050507',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#1A1A24',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#F0F0F5',
    minHeight: 120 },
  characterCount: { fontSize: 11, color: '#797990', alignSelf: 'flex-end' },

  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: '#D4A853',
    paddingVertical: 12 },
  actionButtonText: { fontSize: 14, fontFamily: Typography.fontFamily.bold, color: '#D4A853' },

  promptPreview: {
    backgroundColor: '#050507',
    borderRadius: Radius.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1A1A24' },
  promptPreviewText: { fontSize: 11, color: '#797990', fontFamily: 'monospace' },

  jsonInput: {
    backgroundColor: '#050507',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#1A1A24',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 12,
    color: '#C8C8D4',
    minHeight: 160,
    fontFamily: 'monospace' },

  validResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#4CAF5015',
    borderRadius: Radius.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: '#4CAF5040' },
  validResultText: { flex: 1, fontSize: 13, color: '#4ADE80', fontFamily: Typography.fontFamily.semibold },
  previewLink: { paddingHorizontal: 8 },
  previewLinkText: { fontSize: 13, color: '#D4A853', fontFamily: Typography.fontFamily.bold },

  invalidResult: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: `${'#FF5555'}15`,
    borderRadius: Radius.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: `${'#FF5555'}40` },
  invalidResultText: { flex: 1, fontSize: 12, color: '#FF5555', lineHeight: 18 },

  disabled: { opacity: 0.35 },

  footer: {
    paddingHorizontal: Space['4'],
    paddingVertical: Space['3'],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1A1A24' },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#D4A853',
    borderRadius: Radius.lg,
    paddingVertical: 15 },
  submitText: { fontSize: 15, fontFamily: Typography.fontFamily.extrabold, color: '#050507' },
  _flex: {
    flex: 1,
    backgroundColor: 'transparent' },
  _flex1: {
    flex: 1 },
  _width: {
    width: 44 } });

const previewStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#08080C', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '82%' },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Space['4'],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1A1A24' },
  sheetTitle: { fontSize: 16, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  langScroll: { flexGrow: 0 },
  langRow: { flexDirection: 'row', paddingHorizontal: Space['4'], paddingVertical: 12, gap: 8 },
  langChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: '#0C0C14',
    borderWidth: 1,
    borderColor: '#1A1A24' },
  langChipActive: { borderColor: '#D4A853', backgroundColor: 'rgba(212,168,83,0.14)' },
  langChipFlag: { fontSize: 14 },
  langChipText: { fontSize: 12, color: '#8A8A9E', fontFamily: Typography.fontFamily.semibold },
  langChipTextActive: { color: '#D4A853' },

  previewScroll: { flex: 1 },
  previewContent: { padding: Space['5'], gap: 12 },
  previewLangName: { fontSize: 13, color: '#797990', fontFamily: Typography.fontFamily.semibold },
  previewTitle: { fontSize: 20, fontFamily: Typography.fontFamily.extrabold, color: '#F0F0F5', lineHeight: 26 },
  previewDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#1A1A24' },
  previewBody: { fontSize: 15, color: '#C8C8D4', lineHeight: 24 },

  closeFooterButton: {
    marginHorizontal: Space['4'],
    marginBottom: Space['4'],
    marginTop: Space['2'],
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#1A1A24' },
  closeFooterText: { color: '#8A8A9E', fontSize: 14, fontFamily: Typography.fontFamily.semibold } });
