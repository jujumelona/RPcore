import { Typography } from '../constants/tokens';
import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView } from 'react-native';
import { PressableOpacity as TouchableOpacity } from '../components/PressableOpacity';
import { BottomSheet } from '../components/ui/BottomSheet';
import { useLanguageStore } from '../store/languageStore';
import { useAuthStore } from '../store/authStore';
import { RTL_LANGUAGES } from '../i18n/languages';
import { getAdminModerationCopy } from '../i18n/adminModerationCopy';
import { CheckCircle, RefreshCw } from 'lucide-react-native';
import { ToastService } from './Toast';
import {
  MODERATION_REPORT_REASONS,
  ModerationAPI,
  isModerationPriority,
  type ModerationPriority,
  type ModerationReportReason,
} from '../api/ModerationAPI';

const REASONS = MODERATION_REPORT_REASONS;
const PRIORITY_VISUAL: Record<ModerationPriority, { color: string; backgroundColor: string; borderColor: string }> = {
  critical: {
    color: '#F87171',
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderColor: 'rgba(248,113,113,0.30)',
  },
  high: {
    color: '#F59E0B',
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'rgba(245,158,11,0.28)',
  },
  medium: {
    color: '#D4A853',
    backgroundColor: 'rgba(212,168,83,0.12)',
    borderColor: 'rgba(212,168,83,0.28)',
  },
  low: {
    color: '#8A8A9E',
    backgroundColor: 'rgba(138,138,158,0.12)',
    borderColor: 'rgba(138,138,158,0.28)',
  },
};

interface RT {
  title: string;
  subtitle: string;
  reasons: Record<ModerationReportReason, string>;
  csamWarning: string;
  detailPlaceholder: string;
  submit: string;
  cancel: string;
  successTitle: string;
  successMsg: string;
  successCritical: string;
  errorNotLoggedIn: string;
  errorNetwork: string;
}

function getReportT(t: Record<string, string | undefined>): RT {
  return {
    title: t.reportTitle!,
    subtitle: t.reportSubtitle!,
    reasons: {
      csam: t.reportCsam!,
      harassment: t.reportHarassment!,
      hate: t.reportHate!,
      spam: t.reportSpam!,
      violence: t.reportViolence!,
      illegal: t.reportIllegal!,
      impersonation: t.reportImpersonation!,
      other: t.reportOther!,
    },
    csamWarning: t.reportCsamWarning!,
    detailPlaceholder: t.reportDetailPlaceholder!,
    submit: t.reportSubmit!,
    cancel: t.reportCancel!,
    successTitle: t.reportSuccessTitle!,
    successMsg: t.reportSuccessMsg!,
    successCritical: t.reportSuccessCritical!,
    errorNotLoggedIn: t.reportErrorNotLoggedIn!,
    errorNetwork: t.reportErrorNetwork!,
  };
}

export interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  targetType: 'story' | 'post' | 'user' | 'comment';
  targetId: string;
  targetLabel?: string;
}

