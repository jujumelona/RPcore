// src/components/Skeleton.tsx
// ══════════════════════════════════════════════════════════════════
//   이 파일은 하위 호환용 re-export shim입니다.
// 실제 구현 (Skia 기반 ShimmerProvider + useWindowDimensions 수정 포함)은
//   src/components/ui/Skeleton.tsx 에 있습니다.
//
// 기존 import 경로를 수정하지 않아도 신버전이 자동 적용됩니다.
//   import { SkeletonBox } from '../components/Skeleton';   // ← 그대로 유지 가능
// ══════════════════════════════════════════════════════════════════

export {
  ShimmerProvider,
  SkeletonBox,
  Skeleton,
  StoryCardSkeleton,
  StoryCardSkeletonList,
  SkeletonStoryGrid,
  SkeletonStoryRow,
  SkeletonPostList,
  SkeletonDetailRec,
  SkeletonStartButton } from './ui/Skeleton';
