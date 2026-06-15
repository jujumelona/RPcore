// src/components/ModelPickerModal.tsx
// i18n 적용 완료

import { Typography } from '../constants/tokens';
import React from 'react';
import { View, Text, Modal, StyleSheet } from 'react-native';
import { PressableOpacity as TouchableOpacity } from '../components/PressableOpacity';
import { ModelInfo } from '../models/ModelConfig';
import { useLanguageStore } from '../store/languageStore';
import { Check } from 'lucide-react-native';

interface Props {
  visible: boolean;
  models: ModelInfo[];
  activeId: string;
  onSelect: (modelId: string) => void;
  onClose: () => void;
  title?: string;
}

export function ModelPickerModal({ visible, models, activeId, onSelect, onClose, title }: Props) {
  const t = useLanguageStore(s => s.t);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <View style={s.sheet}>
          <Text style={s.title}>{title ?? t?.changeModel}</Text>
          <Text style={s.sub}>{t?.summaryModel}</Text>
          {models.map(m => {
            const active = m.id === activeId;
            return (
              <TouchableOpacity
                key={m.id}
                style={[s.item, active && s.itemActive]}
                onPress={() => { onSelect(m.id); onClose(); }}
              >
                <View style={s.itemLeft}>
                  <Text style={s.itemName}>{(t as Record<string, string>)[m.nameKey] ?? m.name}</Text>
                  <Text style={s.itemDesc}>{(t as Record<string, string>)[m.summaryKeys.line1] ?? m.summary.line1}</Text>
                </View>
                {active && <Check size={18} color="#7C3AED" style={styles._marginLeft} />}
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
            <Text style={s.cancelText}>{t?.cancel}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#08080C', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36 },
  title: { fontSize: 17, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5', marginBottom: 4 },
  sub: { fontSize: 13, color: '#797990', marginBottom: 20 },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, backgroundColor: '#0E0E14', borderRadius: 12, marginBottom: 8, borderWidth: 1.5, borderColor: '#181820' },
  itemActive: { borderColor: '#8B5CF6' },
  itemLeft: { flex: 1 },
  itemName: { fontSize: 15, fontFamily: Typography.fontFamily.semibold, color: '#F0F0F5', marginBottom: 3 },
  itemDesc: { fontSize: 12, color: '#8A8A9E' },
  check: { fontSize: 18, color: '#8B5CF6', fontFamily: Typography.fontFamily.bold, marginLeft: 12 },
  cancelBtn: { marginTop: 8, paddingVertical: 14, alignItems: 'center' },
  cancelText: { fontSize: 15, color: '#797990' } });

const styles = StyleSheet.create({
  _marginLeft: {
    marginLeft: 12 } });