export function ReportModal({ visible, onClose, targetType, targetId, targetLabel }: ReportModalProps) {
  const currentLanguage = useLanguageStore(s => s.currentLanguage);
  const t = useLanguageStore(s => s.t as Record<string, string | undefined>);
  const user = useAuthStore(s => s.user);
  const isRTL = RTL_LANGUAGES.includes(currentLanguage);
  const tx = getReportT(t);
  const moderationCopy = getAdminModerationCopy(currentLanguage);
  const targetTypeLabel = moderationCopy.targetTypeLabels[targetType];

  const rtlStyles = useMemo(() => StyleSheet.create({
    textAlign: { textAlign: isRTL ? 'right' : 'left' },
    flexDirection: { flexDirection: isRTL ? 'row-reverse' : 'row' },
  }), [isRTL]);

  const [selectedReason, setSelectedReason] = useState<ModerationReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [isCritical, setIsCritical] = useState(false);
  const [receiptPriority, setReceiptPriority] = useState<ModerationPriority | null>(null);
  const targetSummary = targetLabel?.trim() || targetId;

  const handleClose = useCallback(() => {
    setSelectedReason(null);
    setDetail('');
    setDone(false);
    setIsCritical(false);
    setReceiptPriority(null);
    onClose();
  }, [onClose]);

  const handleSubmit = async () => {
    if (!selectedReason) return;
    if (!user?.jwtToken) {
      ToastService.error(tx.errorNotLoggedIn);
      return;
    }

    setIsSubmitting(true);
    try {
      const detailText = detail.trim();
      const receipt = await ModerationAPI.submitReport({
        targetType,
        targetId,
        reason: selectedReason,
        detail: detailText,
        lang: currentLanguage,
        targetLabel,
      }, {
        mirrorToAdmin: true,
        user: {
          id: user.id ?? '',
          email: user.email ?? '',
          name: user.name ?? '',
          jwtToken: user.jwtToken,
        },
      });

      const normalizedPriority = isModerationPriority(receipt.priority) ? receipt.priority : null;
      setReceiptPriority(normalizedPriority);
      setIsCritical(normalizedPriority === 'critical');
      setDone(true);
    } catch {
      ToastService.error(tx.errorNetwork);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose} title={tx.title}>
      <View style={st.modalContent}>
        {done ? (
          <View style={st.doneBox}>
            <CheckCircle size={48} color="#4C4" style={st.checkIcon} />
            <Text style={st.doneTitle}>{tx.successTitle}</Text>
            <Text style={st.doneTarget}>{targetSummary}</Text>
            {receiptPriority ? (
              <View
                style={[
                  st.priorityBadge,
                  {
                    backgroundColor: PRIORITY_VISUAL[receiptPriority].backgroundColor,
                    borderColor: PRIORITY_VISUAL[receiptPriority].borderColor,
                  },
                ]}
              >
                <Text style={[st.priorityBadgeText, { color: PRIORITY_VISUAL[receiptPriority].color }]}>
                  {moderationCopy.priorityLabels[receiptPriority]}
                </Text>
              </View>
            ) : null}
            <Text style={st.doneMsg}>
              {isCritical ? tx.successCritical : tx.successMsg}
            </Text>
            <TouchableOpacity style={st.closeBtn} onPress={handleClose}>
              <Text style={st.closeBtnText}>{t.confirm}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[st.subtitle, rtlStyles.textAlign]}>{tx.subtitle}</Text>
            <View style={st.targetCard}>
              <Text style={[st.targetType, rtlStyles.textAlign]}>{targetTypeLabel}</Text>
              <Text style={[st.targetTitle, rtlStyles.textAlign]} numberOfLines={2}>{targetSummary}</Text>
              {selectedReason ? (
                <View style={st.targetMetaRow}>
                  <View style={st.targetMetaChip}>
                    <Text style={st.targetMetaChipText}>{tx.reasons[selectedReason]}</Text>
                  </View>
                </View>
              ) : null}
            </View>
            {REASONS.map(reason => (
              <TouchableOpacity
                key={reason}
                style={[st.reasonRow, selectedReason === reason && st.reasonRowSelected, rtlStyles.flexDirection]}
                onPress={() => setSelectedReason(reason)}
                activeOpacity={0.7}
              >
                <View style={[st.radio, selectedReason === reason && st.radioOn]}>
                  {selectedReason === reason && <View style={st.radioDot} />}
                </View>
                <View style={st.reasonTextWrapper}>
                  <Text style={[st.reasonText, rtlStyles.textAlign]}>{tx.reasons[reason]}</Text>
                  {reason === 'csam' && selectedReason === 'csam' ? (
                    <Text style={[st.csamWarning, rtlStyles.textAlign]}>{tx.csamWarning}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))}
            <TextInput
              style={[st.detailInput, rtlStyles.textAlign]}
              placeholder={tx.detailPlaceholder}
              placeholderTextColor="#6E7280"
              multiline
              numberOfLines={4}
              maxLength={500}
              value={detail}
              onChangeText={setDetail}
            />
            <View style={st.btnRow}>
              <TouchableOpacity style={st.cancelBtn} onPress={handleClose}>
                <Text style={st.cancelBtnText}>{tx.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.submitBtn, (!selectedReason || isSubmitting) && st.submitBtnOff]}
                onPress={handleSubmit}
                disabled={!selectedReason || isSubmitting}
              >
                {isSubmitting ? <RefreshCw size={20} color="#F0F0F5" /> : <Text style={st.submitBtnText}>{tx.submit}</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </View>
    </BottomSheet>
  );
}

const st = StyleSheet.create({
  subtitle: { fontSize: 13, color: '#797990', marginBottom: 16 },
  targetCard: {
    backgroundColor: '#0B0B11',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#181820',
    padding: 12,
    marginBottom: 12,
    gap: 6,
  },
  targetType: {
    fontSize: 11,
    color: '#8A8A9E',
    letterSpacing: 0.8,
  },
  targetTitle: {
    fontSize: 14,
    color: '#F0F0F5',
    fontFamily: Typography.fontFamily.semibold,
  },
  targetMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  targetMetaChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.24)',
    backgroundColor: 'rgba(212,168,83,0.10)',
  },
  targetMetaChipText: {
    color: '#D4A853',
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 4,
  },
  reasonRowSelected: { backgroundColor: '#0E0E14' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#2C2C38',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioOn: { borderColor: '#777' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#8A8A9E' },
  reasonText: { fontSize: 14, color: '#C8C8D4', flex: 1 },
  csamWarning: { fontSize: 11, color: '#FF5555', marginTop: 4, lineHeight: 16 },
  detailInput: {
    backgroundColor: '#050507',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#181820',
    color: '#C8C8D4',
    fontSize: 13,
    padding: 12,
    marginTop: 8,
    marginBottom: 16,
    minHeight: 92,
    textAlignVertical: 'top',
  },
  btnRow: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#181820',
    alignItems: 'center',
  },
  cancelBtnText: { color: '#797990', fontSize: 15 },
  submitBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#C00',
    alignItems: 'center',
  },
  submitBtnOff: { opacity: 0.4 },
  submitBtnText: { color: '#F0F0F5', fontSize: 15, fontFamily: Typography.fontFamily.semibold },
  doneBox: { alignItems: 'center', paddingVertical: 32 },
  doneTitle: { fontSize: 20, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5', marginBottom: 8 },
  doneTarget: { fontSize: 13, color: '#A7A7B5', textAlign: 'center', marginBottom: 10 },
  priorityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 12,
  },
  priorityBadgeText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
  },
  doneMsg: { fontSize: 14, color: '#777', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  closeBtn: { paddingHorizontal: 32, paddingVertical: 12, backgroundColor: '#181820', borderRadius: 10 },
  closeBtnText: { color: '#F0F0F5', fontSize: 16, fontFamily: Typography.fontFamily.semibold },
  modalContent: { maxHeight: 520, paddingBottom: 20 },
  checkIcon: { marginBottom: 12 },
  reasonTextWrapper: { flex: 1 },
});
