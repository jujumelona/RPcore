import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PressableOpacity as TouchableOpacity } from '../../components/PressableOpacity';
import { ConfirmModal } from '../../components/ConfirmModal';
import {
  AlertTriangle,
  Baby,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Database,
  Lock,
  Mail,
  Share2,
  Shield,
  Trash2,
} from 'lucide-react-native';
import { Radius, Typo, Typography } from '../../constants/tokens';
import { getDataPolicyCopy } from '../../i18n/dataPolicyCopy';
import { useAuthStore } from '../../store/authStore';
import { useLanguageStore } from '../../store/languageStore';
import { announceForA11y, makeA11yProps } from '../../utils/a11yUtils';
import { InfoRow, Section } from './components';

const CONTACT = {
  dpo: 'fdje0303@gmail.com',
  support: 'fdje0303@gmail.com',
  website: 'https://rpcore.app/privacy',
};

const LAST_UPDATED = 'March 8, 2026';

export function DataPolicyScreen({
  navigation,
}: {
  navigation: import('@react-navigation/native').NavigationProp<
    Record<string, object | undefined>
  >;
}) {
  const t = useLanguageStore(s => s.t);
  const appLanguage = useLanguageStore(s => s.appLanguage);
  const copy = getDataPolicyCopy(appLanguage);
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.signOut);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  const handleDeleteAccount = useCallback(() => {
    setDeleteConfirm(true);
  }, []);

  const doDeleteAccount = useCallback(async () => {
    setDeleteConfirm(false);
    setDeleting(true);
    announceForA11y?.(copy.deleteProcessingAnnouncement);
    try {
      const { appStorage } = await import('../../utils/storage');
      appStorage.clearAll();
      await logout();
      announceForA11y?.(copy.deleteCompletedAnnouncement);
      navigation.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
    } catch {
      setDeleting(false);
      setDeleteError(true);
    }
  }, [copy.deleteCompletedAnnouncement, copy.deleteProcessingAnnouncement, logout, navigation]);

  return (
    <SafeAreaView style={sc.safe} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#050507" translucent={false} />

      <View style={sc.header} accessibilityRole="header">
        <TouchableOpacity
          style={sc.backBtn}
          onPress={() => navigation.goBack()}
          {...makeA11yProps({ label: t?.back ?? 'Back' })}
        >
          <ChevronLeft size={24} color="#F0F0F5" />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={sc.headerTitle}>{copy.title}</Text>
          <Text style={sc.headerSub}>{`${copy.lastUpdatedLabel}: ${LAST_UPDATED}`}</Text>
        </View>
      </View>

      <ScrollView
        style={sc.scroll}
        contentContainerStyle={sc.content}
        showsVerticalScrollIndicator={false}
        accessibilityLabel={copy.title}
      >
        <Section icon={<Database size={16} color="#D4A853" />} title={copy.dataCollectionTitle}>
          <Text style={sc.intro}>
            {copy.dataIntro}{'\n'}
            <Text style={sc.bold}>{copy.dataLocalOnly}</Text>
          </Text>
          {copy.dataGroups.map(group => (
            <View key={group.category} style={sc.dataGroup}>
              <Text style={sc.dataGroupTitle}>{group.category}</Text>
              {group.items.map(item => (
                <View
                  key={item.name}
                  style={sc.dataRow}
                  accessible
                  accessibilityLabel={`${item.name}. ${item.purpose}. ${item.retention}${item.sensitive ? `. ${copy.sensitive}` : ''}`}
                >
                  <View style={sc.dataLeft}>
                    <Text style={sc.dataName}>{item.name}</Text>
                    <Text style={sc.dataPurpose}>{item.purpose}</Text>
                    <Text style={sc.dataRetention}>{item.retention}</Text>
                  </View>
                  {item.sensitive && (
                    <View style={sc.sensitiveBadge} accessible accessibilityLabel={copy.sensitive}>
                      <Lock size={10} color="#F59E0B" />
                      <Text style={sc.sensitiveText}>{copy.sensitive}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          ))}
        </Section>

        <Section icon={<Shield size={16} color="#D4A853" />} title={copy.permissionsTitle}>
          <Text style={sc.intro}>
            {copy.permissionsIntro}{'\n'}
            {copy.permissionsDeniedNote}
          </Text>
          {copy.permissions.map(permission => (
            <View
              key={permission.permission}
              style={sc.permRow}
              accessible
              accessibilityLabel={`${permission.permission}. ${permission.reason}${permission.sensitive ? `. ${copy.sensitive}` : ''}`}
            >
              <View style={sc.permHeader}>
                <Text style={sc.permName}>{permission.permission}</Text>
                <View style={sc.permPlatforms}>
                  {permission.android && (
                    <View style={[sc.platformBadge, sc.androidBadge]}>
                      <Text style={[sc.platformText, sc.androidText]}>Android</Text>
                    </View>
                  )}
                  {permission.ios && (
                    <View style={[sc.platformBadge, sc.iosBadge]}>
                      <Text style={[sc.platformText, sc.iosText]}>iOS</Text>
                    </View>
                  )}
                  {permission.sensitive && (
                    <View style={[sc.platformBadge, sc.sensitivePlatformBadge]}>
                      <Text style={[sc.platformText, sc.sensitivePlatformText]}>{copy.sensitive}</Text>
                    </View>
                  )}
                </View>
              </View>
              <Text style={sc.permReason}>{permission.reason}</Text>
            </View>
          ))}
        </Section>

        <Section icon={<Clock size={16} color="#D4A853" />} title={copy.retentionTitle}>
          {copy.retentionRows.map(row => (
            <InfoRow key={row.label} label={row.label} value={row.value} />
          ))}
          <View style={sc.noteBox} accessible accessibilityLabel={copy.legalRetention}>
            <AlertTriangle size={13} color="#F59E0B" />
            <Text style={sc.noteText}>{copy.legalRetention}</Text>
          </View>
        </Section>

        <Section icon={<Baby size={16} color="#D4A853" />} title={copy.childPrivacyTitle}>
          <View style={sc.coppaBox} accessible accessibilityLabel={copy.ageRestriction}>
            <CheckCircle2 size={18} color="#4ADE80" />
            <Text style={sc.coppaTitle}>{copy.ageRestriction}</Text>
          </View>
          <Text style={sc.intro}>
            {copy.childPrivacyIntro}{'\n\n'}
            {copy.childPrivacyLawNote}
          </Text>
          <TouchableOpacity
            style={sc.linkBtn}
            onPress={() => Linking.openURL(`mailto:${CONTACT.dpo}?subject=${encodeURIComponent(copy.coppaRequestSubject)}`)}
            {...makeA11yProps({ label: CONTACT.dpo, role: 'link' })}
          >
            <Mail size={14} color="#D4A853" />
            <Text style={sc.linkText}>{CONTACT.dpo}</Text>
          </TouchableOpacity>
          <InfoRow label={copy.applicableLawsLabel} value={copy.applicableLawsValue} />
        </Section>

        <Section icon={<Share2 size={16} color="#D4A853" />} title={copy.thirdPartyTitle}>
          <Text style={sc.intro}>{copy.thirdPartyIntro}</Text>
          {copy.thirdParties.map(tp => (
            <View
              key={tp.name}
              style={sc.tpRow}
              accessible
              accessibilityLabel={`${tp.name}. ${tp.purpose}. ${copy.transferRegionLabel}: ${tp.transfers}`}
            >
              <Text style={sc.tpName}>{tp.name}</Text>
              <Text style={sc.tpPurpose}>{tp.purpose}</Text>
              <View style={sc.tpBottom}>
                <Text style={sc.tpCountry}>{`${copy.transferRegionLabel}: ${tp.transfers}`}</Text>
                <TouchableOpacity
                  onPress={() => Linking.openURL(tp.policy)}
                  {...makeA11yProps({ label: `${tp.name} ${copy.privacyPolicyLabel}`, role: 'link' })}
                >
                  <Text style={sc.tpPolicy}>{copy.privacyPolicyLabel}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </Section>

        <Section icon={<Trash2 size={16} color="#FF5555" />} title={copy.deletionTitle}>
          <Text style={sc.intro}>
            {copy.deletionIntro}{'\n\n'}
            {copy.deletionBackupNote}
          </Text>

          <View style={sc.deleteOption}>
            <Text style={sc.deleteOptionTitle}>{copy.method1}</Text>
            <Text style={sc.deleteOptionDesc}>{copy.method1Desc}</Text>
            <TouchableOpacity
              style={sc.linkBtn}
              onPress={() => Linking.openURL(`mailto:${CONTACT.support}?subject=${encodeURIComponent(copy.deleteRequestSubject)}`)}
              {...makeA11yProps({ label: CONTACT.support, role: 'link' })}
            >
              <Mail size={14} color="#D4A853" />
              <Text style={sc.linkText}>{CONTACT.support}</Text>
            </TouchableOpacity>
          </View>

          {user && (
            <View style={sc.deleteOption}>
              <Text style={sc.deleteOptionTitle}>{copy.method2}</Text>
              <Text style={sc.deleteOptionDesc}>{copy.method2Desc}</Text>
              <TouchableOpacity
                style={sc.deleteBtn}
                onPress={handleDeleteAccount}
                disabled={deleting}
                {...makeA11yProps({
                  label: copy.deleteAccount,
                  role: 'button',
                  disabled: deleting,
                })}
                activeOpacity={0.8}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Trash2 size={16} color="#fff" />
                    <Text style={sc.deleteBtnText}>{copy.deleteAccount}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </Section>

        <Section icon={<CheckCircle2 size={16} color="#D4A853" />} title={copy.rightsTitle}>
          {copy.rights.map(right => (
            <View
              key={right.title}
              style={sc.rightRow}
              accessible
              accessibilityLabel={`${right.title}. ${right.desc}`}
            >
              <CheckCircle2 size={14} color="#4ADE80" style={styles.marginTop} />
              <View style={styles.flex}>
                <Text style={sc.rightTitle}>{right.title}</Text>
                <Text style={sc.rightDesc}>{right.desc}</Text>
              </View>
            </View>
          ))}
          <Text style={sc.gdprNote}>{copy.rightsNote}</Text>
        </Section>

        <Section icon={<Mail size={16} color="#D4A853" />} title={copy.dpoTitle} defaultExpanded={false}>
          <InfoRow label={copy.dpoEmailLabel} value={CONTACT.dpo} />
          <InfoRow label={copy.dpoPolicyWebsiteLabel} value={CONTACT.website} />
          <InfoRow label={copy.dpoResponseTimeLabel} value={copy.dpoResponseTimeValue} />
          <TouchableOpacity
            style={sc.linkBtn}
            onPress={() => Linking.openURL(CONTACT.website)}
            {...makeA11yProps({ label: CONTACT.website, role: 'link' })}
          >
            <Text style={sc.linkText}>{CONTACT.website}</Text>
          </TouchableOpacity>
        </Section>

        <Text style={sc.lastUpdated}>{copy.footerLastUpdated.replace('{date}', LAST_UPDATED)}</Text>
        <View style={styles.height} />
      </ScrollView>

      <ConfirmModal
        visible={deleteConfirm}
        icon="alert-circle-outline"
        iconColor="#FF5555"
        title={copy.deleteConfirmTitle}
        message={copy.deleteConfirmMessage}
        onRequestClose={() => setDeleteConfirm(false)}
        actions={[
          { label: copy.deleteConfirmAction, variant: 'danger', onPress: doDeleteAccount },
          { label: copy.cancelAction, variant: 'default', onPress: () => setDeleteConfirm(false) },
        ]}
      />
      <ConfirmModal
        visible={deleteError}
        icon="alert-circle-outline"
        iconColor="#FF5555"
        title={copy.deleteErrorTitle}
        message={copy.deleteError}
        onRequestClose={() => setDeleteError(false)}
        actions={[{ label: copy.okAction, variant: 'default', onPress: () => setDeleteError(false) }]}
      />
    </SafeAreaView>
  );
}

const sc = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050507' },
  scroll: { flex: 1 },
  content: { paddingBottom: 20 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1A1A24',
  },
  androidBadge: { backgroundColor: 'rgba(74,222,128,0.12)' },
  androidText: { color: '#4ADE80' },
  iosBadge: { backgroundColor: 'rgba(124,58,237,0.12)' },
  iosText: { color: '#A78BFA' },
  sensitivePlatformBadge: { backgroundColor: 'rgba(245,158,11,0.12)' },
  sensitivePlatformText: { color: '#F59E0B' },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    marginRight: 8,
    backgroundColor: '#0C0C14',
    borderWidth: 1,
    borderColor: '#181820',
  },
  headerTitle: {
    fontSize: Typo.size.lg,
    fontFamily: Typography.fontFamily.bold,
    color: '#F0F0F5',
  },
  headerSub: {
    fontSize: Typo.size.xs,
    color: '#797990',
    fontFamily: Typography.fontFamily.regular,
    marginTop: 1,
  },

  intro: {
    fontSize: Typo.size.sm,
    color: '#C8C8D4',
    lineHeight: 21,
    fontFamily: Typography.fontFamily.regular,
    marginTop: 12,
    marginBottom: 10,
  },
  bold: {
    fontFamily: Typography.fontFamily.semibold,
    color: '#F0F0F5',
  },

  dataGroup: { marginBottom: 14 },
  dataGroupTitle: {
    fontSize: Typo.size.sm,
    fontFamily: Typography.fontFamily.bold,
    color: '#F0F0F5',
    marginBottom: 8,
    marginTop: 4,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1A1A24',
  },
  dataLeft: { flex: 1, marginRight: 8 },
  dataName: {
    fontSize: Typo.size.sm,
    fontFamily: Typography.fontFamily.medium,
    color: '#F0F0F5',
  },
  dataPurpose: {
    fontSize: Typo.size.xs,
    color: '#8A8A9E',
    marginTop: 2,
    fontFamily: Typography.fontFamily.regular,
  },
  dataRetention: {
    fontSize: Typo.size.caption,
    color: '#797990',
    marginTop: 3,
    fontFamily: Typography.fontFamily.regular,
  },
  sensitiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: Radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#F59E0B44',
    flexShrink: 0,
  },
  sensitiveText: {
    fontSize: Typo.size.caption,
    color: '#F59E0B',
    fontFamily: Typography.fontFamily.bold,
  },

  permRow: {
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1A1A24',
  },
  permHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 5,
  },
  permName: {
    fontSize: Typo.size.sm,
    fontFamily: Typography.fontFamily.semibold,
    color: '#F0F0F5',
  },
  permPlatforms: { flexDirection: 'row', gap: 4 },
  platformBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.xs },
  platformText: { fontSize: Typo.size.caption, fontFamily: Typography.fontFamily.bold },
  permReason: {
    fontSize: Typo.size.xs,
    color: '#8A8A9E',
    lineHeight: 18,
    fontFamily: Typography.fontFamily.regular,
  },

  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 10,
    padding: 10,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#F59E0B33',
  },
  noteText: {
    flex: 1,
    fontSize: Typo.size.caption,
    color: '#8A8A9E',
    lineHeight: 17,
    fontFamily: Typography.fontFamily.regular,
  },

  coppaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 10,
    padding: 12,
    backgroundColor: 'rgba(74,222,128,0.12)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#4ADE8044',
  },
  coppaTitle: {
    fontSize: Typo.size.md,
    fontFamily: Typography.fontFamily.bold,
    color: '#4ADE80',
  },

  tpRow: {
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1A1A24',
  },
  tpName: {
    fontSize: Typo.size.sm,
    fontFamily: Typography.fontFamily.semibold,
    color: '#F0F0F5',
  },
  tpPurpose: {
    fontSize: Typo.size.xs,
    color: '#8A8A9E',
    marginTop: 3,
    fontFamily: Typography.fontFamily.regular,
  },
  tpBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  tpCountry: {
    fontSize: Typo.size.xs,
    color: '#797990',
    fontFamily: Typography.fontFamily.regular,
  },
  tpPolicy: {
    fontSize: Typo.size.xs,
    color: '#D4A853',
    fontFamily: Typography.fontFamily.semibold,
  },

  deleteOption: {
    marginTop: 14,
    padding: 12,
    backgroundColor: '#08080C',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#181820',
    gap: 8,
  },
  deleteOptionTitle: {
    fontSize: Typo.size.sm,
    fontFamily: Typography.fontFamily.bold,
    color: '#F0F0F5',
  },
  deleteOptionDesc: {
    fontSize: Typo.size.xs,
    color: '#8A8A9E',
    lineHeight: 18,
    fontFamily: Typography.fontFamily.regular,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FF5555',
    borderRadius: Radius.md,
    paddingVertical: 13,
    minHeight: 48,
  },
  deleteBtnText: {
    fontSize: Typo.size.sm,
    fontFamily: Typography.fontFamily.bold,
    color: '#fff',
  },

  rightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1A1A24',
  },
  rightTitle: {
    fontSize: Typo.size.sm,
    fontFamily: Typography.fontFamily.semibold,
    color: '#F0F0F5',
  },
  rightDesc: {
    fontSize: Typo.size.xs,
    color: '#8A8A9E',
    lineHeight: 17,
    fontFamily: Typography.fontFamily.regular,
    marginTop: 1,
  },
  gdprNote: {
    fontSize: Typo.size.xs,
    color: '#797990',
    marginTop: 12,
    lineHeight: 17,
    fontFamily: Typography.fontFamily.regular,
  },

  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    minHeight: 44,
  },
  linkText: {
    fontSize: Typo.size.xs,
    color: '#D4A853',
    fontFamily: Typography.fontFamily.regular,
    textDecorationLine: 'underline',
  },

  lastUpdated: {
    fontSize: Typo.size.xs,
    color: '#757585',
    textAlign: 'center',
    marginTop: 20,
    fontFamily: Typography.fontFamily.regular,
  },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  marginTop: { marginTop: 1 },
  height: { height: 60 },
});
