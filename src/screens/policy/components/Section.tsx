// src/screens/policy/components/Section.tsx
import { useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { PressableOpacity } from '../../../components/PressableOpacity';
import { makeA11yProps } from '../../../utils/a11yUtils';
import { Radius, Typo, Typography } from '../../../constants/tokens';

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export function Section({ icon, title, children, defaultExpanded = true }: SectionProps) {
  const [open, setOpen] = useState(defaultExpanded);
  const toggle = useCallback(() => setOpen(v => !v), []);

  return (
    <View style={styles.section}>
      <PressableOpacity
        style={styles.sectionHeader}
        onPress={toggle}
        {...makeA11yProps({
          label: title,
          role:  'button',
          state: { expanded: open } })}
        activeOpacity={0.85}
      >
        <View style={styles.sectionTitleRow}>
          {icon}
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {open ? <ChevronUp size={16} color={'#797990'} /> : <ChevronDown size={16} color={'#797990'} />}
      </PressableOpacity>
      {open && <View style={styles.sectionBody}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: 14, marginTop: 14,
    backgroundColor: '#0C0C14',
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: '#181820',
    overflow: 'hidden' },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 14,
    minHeight: 52 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle:   { fontSize: Typo.size.md, fontFamily: Typography.fontFamily.semibold, color: '#F0F0F5' },
  sectionBody:    { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#1A1A24' } });
