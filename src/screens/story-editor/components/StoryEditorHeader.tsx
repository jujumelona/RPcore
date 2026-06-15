/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * src/screens/story-editor/components/StoryEditorHeader.tsx
 * 스토리 에디터 헤더 컴포넌트
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { ArrowLeft, Save, Sparkles } from 'lucide-react-native';
import { Radius, Typography } from '../../../constants/tokens';
import { makeA11yProps } from '../../../utils/a11yProps';
import { useTranslation } from '../../../hooks/useTranslation';
import type { EditorTab } from '../types/StoryEditorTypes';

interface StoryEditorHeaderProps {
  title: string;
  activeTab: EditorTab;
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt?: number;
  onBack: () => void;
  onSave: () => void;
  onTabChange: (tab: EditorTab) => void;
  onAIAssistant: () => void;
}

export const StoryEditorHeader: React.FC<StoryEditorHeaderProps> = ({
  title,
  activeTab,
  isDirty,
  isSaving,
  lastSavedAt,
  onBack,
  onSave,
  onTabChange,
  onAIAssistant }) => {
  const t = useTranslation();

  const formatLastSaved = (timestamp?: number): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return t.savedJustNow!;
    if (diffMins < 60) return t.savedMinutesAgo!.replace('{n}', String(diffMins));
    return date.toLocaleTimeString();
  };

  const tabs: { key: EditorTab; label: string }[] = [
    { key: 'basic',      label: t.tabBasic! },
    { key: 'characters', label: t.tabCharacters! },
    { key: 'chapters',   label: t.tabChapters! },
    { key: 'translate',  label: t.tabTranslate! },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0E0E14" />
      
      {/* 상단 헤더 */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          {...makeA11yProps({
            label: '뒤로 가기',
            role: 'button' })}
        >
          <ArrowLeft size={24} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
        
        <View style={styles.titleContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {title ?? t?.newStory}
          </Text>
          {isDirty && <View style={styles.dirtyIndicator} />}
        </View>
        
        <View style={styles.rightButtons}>
          <TouchableOpacity
            style={styles.aiButton}
            onPress={onAIAssistant}
            {...makeA11yProps({
              label: 'AI 도우미',
              role: 'button' })}
          >
            <Sparkles size={20} color="#7C3AED" />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.saveButton, isSaving && styles.saveButtonSaving]}
            onPress={onSave}
            disabled={isSaving}
            {...makeA11yProps({
              label: isSaving ? t.savingLabel! : t.saveLabel!,
              role: 'button' })}
          >
            <Save 
              size={20} 
              color={isSaving ? '#9CA3AF' : '#059669'} 
            />
          </TouchableOpacity>
        </View>
      </View>
      
      {/* 탭 네비게이션 */}
      <View style={styles.tabContainer}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              activeTab === tab.key && styles.activeTab,
            ]}
            onPress={() => onTabChange(tab.key)}
            {...makeA11yProps({
              label: `${tab.label} 탭`,
              role: 'tab',
              state: { selected: activeTab === tab.key } })}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab.key && styles.activeTabText,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      
      {/* 저장 상태 표시 */}
      {(isSaving || lastSavedAt) && (
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>
            {isSaving ? '저장 중...' : formatLastSaved(lastSavedAt)}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0E0E14',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)' },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 56 },
  backButton: {
    padding: 4,
    borderRadius: Radius.sm,
    marginRight: 12 },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12 },
  title: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.semibold,
    color: 'rgba(255,255,255,0.95)',
    flex: 1 },
  dirtyIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F59E0B',
    marginLeft: 8 },
  rightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8 },
  aiButton: {
    padding: 8,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(124,58,237,0.15)' },
  saveButton: {
    padding: 8,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(5,150,105,0.15)' },
  saveButtonSaving: {
    backgroundColor: 'rgba(255,255,255,0.06)' },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    backgroundColor: '#0E0E14' },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent' },
  activeTab: {
    borderBottomColor: '#7C3AED' },
  tabText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium,
    color: 'rgba(255,255,255,0.45)' },
  activeTabText: {
    color: '#7C3AED',
    fontFamily: Typography.fontFamily.semibold },
  statusBar: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#0A0A10',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)' },
  statusText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center' } });
