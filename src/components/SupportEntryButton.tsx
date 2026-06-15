import React, { useEffect, useState } from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { ChevronRight, MessageSquare } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { AdminAPI } from '../api/AdminAPI';
import { useAuthStore } from '../store/authStore';
import { useLanguageStore } from '../store/languageStore';
export function SupportEntryButton() {
  const navigation = useNavigation<any>();
  const user = useAuthStore(s => s.user);
  const t = useLanguageStore(s => s.t);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!user?.jwtToken) {
      setUnread(0);
      return;
    }
    AdminAPI.getUnreadReplyCount(user.jwtToken)
      .then(count => setUnread(Number(count) || 0))
      .catch(() => setUnread(0));
  }, [user?.jwtToken]);
  const unreadLabel = t?.numUnreadMessages ? t.numUnreadMessages.replace('{n}', String(unread)) : String(unread);
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => navigation.navigate('SupportChat')}
      activeOpacity={0.7}
    >
      <View style={styles.iconWrap}>
        <MessageSquare size={18} color="#8A8A9E" />
        {unread > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.label}>{t?.support ?? ''}</Text>
        <Text style={styles.sub}>
          {unread > 0 ? unreadLabel : (t?.supportEmptyDescription ?? '')}
        </Text>
      </View>
      <ChevronRight size={18} color="#4A4A60" />
    </TouchableOpacity>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#0E0E14',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1A1A24',
    gap: 12,
  },
  iconWrap: { position: 'relative', width: 36, alignItems: 'center' },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#D4A853',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#050507', fontSize: 9, fontWeight: '700' },
  textWrap: { flex: 1 },
  label: { color: '#F0F0F5', fontSize: 15, fontWeight: '600' },
  sub: { color: '#8A8A9E', fontSize: 12, marginTop: 2 },
});
