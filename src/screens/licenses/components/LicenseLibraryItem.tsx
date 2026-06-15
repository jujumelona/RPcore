import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutAnimation } from 'react-native';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react-native';
import { Radius, Typo, Typography } from '../../../constants/tokens';
import { makeA11yProps } from '../../../utils/a11yUtils';
import type { OSSLibrary } from '../OpenSourceLicensesData';
import { getLicenseColor } from '../OpenSourceLicensesData';

interface LicenseLibraryItemProps {
  library: OSSLibrary;
  isExpanded: boolean;
  onToggle: () => void;
  onLinkPress: (url: string) => void;
}

export const LicenseLibraryItem: React.FC<LicenseLibraryItemProps> = ({
  library,
  isExpanded,
  onToggle,
  onLinkPress }) => {
  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggle();
  };

  const handleLinkPress = () => {
    onLinkPress(library.url);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={handleToggle}
        {...makeA11yProps({
          label: `${library.name} 라이선스 상세 ${isExpanded ? '접기' : '펼치기'}`,
          role: 'button' })}
      >
        <View style={styles.headerContent}>
          <View style={styles.nameContainer}>
            <Text style={styles.name} numberOfLines={1}>
              {library.name}
            </Text>
            <Text style={styles.version}>{library.version}</Text>
          </View>

          <View style={styles.licenseContainer}>
            <View
              style={[
                styles.licenseBadge,
                { backgroundColor: getLicenseColor(library.license) },
              ]}
            >
              <Text style={styles.licenseText}>
                {library.license}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={handleLinkPress}
              {...makeA11yProps({
                label: `${library.name} 홈페이지 열기`,
                role: 'link' })}
            >
              <ExternalLink size={16} color="#6B7280" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.expandIcon}>
          {isExpanded ? (
            <ChevronUp size={20} color="#6B7280" />
          ) : (
            <ChevronDown size={20} color="#6B7280" />
          )}
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.expandedContent}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>라이선스</Text>
            <Text style={styles.detailValue}>{library.license}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>버전</Text>
            <Text style={styles.detailValue}>{library.version}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>URL</Text>
            <TouchableOpacity
              style={styles.detailLink}
              onPress={handleLinkPress}
              {...makeA11yProps({
                label: `${library.name} 링크 열기`,
                role: 'link' })}
            >
              <Text style={styles.detailLinkText} numberOfLines={1}>{library.url}</Text>
              <ExternalLink size={14} color="#3B82F6" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0E0E14',
    borderRadius: Radius.md,
    marginBottom: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#0E0E14' },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between' },
  nameContainer: {
    flex: 1,
    marginRight: 12 },
  name: {
    fontSize: Typo.size.base,
    fontFamily: Typography.fontFamily.semibold,
    color: '#111827',
    marginBottom: 2 },
  version: {
    fontSize: Typo.size.sm,
    color: '#6B7280' },
  licenseContainer: {
    flexDirection: 'row',
    alignItems: 'center' },
  licenseBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    marginRight: 8 },
  licenseText: {
    fontSize: Typo.size.sm,
    fontFamily: Typography.fontFamily.medium,
    color: '#0E0E14' },
  linkButton: {
    padding: 4,
    borderRadius: Radius.sm },
  expandIcon: {
    marginLeft: 12 },
  expandedContent: {
    padding: 16,
    paddingTop: 0,
    backgroundColor: '#F9FAFB' },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12 },
  detailLabel: {
    fontSize: Typo.size.md,
    fontFamily: Typography.fontFamily.medium,
    color: '#374151',
    width: 60 },
  detailValue: {
    flex: 1,
    fontSize: Typo.size.md,
    color: '#111827' },
  detailLink: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center' },
  detailLinkText: {
    flex: 1,
    fontSize: Typo.size.md,
    color: '#3B82F6',
    textDecorationLine: 'underline',
    marginRight: 4 } });
