// src/store/emotionSharedStore.ts
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧
// [OPT v2] 媛먯젙 SharedValue ?ㅽ넗??+ withSpring ?몃옖吏???뚯씠?꾨씪??//
// ? v2 媛쒖꽑: runOnUI ?덉뿉??吏곸젒 withSpring 援щ룞 ?????????????????
//   湲곗〈: svs[i].value = normalized  (利됱떆 ?먰봽 ??湲곌퀎??
//   ?섏젙: svs[i].value = withSpring(normalized, springConfig)
//         ??UI ?ㅻ젅?쒖뿉??吏곸젒 ?ㅽ봽留??쒖옉 ??JS 媛쒖엯 ?놁씠 ?먯뿰?ㅻ윭???꾩씠
//
// ? prevPathProgress 遺꾨━ ????????????????????????????????????????
//   SkiaEmotionRadar??Path morphing??progress SV???ш린??愿由?//   AI ??runOnUI ??progress=0 ??withSpring(1) ??GPU interpolation
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧

import { makeMutable, withSpring } from 'react-native-reanimated';

const EMOTION_COUNT = 5;

// Shared spring tuned for responsive but stable emotion transitions.
const EMOTION_SPRING = {
  damping: 22,
  stiffness: 140,
  mass: 0.8,
};

// 紐⑤뱢 ?덈꺼 罹먯떆
const _svStore       = new Map<string, ReturnType<typeof makeMutable<number>>[]>();
const _progressStore = new Map<string, ReturnType<typeof makeMutable<number>>>();

/**
 * storyId + charId????묓븯??媛먯젙 SharedValue 諛곗뿴 諛섑솚.
 * 媛?sv: 0.0~1.0 (??00~+100 媛먯젙媛??뺢퇋??
 */
export function getEmotionSharedValues(
  storyId: string,
  charId: number,
): ReturnType<typeof makeMutable<number>>[] {
  const key = `${storyId}:${charId}`;
  let svs = _svStore.get(key);
  if (!svs) {
    svs = Array.from({ length: EMOTION_COUNT }, () => makeMutable(0.5));
    _svStore.set(key, svs);
  }
  return svs;
}

/**
 * [v2 NEW] Path morphing??progress SharedValue 諛섑솚.
 * SkiaEmotionRadar媛 ??媛믪쑝濡?prevPath?뭖urrentPath 蹂닿컙.
 */
export function getEmotionProgress(
  storyId: string,
  charId: number,
): ReturnType<typeof makeMutable<number>> {
  const key = `${storyId}:${charId}:progress`;
  let progress = _progressStore.get(key);
  if (!progress) {
    progress = makeMutable(1); // 珥덇린媛?1 = ?꾩쟾???꾩옱 ?곹깭
    _progressStore.set(key, progress);
  }
  return progress;
}

/**
 * [v2 NEW] UI ?ㅻ젅?쒖뿉??吏곸젒 withSpring?쇰줈 媛먯젙媛??낅뜲?댄듃.
 * runOnUI ?덉뿉???몄텧?댁빞 ??('worklet' 而⑦뀓?ㅽ듃).
 *
 * 湲곗〈: svs[i].value = normalized  (利됱떆 ?먰봽)
 * ?섏젙: svs[i].value = withSpring(normalized, EMOTION_SPRING)
 *       ??臾쇰━ 湲곕컲 ?꾩꽦 ?꾩씠, 釉뚮┸吏 0?? */
/**
 * [BUG FIX] UI ?ㅻ젅?쒖뿉??吏곸젒 withSpring?쇰줈 媛먯젙媛??낅뜲?댄듃.
 *
 * ?댁쟾: 'worklet' ?⑥닔 ?대??먯꽌 _svStore.get(key) ?몄텧.
 *   _svStore??JS ?숈쓽 Map 媛앹껜 ??UI ?ㅻ젅??worklet)?먯꽌 JS ???묎렐?
 *   Reanimated ?꾪궎?띿쿂??遺덉븞?????고??꾩뿉 _svStore媛 undefined濡??됯??????덉쓬.
 *   getEmotionSharedValues()媛 JS?먯꽌 Map??梨꾩슦湲??꾩뿉 worklet???ㅽ뻾?섎㈃ svs=undefined.
 *
 * ?섏젙: JS ?ㅻ젅?쒖뿉??SharedValue 諛곗뿴??癒쇱? 議고쉶????runOnUI??吏곸젒 ?꾨떖.
 *   worklet? Map???묎렐?섏? ?딄퀬 ?꾨떖諛쏆? svs 諛곗뿴留??ъ슜.
 *   ?몄텧 ?⑦꽩: const svs = getEmotionSharedValues(storyId, charId);
 *             runOnUI(() => { 'worklet'; applyEmotionSpring(svs, progress, values); })();
 */
export function updateEmotionWithSpring(
  storyId: string,
  charId: number,
  normalizedValues: number[], // 湲몄씠 5, 媛?0.0~1.0
): void {
  // [BUG FIX #27] 'worklet' 吏?쒖뼱 ?쒓굅.
  // ???⑥닔??JS ?ㅻ젅?쒖뿉?쒕쭔 ?몄텧?섎ŉ ?대??먯꽌 JS Map(_svStore)???ъ슜?섎?濡?worklet?대㈃ ????
  const key  = `${storyId}:${charId}`;
  const svs  = _svStore.get(key);
  if (!svs) return;

  for (let i = 0; i < EMOTION_COUNT; i++) {
    const sv = svs[i];
    if (sv !== undefined) {
      sv.value = withSpring(normalizedValues[i] ?? 0.5, EMOTION_SPRING);
    }
  }

  const progressKey = `${storyId}:${charId}:progress`;
  const progress = _progressStore.get(progressKey);
  if (progress) {
    progress.value = 0;
    progress.value = withSpring(1, EMOTION_SPRING);
  }
}

/**
 * JS ?ㅻ젅?쒖뿉??SharedValue瑜?誘몃━ ?뺣낫????worklet??吏곸젒 ?꾨떖?섎뒗 ?덉쟾??踰꾩쟾.
 */
export function applyEmotionSpring(
  svs: ReturnType<typeof makeMutable<number>>[],
  progress: ReturnType<typeof makeMutable<number>> | null,
  normalizedValues: number[],
): void {
  'worklet';
  for (let i = 0; i < EMOTION_COUNT; i++) {
    const sv = svs[i];
    if (sv !== undefined) {
      sv.value = withSpring(normalizedValues[i] ?? 0.5, EMOTION_SPRING);
    }
  }
  if (progress) {
    progress.value = 0;
    progress.value = withSpring(1, EMOTION_SPRING);
  }
}

/**
 * ?ㅽ넗由?醫낅즺 ??SharedValue ?댁젣 (硫붾え由??꾩닔 諛⑹?)
 */
export function releaseStorySharedValues(storyId: string): void {
  const prefix = `${storyId}:`;
  for (const key of _svStore.keys()) {
    if (key.startsWith(prefix)) _svStore.delete(key);
  }
  for (const key of _progressStore.keys()) {
    if (key.startsWith(prefix)) _progressStore.delete(key);
  }
}

/**
 * ??00 ~ +100 ??0.0 ~ 1.0 ?뺢퇋??(worklet ?덉쟾)
 */
export function normalizeEmotion(raw: number): number {
  return (Math.max(-100, Math.min(100, raw)) + 100) / 200;
}

