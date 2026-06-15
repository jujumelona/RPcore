export type EmotionMetaKey = 'e1' | 'e2' | 'e3' | 'e4' | 'e5';

export interface EmotionMetaItem {
  icon: string;
  label: string;
  posColor: string;
  negColor: string;
}

export const EMOTION_META: Record<EmotionMetaKey, EmotionMetaItem> = {
  e1: { icon: '◆', label: 'Valence', posColor: '#D4A853', negColor: '#FF5555' },
  e2: { icon: '★', label: 'Trust', posColor: '#60A5FA', negColor: '#8B5CF6' },
  e3: { icon: '▲', label: 'Dominance', posColor: '#4ADE80', negColor: '#8A5A9A' },
  e4: { icon: '!', label: 'Arousal', posColor: '#F59E0B', negColor: '#60A5FA' },
  e5: { icon: '♥', label: 'Attachment', posColor: '#8B5CF6', negColor: '#5A5A7A' } };

export const PAD_EMOTION_ORDER: EmotionMetaKey[] = ['e1', 'e2', 'e3', 'e4', 'e5'];
