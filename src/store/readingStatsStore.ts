// src/store/readingStatsStore.ts
// ═══════════════════════════════════════════════════════════════════
//  Tachiyomi / LNReader 리딩 통계 패턴 이식
//  — 읽은 시간, 워드 카운트, 챕터 수, 연속 읽기 스트릭 추적
//
//  ✅ Zustand + MMKV persist
//  ✅ 일별 통계 집계
//  ✅ 스트릭 계산 (연속 읽기 일수)
//  ✅ 주간/월간 요약
// ═══════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKVStorage } from '../utils/mmkvZustandStorage';

// ── Types ──────────────────────────────────────────────────────────

export interface DailyStats {
  date: string; // YYYY-MM-DD
  readTimeMs: number;
  wordsRead: number;
  chaptersRead: number;
}

export interface ReadingSession {
  novelId: string;
  chapterId: string;
  startedAt: number;
  endedAt?: number;
  wordsRead: number;
}

interface ReadingStatsState {
  /** 일별 통계 (최근 90일) */
  dailyStats: Record<string, DailyStats>;
  /** 현재 읽기 세션 */
  currentSession: ReadingSession | null;
  /** 총 읽은 시간 (ms) */
  totalReadTimeMs: number;
  /** 총 읽은 단어 수 */
  totalWordsRead: number;
  /** 총 완독 챕터 수 */
  totalChaptersRead: number;

  // actions
  startSession: (_novelId: string, _chapterId: string) => void;
  endSession: (_wordsRead: number) => void;
  addChapterCompletion: () => void;
  getStreak: () => number;
  getWeeklyStats: () => DailyStats[];
  getMonthlyTotal: () => { readTimeMs: number; wordsRead: number; chaptersRead: number };
}

// ── Helpers ───────────────────────────────────────────────────────

function getDateKey(date?: Date): string {
  const d = date ?? new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getEmptyDaily(date: string): DailyStats {
  return { date, readTimeMs: 0, wordsRead: 0, chaptersRead: 0 };
}

// ── Store ─────────────────────────────────────────────────────────

const mmkvStorage = createMMKVStorage({ id: 'reading-stats' });

export const useReadingStatsStore = create<ReadingStatsState>()(
  persist(
    (set, get) => ({
      dailyStats: {},
      currentSession: null,
      totalReadTimeMs: 0,
      totalWordsRead: 0,
      totalChaptersRead: 0,

      startSession: (novelId, chapterId) => {
        const current = get().currentSession;
        // 기존 세션이 있으면 자동 종료
        if (current && !current.endedAt) {
          get().endSession(0);
        }
        set({
          currentSession: {
            novelId,
            chapterId,
            startedAt: Date.now(),
            wordsRead: 0 } });
      },

      endSession: (wordsRead) => {
        const session = get().currentSession;
        if (!session) return;

        const now = Date.now();
        const duration = now - session.startedAt;
        const dateKey = getDateKey();
        const daily = get().dailyStats[dateKey] ?? getEmptyDaily(dateKey);

        set(s => ({
          currentSession: null,
          totalReadTimeMs: s.totalReadTimeMs + duration,
          totalWordsRead: s.totalWordsRead + wordsRead,
          dailyStats: {
            ...s.dailyStats,
            [dateKey]: {
              ...daily,
              readTimeMs: daily.readTimeMs + duration,
              wordsRead: daily.wordsRead + wordsRead } } }));
      },

      addChapterCompletion: () => {
        const dateKey = getDateKey();
        const daily = get().dailyStats[dateKey] ?? getEmptyDaily(dateKey);

        set(s => ({
          totalChaptersRead: s.totalChaptersRead + 1,
          dailyStats: {
            ...s.dailyStats,
            [dateKey]: {
              ...daily,
              chaptersRead: daily.chaptersRead + 1 } } }));
      },

      getStreak: () => {
        const stats = get().dailyStats;
        let streak = 0;
        const today = new Date();

        for (let i = 0; i < 365; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const key = getDateKey(d);
          const day = stats[key];

          if (day && day.readTimeMs > 0) {
            streak++;
          } else if (i === 0) {
            // 오늘 아직 안 읽었으면 스트릭 끊기지 않음 (어제부터 체크)
            continue;
          } else {
            break;
          }
        }

        return streak;
      },

      getWeeklyStats: () => {
        const stats = get().dailyStats;
        const result: DailyStats[] = [];
        const today = new Date();

        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const key = getDateKey(d);
          result.push(stats[key] ?? getEmptyDaily(key));
        }

        return result;
      },

      getMonthlyTotal: () => {
        const stats = get().dailyStats;
        const today = new Date();
        const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

        let readTimeMs = 0;
        let wordsRead = 0;
        let chaptersRead = 0;

        for (const [key, day] of Object.entries(stats)) {
          if (key.startsWith(thisMonth)) {
            readTimeMs += day.readTimeMs;
            wordsRead += day.wordsRead;
            chaptersRead += day.chaptersRead;
          }
        }

        return { readTimeMs, wordsRead, chaptersRead };
      } }),
    {
      name: 'reading-stats-v1',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (s) => ({
        dailyStats: s.dailyStats,
        totalReadTimeMs: s.totalReadTimeMs,
        totalWordsRead: s.totalWordsRead,
        totalChaptersRead: s.totalChaptersRead }) },
  ),
);

// ── Utility: 시간 포맷 ────────────────────────────────────────────

export function formatReadTime(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 60) return `${totalMin}분`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${hours}시간 ${mins}분`;
}

export function formatReadTimeEn(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
