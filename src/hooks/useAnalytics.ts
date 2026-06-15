﻿// src/hooks/useAnalytics.ts
// ══════════════════════════════════════════════════════════════════════
// AnalyticsService + Sentry 편의 훅
//
// 사용법:
//   const { trackStoryStarted, trackChapterCompleted, setStoryCtx } = useAnalytics();
//
// Chat 화면 통합 경로에서 직접 import해서 사용.
// ══════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { AnalyticsService, EVENT } from '../services/AnalyticsService';
import { useAuthStore } from '../store/authStore';
import { useLanguageStore } from '../store/languageStore';

// ── 앱 시작 시 유저/디바이스 속성 세팅 훅 ─────────────────────────
export function useAnalyticsInit(opts: { deviceTier?: string; activeModelId?: string }) {
  const user = useAuthStore(s => s.user);
  const currentLanguage = useLanguageStore(s => s.currentLanguage);
  const didSetRef = useRef(false);

  useEffect(() => {
    if (!user || didSetRef.current) return;
    didSetRef.current = true;

    // Amplitude userId + 속성
    AnalyticsService.setUser({ id: user.id, email: user.email });
    AnalyticsService.setUserProperties({
      deviceTier: opts.deviceTier,
      language:   currentLanguage,
      modelId:    opts.activeModelId,
      platform:   Platform.OS });

    // Sentry user
    AnalyticsService.setSentryUser({ id: user.id, email: user.email });
  }, [user, opts.deviceTier, opts.activeModelId, currentLanguage]);
}

// ── 채팅/스토리 이벤트 훅 ─────────────────────────────────────────
export function useAnalytics() {
  const trackStoryStarted = useCallback((opts: {
    storyId: string;
    genre?:  string;
    modelId: string;
  }) => {
    AnalyticsService.setStoryContext({ storyId: opts.storyId, genre: opts.genre });
    AnalyticsService.logEvent(EVENT.STORY_STARTED, {
      story_id: opts.storyId,
      genre:    opts.genre,
      model_id: opts.modelId });
    AnalyticsService.addBreadcrumb({
      message:  `story_started: ${opts.storyId}`,
      category: 'navigation' });
  }, []);

  const trackChapterCompleted = useCallback((opts: {
    storyId:    string;
    chapterIdx: number;
    turnCount:  number;
    modelId:    string;
  }) => {
    AnalyticsService.logEvent(EVENT.CHAPTER_COMPLETED, {
      story_id:    opts.storyId,
      chapter_idx: opts.chapterIdx,
      turn_count:  opts.turnCount,
      model_id:    opts.modelId });
    AnalyticsService.setStoryContext({ storyId: opts.storyId, chapterIdx: opts.chapterIdx });
    AnalyticsService.addBreadcrumb({
      message:  `chapter_completed idx=${opts.chapterIdx}`,
      category: 'user_action',
      data:     { turn_count: opts.turnCount } });
  }, []);

  const trackChapterChanged = useCallback((opts: {
    storyId:    string;
    chapterIdx: number;
    modelId:    string;
  }) => {
    AnalyticsService.setStoryContext({ storyId: opts.storyId, chapterIdx: opts.chapterIdx });
    AnalyticsService.logEvent(EVENT.CHAPTER_CHANGED, {
      story_id:    opts.storyId,
      chapter_idx: opts.chapterIdx,
      model_id:    opts.modelId });
  }, []);

  const trackMessageSent = useCallback((opts: {
    storyId:  string;
    turn:     number;
    modelId:  string;
  }) => {
    AnalyticsService.addBreadcrumb({
      message:  `chat_message_sent turn=${opts.turn}`,
      category: 'user_action',
      data:     { story_id: opts.storyId, model_id: opts.modelId } });
    // 5턴마다 이벤트 전송 (너무 빈번하지 않게)
    if (opts.turn % 5 === 0) {
      AnalyticsService.logEvent(EVENT.CHAT_MESSAGE_SENT, {
        story_id: opts.storyId,
        turn:     opts.turn,
        model_id: opts.modelId });
    }
  }, []);

  const trackRefusal = useCallback((storyId: string, modelId: string) => {
    AnalyticsService.logEvent(EVENT.CHAT_REFUSAL_RECEIVED, {
      story_id: storyId,
      model_id: modelId });
  }, []);

  const trackKVCacheHit = useCallback((storyId: string) => {
    AnalyticsService.logEvent(EVENT.KV_CACHE_HIT, { story_id: storyId });
    AnalyticsService.addBreadcrumb({
      message:  'kv_cache_hit',
      category: 'kv_cache',
      data:     { story_id: storyId } });
  }, []);

  const trackModelLoaded = useCallback((modelId: string) => {
    AnalyticsService.setModelTag(modelId);
    AnalyticsService.logEvent(EVENT.MODEL_LOADED, { model_id: modelId });
    AnalyticsService.addBreadcrumb({
      message:  `model_loaded: ${modelId}`,
      category: 'engine' });
  }, []);

  const trackModelLoadFailed = useCallback((modelId: string, error: string) => {
    AnalyticsService.logEvent(EVENT.MODEL_LOAD_FAILED, { model_id: modelId, error });
    AnalyticsService.addBreadcrumb({
      message:  `model_load_failed: ${modelId}`,
      category: 'engine',
      level:    'error',
      data:     { error } });
  }, []);

  const setStoryCtx = useCallback((ctx: {
    storyId: string;
    genre?:  string;
    chapterIdx?: number;
  }) => {
    AnalyticsService.setStoryContext(ctx);
  }, []);

  return {
    trackStoryStarted,
    trackChapterCompleted,
    trackChapterChanged,
    trackMessageSent,
    trackRefusal,
    trackKVCacheHit,
    trackModelLoaded,
    trackModelLoadFailed,
    setStoryCtx };
}

