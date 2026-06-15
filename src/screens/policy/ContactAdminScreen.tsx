import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Image } from 'expo-image';
import { Image as ImageIcon, Send, X } from 'lucide-react-native';

import { ToastService } from '../../components/Toast';
import { Spinner } from '../../components/ui/Spinner';
import { PremiumActionButton, PremiumPanel } from '../../components/ui/PremiumSurface';
import { PremiumHeaderBar, PremiumHeroCard, PremiumScreenShell } from '../../components/ui/PremiumScreenShell';
import { Radius, Space, Typo, Typography } from '../../constants/tokens';
import { SERVER_BASE } from '../../config/ApiConfig';
import { getRuntimeMessages } from '../../i18n/runtimeMessages';
import { useAuthStore } from '../../store/authStore';
import { useLanguageStore } from '../../store/languageStore';
import type { ScreenProps } from '../../types/navigation';
import { openImageLibrary, requestPhotoLibraryPermission } from '../../utils/runtimePermissions';
import { useShallow } from 'zustand/react/shallow';

function getContactLabels(t: Record<string, string | undefined>) {
  return {
    title: t.supportTitle || '',
    subtitle: t.prioritySupport || '',
    eyebrow: t.supportNewInquiry || '',
    description: t.supportGuideDescription || '',
    subjectLabel: t.supportSubjectLabel || '',
    subjectPlaceholder: t.supportSubjectPlaceholder || '',
    contentLabel: t.supportContentLabel || '',
    contentPlaceholder: t.supportContentPlaceholder || '',
    attachmentLabel: t.supportAttachmentLabel || '',
    attachmentAdd: t.supportAttachmentAdd || '',
    attachmentChange: t.supportAttachmentChange || '',
    sendTitle: t.supportSendInquiry || '',
    sendDescription: t.supportEmptyDescription || '',
    sending: t.supportSendingInquiry || '',
    titleRequired: t.supportTitleRequired || '',
    contentRequired: t.supportContentRequired || '',
    needLogin: t.supportNeedLogin || '',
    photoPermission: t.supportPhotoPermission || '',
    createSuccess: t.supportCreateSuccess || '',
    createFailed: t.supportCreateFailed || '',
  };
}

function buildUploadMetadata(uri: string) {
  const rawName = uri.split('/').filter(Boolean).pop();
  if (rawName && /\.[A-Za-z0-9]+$/.test(rawName)) {
    const match = /\.(\w+)$/.exec(rawName);
    return {
      name: rawName,
      type: match ? `image/${match[1].toLowerCase()}` : 'image/jpeg',
    };
  }

  return {
    name: `support-upload-${Date.now()}.jpg`,
    type: 'image/jpeg',
  };
}

