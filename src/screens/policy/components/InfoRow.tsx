// src/screens/policy/components/InfoRow.tsx
import { View, Text, StyleSheet } from 'react-native';
import { Typo, Typography } from '../../../constants/tokens';

interface InfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

export function InfoRow({ label, value, mono = false }: InfoRowProps) {
  return (
    <View
      style={styles.infoRow}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, mono && styles.infoMono]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#1A1A24',
    gap: 12 },
  infoLabel:  { fontSize: Typo.size.xs, color: '#797990', fontFamily: Typography.fontFamily.regular, flexShrink: 0 },
  infoValue:  { fontSize: Typo.size.xs, color: '#C8C8D4', fontFamily: Typography.fontFamily.medium, textAlign: 'right', flex: 1 },
  infoMono:   { fontFamily: Typography.fontFamily.regular } });
