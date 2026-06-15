import React from 'react';
import {
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { SlideInRight, SlideOutRight } from 'react-native-reanimated';
import { X, Minus, Plus, Type, AlignLeft, Rows3, Share2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { Typography } from '../../constants/tokens';
import { useLanguageStore } from '../../store/languageStore';
import {
  clampFontSize,
  clampLineHeight,
  FONT_OPTIONS,
  READER_THEMES,
  type ReaderTheme,
  type ScrollMode,
  useReaderSettingsStore,
} from '../../store/readerSettingsStore';
import type { ReaderPanelTheme } from '../../screens/webnovel/WebNovelEmotionPanel';

interface ReaderSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  onShare?: (() => void) | undefined;
  themeColors?: ReaderPanelTheme;
}

function alpha(hex: string, suffix: string, fallback: string) {
  return hex?.startsWith('#') && hex.length === 7 ? `${hex}${suffix}` : fallback;
}

function Stepper({
  label,
  value,
  display,
  onDec,
  onInc,
  icon,
  palette,
}: {
  label: string;
  value: string | number;
  display?: string;
  onDec: () => void;
  onInc: () => void;
  icon: React.ReactNode;
  palette: { text: string; secondary: string; secondarySoft: string; border: string };
}) {
  return (
    <View style={[s.stepperRow, { backgroundColor: palette.secondarySoft, borderColor: palette.border }]}>
      <View style={s.stepperLabel}>
        {icon}
        <Text style={[s.stepperLabelTxt, { color: palette.text }]}>{label}</Text>
      </View>
      <View style={s.stepperControls}>
        <TouchableOpacity style={[s.stepBtn, { borderColor: palette.border }]} onPress={onDec}>
          <Minus size={14} color={palette.secondary} />
        </TouchableOpacity>
        <Text style={[s.stepValue, { color: palette.text }]}>{display ?? String(value)}</Text>
        <TouchableOpacity style={[s.stepBtn, { borderColor: palette.border }]} onPress={onInc}>
          <Plus size={14} color={palette.secondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function ReaderSettingsSheet({
  visible,
  onClose,
  onShare,
  themeColors,
}: ReaderSettingsSheetProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const t = useLanguageStore(s => s.t);
  const { settings, updateSettings, resetSettings } = useReaderSettingsStore(
    useShallow(state => ({
      settings: state.settings,
      updateSettings: state.updateSettings,
      resetSettings: state.resetSettings,
    })),
  );

  const drawerWidth = Math.min(380, Math.round(width * 0.82));
  const theme = themeColors ?? { bg: '#11111C', text: '#F0F0F5', secondary: '#8A8A9E' };
  const palette = {
    bg: theme.bg,
    text: theme.text,
    secondary: theme.secondary,
    border: alpha(theme.secondary, '2A', 'rgba(255,255,255,0.12)'),
    borderSoft: alpha(theme.secondary, '18', 'rgba(255,255,255,0.06)'),
    secondarySoft: alpha(theme.secondary, '10', 'rgba(255,255,255,0.04)'),
    active: '#D4A853',
  };

  const THEME_KEYS = Object.keys(READER_THEMES) as ReaderTheme[];
  const THEME_LABELS: Record<ReaderTheme, string> = {
    dark: t?.readerThemeDark!,
    sepia: t?.readerThemeSepia!,
    white: t?.readerThemeWhite!,
    night: t?.readerThemeNight!,
  };
  const SCROLL_MODES: Array<{ key: ScrollMode; label: string }> = [
    { key: 'vertical', label: t?.readerScrollVertical! },
    { key: 'paged', label: t?.readerScrollPaged! },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar backgroundColor="transparent" translucent barStyle={settings.theme === 'white' ? 'dark-content' : 'light-content'} />
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />

      <Animated.View
        entering={SlideInRight.duration(260)}
        exiting={SlideOutRight.duration(220)}
        style={[
          s.sheet,
          {
            width: drawerWidth,
            backgroundColor: palette.bg,
            borderLeftColor: palette.border,
            paddingTop: Math.max(insets.top, 18),
            paddingBottom: Math.max(insets.bottom, 18),
          },
        ]}
      >
        <View style={[s.header, { borderBottomColor: palette.borderSoft }]}>
          <Text style={[s.headerTitle, { color: palette.text }]}>{t?.settings}</Text>
          <TouchableOpacity style={[s.closeBtn, { backgroundColor: palette.secondarySoft }]} onPress={onClose}>
            <X size={18} color={palette.secondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={s.body}
          contentContainerStyle={[s.bodyContent, { paddingBottom: Math.max(insets.bottom + 24, 32) }]}
          showsVerticalScrollIndicator={false}
        >
          {onShare && (
            <TouchableOpacity
              style={[s.shareRow, { backgroundColor: palette.secondarySoft, borderColor: palette.border }]}
              onPress={onShare}
            >
              <View style={s.shareLabelRow}>
                <Share2 size={16} color={palette.active} />
                <Text style={[s.shareTxt, { color: palette.text }]}>{t?.share}</Text>
              </View>
            </TouchableOpacity>
          )}

          <Text style={[s.sectionTitle, { color: palette.secondary }]}>{t?.readerSettingsText}</Text>

          <Stepper
            label={t?.readerSettingsFontSize!}
            value={settings.fontSize}
            display={`${settings.fontSize}pt`}
            icon={<Type size={14} color={palette.secondary} />}
            onDec={() => updateSettings({ fontSize: clampFontSize(settings.fontSize - 1) })}
            onInc={() => updateSettings({ fontSize: clampFontSize(settings.fontSize + 1) })}
            palette={palette}
          />

          <Stepper
            label={t?.readerSettingsLineSpacing!}
            value={settings.lineHeight}
            display={settings.lineHeight.toFixed(1)}
            icon={<Rows3 size={14} color={palette.secondary} />}
            onDec={() => updateSettings({ lineHeight: +clampLineHeight(settings.lineHeight - 0.1).toFixed(1) })}
            onInc={() => updateSettings({ lineHeight: +clampLineHeight(settings.lineHeight + 0.1).toFixed(1) })}
            palette={palette}
          />

          <Stepper
            label={t?.readerSettingsParagraphGap!}
            value={settings.paragraphSpacing}
            display={`${settings.paragraphSpacing}px`}
            icon={<AlignLeft size={14} color={palette.secondary} />}
            onDec={() => updateSettings({ paragraphSpacing: Math.max(8, settings.paragraphSpacing - 2) })}
            onInc={() => updateSettings({ paragraphSpacing: Math.min(32, settings.paragraphSpacing + 2) })}
            palette={palette}
          />

          <Text style={[s.sectionTitle, s.sectionMarginTop, { color: palette.secondary }]}>{t?.readerSettingsTypeface}</Text>
          <View style={s.fontRow}>
            {FONT_OPTIONS.map(font => (
              <TouchableOpacity
                key={font.value}
                style={[
                  s.fontChip,
                  {
                    backgroundColor: palette.secondarySoft,
                    borderColor: settings.fontFamily === font.value ? palette.active : palette.border,
                  },
                ]}
                onPress={() => updateSettings({ fontFamily: font.value })}
              >
                <Text
                  style={[
                    s.fontChipTxt,
                    {
                      color: settings.fontFamily === font.value ? palette.active : palette.text,
                      fontFamily: font.value,
                    },
                  ]}
                >
                  {font.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[s.sectionTitle, s.sectionMarginTop, { color: palette.secondary }]}>{t?.readerSettingsBackground}</Text>
          <View style={s.themeRow}>
            {THEME_KEYS.map(key => {
              const th = READER_THEMES[key];
              const active = settings.theme === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    s.themeSwatch,
                    {
                      backgroundColor: th.bg,
                      borderColor: active ? palette.active : alpha(th.text, '30', palette.border),
                    },
                  ]}
                  onPress={() => updateSettings({ theme: key })}
                >
                  <Text style={[s.themeSwatchTxt, { color: th.text }]}>{THEME_LABELS[key]}</Text>
                  {active && <View style={[s.themeActiveIndicator, { backgroundColor: palette.active }]} />}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[s.sectionTitle, s.sectionMarginTop, { color: palette.secondary }]}>{t?.readerSettingsReadingMode}</Text>
          <View style={s.modeRow}>
            {SCROLL_MODES.map(mode => (
              <TouchableOpacity
                key={mode.key}
                style={[
                  s.modeChip,
                  {
                    backgroundColor: palette.secondarySoft,
                    borderColor: settings.scrollMode === mode.key ? palette.active : palette.border,
                  },
                ]}
                onPress={() => updateSettings({ scrollMode: mode.key })}
              >
                <Text
                  style={[
                    s.modeChipTxt,
                    { color: settings.scrollMode === mode.key ? palette.active : palette.text },
                  ]}
                >
                  {mode.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[s.sectionTitle, s.sectionMarginTop, { color: palette.secondary }]}>{t?.readerSettingsExtras}</Text>
          <View style={[s.toggleRow, { backgroundColor: palette.secondarySoft, borderColor: palette.border }]}>
            <Text style={[s.toggleLabel, { color: palette.text }]}>{t?.readerSettingsKeepScreenOn}</Text>
            <Switch
              value={settings.keepScreenOn}
              onValueChange={value => updateSettings({ keepScreenOn: value })}
              trackColor={{ false: palette.border, true: alpha(palette.active, '66', 'rgba(212,168,83,0.4)') }}
              thumbColor={settings.keepScreenOn ? palette.active : palette.secondary}
            />
          </View>

          <TouchableOpacity
            style={[s.resetBtn, { backgroundColor: palette.secondarySoft, borderColor: palette.border }]}
            onPress={resetSettings}
          >
            <Text style={[s.resetTxt, { color: palette.text }]}>{t?.readerSettingsReset}</Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    borderLeftWidth: 1,
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12, // override via contentContainerStyle prop
  },
  shareRow: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
  },
  shareLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shareTxt: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semibold,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  sectionMarginTop: {
    marginTop: 22,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  stepperLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  stepperLabelTxt: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    minWidth: 54,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: Typography.fontFamily.semibold,
  },
  fontRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  fontChip: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fontChipTxt: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
  },
  themeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  themeSwatch: {
    width: '47%',
    minWidth: 136,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    overflow: 'hidden',
  },
  themeSwatchTxt: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semibold,
  },
  themeActiveIndicator: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeChip: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modeChipTxt: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semibold,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  toggleLabel: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium,
  },
  resetBtn: {
    marginTop: 18,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 13,
    alignItems: 'center',
  },
  resetTxt: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semibold,
  },
});