export function ContactAdminScreen({ navigation }: ScreenProps<'ContactAdmin'>) {
  const { t, currentLanguage } = useLanguageStore(
    useShallow(state => ({
      t: state.t,
      currentLanguage: state.currentLanguage,
    })),
  );
  const user = useAuthStore(state => state.user);
  const rm = getRuntimeMessages(currentLanguage);
  const labels = getContactLabels(t as Record<string, string | undefined>);

  const [titleText, setTitleText] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const handlePickPhoto = async () => {
    const granted = await requestPhotoLibraryPermission();
    if (!granted) {
      ToastService.error(labels.photoPermission);
      return;
    }

    const result = await openImageLibrary({ mediaType: 'photo', quality: 0.7, selectionLimit: 1 });
    if (result.didCancel) return;
    if (result.errorCode) {
      ToastService.error(rm.imageLibraryOpenFailed);
      return;
    }

    const uri = result.assets?.[0]?.uri;
    if (uri) {
      setPhotoUri(uri);
    }
  };

  const handleSend = async () => {
    if (sending) return;
    if (!titleText.trim()) {
      ToastService.error(labels.titleRequired);
      return;
    }
    if (!bodyText.trim()) {
      ToastService.error(labels.contentRequired);
      return;
    }
    if (!user?.jwtToken) {
      ToastService.error(labels.needLogin);
      return;
    }

    setSending(true);
    try {
      const formData = new FormData();
      formData.append('title', titleText.trim());
      formData.append('body', bodyText.trim());
      formData.append('user_id', user.id);
      formData.append('email', user.email);
      formData.append('name', user.name ?? '');

      if (photoUri) {
        const upload = buildUploadMetadata(photoUri);
        formData.append('photo', {
          uri: photoUri,
          name: upload.name,
          type: upload.type,
        } as unknown as Blob);
      }

      const response = await fetch(`${SERVER_BASE}/admin/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.jwtToken}` },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
      }

      ToastService.success(labels.createSuccess);
      navigation.goBack();
    } catch (error: unknown) {
      console.error('[ContactAdmin] Send failed:', error);
      ToastService.error(labels.createFailed);
    } finally {
      setSending(false);
    }
  };

  return (
    <PremiumScreenShell
      header={<PremiumHeaderBar title={labels.title} subtitle={labels.subtitle} onBack={() => navigation.goBack()} />}
      contentContainerStyle={styles.contentContainer}
    >
      <PremiumHeroCard
        eyebrow={labels.eyebrow}
        title={labels.title}
        description={labels.description}
      />

      <PremiumPanel padding={Space['4']} style={styles.formPanel}>
        <Text style={styles.label}>{labels.subjectLabel}</Text>
        <TextInput
          style={styles.input}
          value={titleText}
          onChangeText={setTitleText}
          placeholder={labels.subjectPlaceholder}
          placeholderTextColor={'#797990'}
          maxLength={100}
        />

        <Text style={[styles.label, styles.labelSpacing]}>{labels.contentLabel}</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={bodyText}
          onChangeText={setBodyText}
          placeholder={labels.contentPlaceholder}
          placeholderTextColor={'#797990'}
          multiline
          textAlignVertical="top"
          maxLength={1200}
        />
        <Text style={styles.counter}>{bodyText.length}/1200</Text>
      </PremiumPanel>

      <PremiumPanel padding={Space['4']} style={styles.attachmentPanel}>
        <View style={styles.attachmentHeader}>
          <Text style={styles.sectionTitle}>{labels.attachmentLabel}</Text>
          <PremiumActionButton onPress={handlePickPhoto} style={styles.attachmentButton} active>
            <View style={styles.attachmentButtonContent}>
              <ImageIcon size={16} color={'#050507'} />
              <Text style={styles.attachmentButtonText}>
                {photoUri ? labels.attachmentChange : labels.attachmentAdd}
              </Text>
            </View>
          </PremiumActionButton>
        </View>

        {photoUri ? (
          <View style={styles.previewWrap}>
            <Image source={{ uri: photoUri }} style={styles.previewImage} contentFit="cover" />
            <PremiumActionButton onPress={() => setPhotoUri(null)} style={styles.removeButton}>
              <X size={16} color={'#F0F0F5'} />
            </PremiumActionButton>
          </View>
        ) : null}
      </PremiumPanel>

      <PremiumPanel padding={Space['4']} style={styles.sendPanel}>
        <Text style={styles.sectionTitle}>{labels.sendTitle}</Text>
        <Text style={styles.sectionSubtitle}>{labels.sendDescription}</Text>
        <PremiumActionButton onPress={handleSend} style={[styles.sendButton, sending && styles.sendButtonDisabled]} active>
          <View style={styles.sendButtonContent}>
            {sending ? <Spinner size={16} color={'#050507'} /> : <Send size={16} color={'#050507'} />}
            <Text style={styles.sendButtonText}>{sending ? labels.sending : labels.sendTitle}</Text>
          </View>
        </PremiumActionButton>
      </PremiumPanel>
    </PremiumScreenShell>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    gap: Space['4'],
  },
  formPanel: {
    borderRadius: Radius.xl,
  },
  label: {
    color: '#797990',
    fontSize: Typo.size.xs,
    fontFamily: Typography.fontFamily.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  labelSpacing: {
    marginTop: Space['4'],
  },
  input: {
    backgroundColor: '#0C0C14',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#1A1A24',
    paddingHorizontal: Space['4'],
    paddingVertical: Space['4'],
    color: '#F0F0F5',
    fontSize: Typo.size.base,
    fontFamily: Typography.fontFamily.regular,
  },
  textArea: {
    minHeight: 180,
  },
  counter: {
    marginTop: 8,
    textAlign: 'right',
    color: '#797990',
    fontSize: Typo.size.xs,
    fontFamily: Typography.fontFamily.medium,
  },
  attachmentPanel: {
    borderRadius: Radius.xl,
  },
  attachmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space['3'],
  },
  sectionTitle: {
    flex: 1,
    color: '#F0F0F5',
    fontSize: Typo.size.base,
    fontFamily: Typography.fontFamily.bold,
  },
  sectionSubtitle: {
    marginTop: 4,
    color: '#8A8A9E',
    fontSize: Typo.size.sm,
    lineHeight: 20,
    fontFamily: Typography.fontFamily.regular,
  },
  attachmentButton: {
    minWidth: 92,
  },
  attachmentButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space['2'],
  },
  attachmentButtonText: {
    color: '#050507',
    fontSize: Typo.size.sm,
    fontFamily: Typography.fontFamily.bold,
  },
  previewWrap: {
    marginTop: Space['4'],
    position: 'relative',
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 220,
    borderRadius: Radius.xl,
  },
  removeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
  },
  sendPanel: {
    borderRadius: Radius.xl,
    marginBottom: Space['6'],
  },
  sendButton: {
    marginTop: Space['4'],
  },
  sendButtonDisabled: {
    opacity: 0.7,
  },
  sendButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space['2'],
  },
  sendButtonText: {
    color: '#050507',
    fontSize: Typo.size.sm,
    fontFamily: Typography.fontFamily.bold,
  },
});