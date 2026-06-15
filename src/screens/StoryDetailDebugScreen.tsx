import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Typography } from '../constants/tokens';

type DebugCharacter = Record<string, unknown>;
type DebugStory = Record<string, unknown>;

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value);
  }
}

function pickCharacterBlock(character: DebugCharacter | undefined) {
  if (!character) return null;

  const rawSource = (character.rawSource as DebugCharacter | undefined) ?? {};

  return {
    id: character.id ?? rawSource.id ?? '',
    name: character.name ?? rawSource.name ?? '',
    isUser: Boolean(character.isUser ?? rawSource.isUser),
    appearance:
      character.appearance ??
      rawSource.appearance ??
      rawSource.traits ??
      '',
    setting:
      character.setting ??
      rawSource.setting ??
      rawSource.description ??
      '',
    personality:
      character.personality ??
      rawSource.personality ??
      rawSource.description ??
      rawSource.setting ??
      '',
    speech:
      character.speech ??
      rawSource.speech ??
      rawSource.speechPattern ??
      rawSource.speech_pattern ??
      rawSource.personalityExample ??
      '',
    initialEmotions:
      character.initialEmotions ??
      rawSource.initialEmotions ??
      rawSource.initial_emotions ??
      rawSource.emotions ??
      rawSource.emotion_state ??
      rawSource.emotionState ??
      {
        valence: rawSource.valence,
        trust: rawSource.trust,
        dominance: rawSource.dominance,
        arousal: rawSource.arousal,
        attachment: rawSource.attachment,
      },
    rawSource,
    rendered: character,
  };
}

function firstNonEmptyField(source: DebugCharacter, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return { key, value: value.trim() };
    }
  }
  return { key: '', value: '' };
}

function hasMeaningfulEmotionValue(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const entries = Object.values(value as Record<string, unknown>);
  return entries.some(entry => typeof entry === 'number' && Math.abs(entry) > 0);
}

function DebugCheckRow({
  label,
  ok,
  source,
  value,
}: {
  label: string;
  ok: boolean;
  source?: string;
  value?: unknown;
}) {
  return (
    <View style={st.checkRow}>
      <View style={[st.badge, ok ? st.badgeOk : st.badgeFail]}>
        <Text style={st.badgeText}>{ok ? 'OK' : 'MISSING'}</Text>
      </View>
      <View style={st.checkBody}>
        <Text style={st.checkLabel}>{label}</Text>
        {!!source && <Text style={st.checkMeta}>source: {source}</Text>}
        {value !== undefined && value !== '' && (
          <Text style={st.checkValue} numberOfLines={3}>
            {typeof value === 'string' ? value : pretty(value)}
          </Text>
        )}
      </View>
    </View>
  );
}

function Section({ title, value }: { title: string; value: unknown }) {
  return (
    <View style={st.section}>
      <Text style={st.sectionTitle}>{title}</Text>
      <Text style={st.sectionBody}>{pretty(value)}</Text>
    </View>
  );
}

