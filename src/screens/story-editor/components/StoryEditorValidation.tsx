import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { AlertCircle, CheckCircle, X } from 'lucide-react-native';

import { Radius, Typography } from '../../../constants/tokens';
import { makeA11yProps } from '../../../utils/a11yProps';
import { useTranslation } from '../../../hooks/useTranslation';
import type { ValidationResult } from '../types/StoryEditorTypes';

interface StoryEditorValidationProps {
  validation: ValidationResult;
  onDismiss: () => void;
  onFixError?: (field: string) => void;
}

export const StoryEditorValidation: React.FC<StoryEditorValidationProps> = ({
  validation,
  onDismiss,
  onFixError,
}) => {
  const t = useTranslation();

  if (validation.isValid && validation.warnings.length === 0) {
    return null;
  }

  const getFieldDisplayName = (field: string): string => {
    const fieldNames: Record<string, string> = {
      storyTitle: t?.storyTitle ?? t?.title ?? field,
      storyDesc: t?.storyIntro ?? t?.description ?? field,
      worldSetting: t?.worldSetting ?? field,
      characters: t?.editorSectionCharacters ?? field,
      chapters: t?.editorSectionChapters ?? t?.chapterListLabel ?? field,
    };

    const arrayMatch = field.match(/^(\w+)\[(\d+)\]\.(\w+)$/);
    if (arrayMatch) {
      const [, arrayName, index, subField] = arrayMatch;
      const baseName = fieldNames[arrayName] || arrayName;
      const subFieldName = getFieldDisplayName(subField);
      return `${baseName} ${parseInt(index, 10) + 1} - ${subFieldName}`;
    }

    return fieldNames[field] || field;
  };

  const headerLabel = validation.errors.length > 0 ? (t?.error ?? '') : (t?.requiredDone ?? '');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          {validation.errors.length > 0 ? (
            <AlertCircle size={20} color="#DC2626" />
          ) : (
            <CheckCircle size={20} color="#059669" />
          )}
          <Text style={styles.headerText}>{headerLabel}</Text>
        </View>

        <TouchableOpacity
          style={styles.dismissButton}
          onPress={onDismiss}
          {...makeA11yProps({
            label: t?.close ?? '',
            role: 'button',
          })}
        >
          <X size={16} color="#6B7280" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {validation.errors.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{`${t?.error ?? ''} (${validation.errors.length})`}</Text>
            {validation.errors.map((error, index) => (
              <View key={`error-${index}`} style={styles.errorItem}>
                <AlertCircle size={16} color="#DC2626" style={styles.itemIcon} />
                <View style={styles.itemContent}>
                  <Text style={styles.itemField}>{getFieldDisplayName(error.field)}</Text>
                  <Text style={styles.itemMessage}>{error.message}</Text>
                  {onFixError && (
                    <TouchableOpacity
                      style={styles.fixButton}
                      onPress={() => onFixError(error.field)}
                      {...makeA11yProps({
                        label: getFieldDisplayName(error.field),
                        role: 'button',
                      })}
                    >
                      <Text style={styles.fixButtonText}>{t?.confirm ?? ''}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {validation.warnings.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{`${validation.warnings.length}`}</Text>
            {validation.warnings.map((warning, index) => (
              <View key={`warning-${index}`} style={styles.warningItem}>
                <AlertCircle size={16} color="#F59E0B" style={styles.itemIcon} />
                <View style={styles.itemContent}>
                  <Text style={styles.itemField}>{getFieldDisplayName(warning.field)}</Text>
                  <Text style={styles.itemMessage}>{warning.message}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {validation.isValid && validation.warnings.length === 0 && (
          <View style={styles.successSection}>
            <CheckCircle size={24} color="#059669" style={styles.successIcon} />
            <Text style={styles.successText}>{t?.requiredDone ?? ''}</Text>
            <Text style={styles.successSubText}>{t?.canSaveNow ?? ''}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0E0E14',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    maxHeight: 300,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    fontSize: Typography.size.md,
    fontFamily: Typography.fontFamily.semibold,
    color: 'rgba(255,255,255,0.9)',
    marginLeft: 8,
  },
  dismissButton: {
    padding: 4,
    borderRadius: Radius.sm,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: Typography.size.md,
    fontFamily: Typography.fontFamily.semibold,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 12,
  },
  errorItem: {
    flexDirection: 'row',
    backgroundColor: 'rgba(220,38,38,0.12)',
    borderRadius: Radius.md,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.35)',
  },
  warningItem: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderRadius: Radius.md,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.30)',
  },
  itemIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  itemContent: {
    flex: 1,
  },
  itemField: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.semibold,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 4,
  },
  itemMessage: {
    fontSize: Typography.size.sm,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 18,
    marginBottom: 8,
  },
  fixButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#DC2626',
    borderRadius: Radius.sm,
  },
  fixButtonText: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.medium,
    color: '#FFFFFF',
  },
  successSection: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  successIcon: {
    marginBottom: 12,
  },
  successText: {
    fontSize: Typography.size.md,
    fontFamily: Typography.fontFamily.semibold,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginBottom: 4,
  },
  successSubText: {
    fontSize: Typography.size.sm,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    lineHeight: 18,
  },
});