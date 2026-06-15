// src/screens/home/components/SortDropdown.tsx
import { Modal, View, Text, StyleSheet } from 'react-native';
import { PressableOpacity as TouchableOpacity } from '../../../components/PressableOpacity';
import { Check } from 'lucide-react-native';
import { Radius, Typography } from '../../../constants/tokens';

interface SortDropdownProps {
  visible: boolean;
  current: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  options: { id: string; label: string }[];
  anchorY: number;
}

export function SortDropdown({ visible, current, onSelect, onClose, options, anchorY }: SortDropdownProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        {/* 버튼 바로 아래, 왼쪽 정렬 */}
        <View style={[styles.dropdown, { top: anchorY + 4 }]}>
          {options.map((o, i) => (
            <TouchableOpacity
              key={o.id}
              style={[styles.dropItem, current === o.id && styles.dropItemOn, i === options.length - 1 && styles.dropItemLast]}
              onPress={() => { onSelect(o.id); onClose(); }}
            >
              <View style={styles.itemLeft}>
                <Check size={14} color={'#D4A853'} style={[styles.checkIcon, current === o.id ? styles.visible : styles.hidden]} />
                <Text style={[styles.dropTxt, current === o.id && styles.dropTxtOn]}>{o.label}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-start',
    paddingLeft: 14,        // 왼쪽 정렬 — 정렬 버튼과 나란히
    alignItems: 'flex-start' },
  dropdown: {
    backgroundColor: '#111118', borderRadius: Radius.lg,
    borderWidth: 1, borderColor: '#222232', minWidth: 170, overflow: 'hidden',
    elevation: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 12 },
  dropItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: '#181820' },
  itemLeft: {
    flexDirection: 'row', alignItems: 'center' },
  checkIcon: { marginRight: 8 },
  dropItemOn: { backgroundColor: 'rgba(212,168,83,0.07)' },
  dropTxt: { fontSize: 13, color: '#C0C0D4', fontFamily: Typography.fontFamily.medium },
  dropTxtOn: { color: '#F0F0F5', fontFamily: Typography.fontFamily.semibold },
  dropItemLast: { borderBottomWidth: 0 },
  visible: { opacity: 1 },
  hidden: { opacity: 0 } });
