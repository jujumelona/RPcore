// react-native-vector-icons 제거됨 — lucide-react-native 사용
// react-native-fs 제거됨 — src/utils/fileSystemCompat.ts (expo-file-system 기반 shim) 사용

declare module 'expo-file-system/legacy' {
  const legacyFileSystem: Record<string, unknown>;
  export = legacyFileSystem;
}

declare module '@legendapp/list' {
  export const LegendList: import('react-native').ComponentType<Record<string, unknown>>;
  export type LegendListRef = any;
  export type LegendListRenderItemProps<T = unknown> = { item: T; index: number; separators?: Record<string, unknown> };
}

declare module 'react-native-gifted-charts' {
  import type * as React from 'react';

  export const LineChart: React.ComponentType<Record<string, unknown>>;
  export const BarChart: React.ComponentType<Record<string, unknown>>;
}

declare const atob: (_value: string) => string;
declare const btoa: (_value: string) => string;
declare const performance: { now(): number };
declare const navigator: { language?: string; languages?: string[]; userAgent?: string };
declare const module: { hot?: { accept?: () => void } };

declare class ReadableStream<T = unknown> {
  constructor(_source?: unknown);
  getReader(): ReadableStreamDefaultReader<T>;
}

declare interface ReadableStreamDefaultController<T = unknown> {
  enqueue(_chunk?: T): void;
  close(): void;
  error?(_reason?: unknown): void;
}

declare namespace Intl {
  class Segmenter {
    constructor(_locale?: string | string[], _options?: { granularity?: string });
    segment(_input: string): Iterable<{ segment: string }>;
  }
}

interface RequestInit {
  cache?: string;
}

// Legacy compatibility alias used by older screens and style casts.
// Keep it global so we can type-check existing code while replacing usages incrementally.
// [REMOVED] type YOUR_FIXME_INTERFACE was replaced by 'any' or specific types across the codebase.



declare module '@shopify/flash-list' {
  import type * as React from 'react';

  export type ListRenderItemInfo<TItem> = { item: TItem; index: number };
  export type FlashListRef<TItem> = {
    scrollToIndex: (opts: { index: number; animated?: boolean; viewPosition?: number }) => void;
    scrollToOffset: (opts: { offset: number; animated?: boolean }) => void;
    scrollToEnd: (opts?: { animated?: boolean }) => void;
  };
  export interface FlashListProps<TItem> {
    data?: TItem[];
    renderItem?: (info: ListRenderItemInfo<TItem>) => React.ReactElement | null;
    estimatedItemSize?: number;
    keyExtractor?: (item: TItem, index: number) => string;
    ItemSeparatorComponent?: React.ComponentType<any>;
    ListEmptyComponent?: React.ReactElement | null;
    ListHeaderComponent?: React.ReactElement | null;
    ListFooterComponent?: React.ReactElement | null;
    onEndReached?: () => void;
    onEndReachedThreshold?: number;
    onRefresh?: () => void;
    refreshing?: boolean;
    numColumns?: number;
    horizontal?: boolean;
    inverted?: boolean;
    showsVerticalScrollIndicator?: boolean;
    showsHorizontalScrollIndicator?: boolean;
    contentContainerStyle?: Record<string, unknown>;
    onViewableItemsChanged?: (info: { viewableItems: any[]; changed: any[] }) => void;
    viewabilityConfig?: Record<string, unknown>;
    extraData?: unknown;
    [key: string]: unknown;
  }

  export const FlashList: <TItem = any>(
    props: FlashListProps<TItem> & { ref?: React.Ref<FlashListRef<TItem>> }
  ) => React.ReactElement | null;
}


declare class TextDecoder { constructor(_encoding?: string); decode(_input?: ArrayBuffer | ArrayBufferView): string; }
declare class TextEncoder { constructor(); encode(_input?: string): Uint8Array; }
declare function requestIdleCallback(_callback: (_deadline: { timeRemaining: () => number; didTimeout: boolean }) => void, _options?: { timeout?: number }): number;
declare function cancelIdleCallback(_id: number): void;

interface URLSearchParams {
  set(_name: string, _value: string): void;
  get(_name: string): string | null;
  toString(): string;
  append(_name: string, _value: string): void;
  delete(_name: string): void;
}