export function StoryDetailDebugScreen({
  route,
}: {
  route?: {
    params?: {
      storyRaw?: DebugStory;
      storyDisplay?: DebugStory;
      renderedCharacters?: DebugCharacter[];
      authorId?: string;
      authorName?: string;
    };
  };
}) {
  const storyRaw = route?.params?.storyRaw ?? {};
  const storyDisplay = route?.params?.storyDisplay ?? {};
  const renderedCharacters = useMemo(() => route?.params?.renderedCharacters ?? [], [route?.params?.renderedCharacters]);
  const authorId = route?.params?.authorId ?? '';
  const authorName = route?.params?.authorName ?? '';

  const protagonist = useMemo(
    () => renderedCharacters.find(character => !!character?.isUser),
    [renderedCharacters],
  );

  const npcCharacters = useMemo(
    () => renderedCharacters.filter(character => !character?.isUser),
    [renderedCharacters],
  );

  const protagonistSummary = useMemo(() => {
    const raw = ((protagonist as DebugCharacter | undefined)?.rawSource as DebugCharacter | undefined) ?? {};
    const rendered = (protagonist as DebugCharacter | undefined) ?? {};
    const setting = firstNonEmptyField(
      { ...raw, ...rendered },
      ['setting', 'description', 'personality'],
    );
    return {
      setting,
      emotions:
        rendered.initialEmotions ??
        raw.initialEmotions ??
        raw.initial_emotions ??
        raw.emotions ??
        raw.emotion_state ??
        raw.emotionState,
    };
  }, [protagonist]);

  const npcSummary = useMemo(() => {
    return npcCharacters.map(character => {
      const raw = ((character.rawSource as DebugCharacter | undefined) ?? {}) as DebugCharacter;
      const rendered = character as DebugCharacter;
      const personality = firstNonEmptyField(
        { ...raw, ...rendered },
        ['personality', 'description', 'setting'],
      );
      const speech = firstNonEmptyField(
        { ...raw, ...rendered },
        ['speech', 'speechPattern', 'speech_pattern', 'personalityExample'],
      );
      const emotions =
        rendered.initialEmotions ??
        raw.initialEmotions ??
        raw.initial_emotions ??
        raw.emotions ??
        raw.emotion_state ??
        raw.emotionState;
      return {
        id: String(character.id ?? ''),
        name: String(character.name ?? ''),
        personality,
        speech,
        emotions,
      };
    });
  }, [npcCharacters]);

  return (
    <SafeAreaView style={st.safeArea}>
      <ScrollView style={st.scroll} contentContainerStyle={st.content}>
        <Text style={st.title}>Story Detail Debug</Text>
        <Text style={st.subtitle}>Render path vs source path</Text>

        <View style={st.section}>
          <Text style={st.sectionTitle}>Quick Checks</Text>
          <DebugCheckRow
            label="Author ID"
            ok={Boolean(authorId)}
            value={authorId}
          />
          <DebugCheckRow
            label="Author Name"
            ok={Boolean(authorName)}
            value={authorName}
          />
          <DebugCheckRow
            label="Protagonist Setting"
            ok={Boolean(protagonistSummary.setting.value)}
            source={protagonistSummary.setting.key}
            value={protagonistSummary.setting.value}
          />
          <DebugCheckRow
            label="Protagonist Emotions"
            ok={hasMeaningfulEmotionValue(protagonistSummary.emotions)}
            value={protagonistSummary.emotions}
          />
          {npcSummary.map((npc, index) => (
            <View key={`${npc.id}-${index}`} style={st.npcGroup}>
              <Text style={st.npcTitle}>{npc.name || `NPC ${index + 1}`}</Text>
              <DebugCheckRow
                label="Personality"
                ok={Boolean(npc.personality.value)}
                source={npc.personality.key}
                value={npc.personality.value}
              />
              <DebugCheckRow
                label="Speech"
                ok={Boolean(npc.speech.value)}
                source={npc.speech.key}
                value={npc.speech.value}
              />
              <DebugCheckRow
                label="Emotions"
                ok={hasMeaningfulEmotionValue(npc.emotions)}
                value={npc.emotions}
              />
            </View>
          ))}
        </View>

        <Section
          title="Author"
          value={{
            authorId,
            authorName,
            storyAuthorId:
              storyRaw.authorId ??
              storyRaw.author_id ??
              storyDisplay.authorId ??
              storyDisplay.author_id,
            storyAuthor:
              storyRaw.author ??
              storyRaw.author_nickname ??
              storyDisplay.author,
          }}
        />

        <Section
          title="Protagonist Summary"
          value={pickCharacterBlock((protagonist as DebugCharacter | undefined) ?? undefined)}
        />

        {npcCharacters.map((character, index) => (
          <Section
            key={String(character.id ?? index)}
            title={`NPC ${index + 1} Summary`}
            value={pickCharacterBlock(character)}
          />
        ))}

        <Section title="Raw story.characters" value={storyRaw.characters} />
        <Section
          title="Raw story.story_config.characters"
          value={(storyRaw.story_config as DebugStory | undefined)?.characters}
        />
        <Section title="Normalized storyDisplay.characters" value={storyDisplay.characters} />
        <Section title="Rendered characters" value={renderedCharacters} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050507',
  },
  scroll: {
    flex: 1,
    backgroundColor: '#050507',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
    gap: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 28,
    fontFamily: Typography.fontFamily.bold,
  },
  subtitle: {
    color: '#A5A8B3',
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Typography.fontFamily.medium,
    marginBottom: 4,
  },
  section: {
    backgroundColor: '#0F1016',
    borderWidth: 1,
    borderColor: '#1C1E28',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  sectionTitle: {
    color: '#E6C46A',
    fontSize: 14,
    lineHeight: 18,
    fontFamily: Typography.fontFamily.bold,
  },
  sectionBody: {
    color: '#E8EAF0',
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Typography.fontFamily.regular,
  },
  checkRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  badge: {
    minWidth: 66,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  badgeOk: {
    backgroundColor: 'rgba(70,194,118,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(70,194,118,0.4)',
  },
  badgeFail: {
    backgroundColor: 'rgba(255,96,96,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,96,96,0.4)',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    lineHeight: 12,
    fontFamily: Typography.fontFamily.bold,
  },
  checkBody: {
    flex: 1,
    gap: 2,
  },
  checkLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 17,
    fontFamily: Typography.fontFamily.bold,
  },
  checkMeta: {
    color: '#C7A85C',
    fontSize: 11,
    lineHeight: 15,
    fontFamily: Typography.fontFamily.medium,
  },
  checkValue: {
    color: '#D9DBE2',
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Typography.fontFamily.regular,
  },
  npcGroup: {
    gap: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#1C1E28',
    marginTop: 4,
  },
  npcTitle: {
    color: '#E6C46A',
    fontSize: 13,
    lineHeight: 17,
    fontFamily: Typography.fontFamily.bold,
  },
});
