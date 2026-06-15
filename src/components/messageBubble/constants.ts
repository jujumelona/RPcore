import { FadeInLeft, FadeInRight, FadeInUp, ReduceMotion } from 'react-native-reanimated';
import { Typography as Typo } from '../../constants/tokens';
import { EMOTION_META } from '../../constants/emotionMeta';

export const _enterAI = FadeInLeft
  .duration(260)
  .springify()
  .damping(18)
  .stiffness(120)
  .reduceMotion(ReduceMotion.Never);

export const _enterUser = FadeInRight
  .duration(240)
  .springify()
  .damping(18)
  .stiffness(120)
  .reduceMotion(ReduceMotion.Never);

export const _enterNarr = FadeInUp
  .duration(320)
  .springify()
  .damping(16)
  .stiffness(100)
  .reduceMotion(ReduceMotion.Never);

export const PROGRESSIVE_THRESHOLD = 500;
export const PROGRESSIVE_INITIAL = 300;

export const FONT_SIZE_MAP = {
  sm: Typo.size.sm,
  md: Typo.size.base,
  lg: Typo.size.lg } as const;

export { EMOTION_META };
