/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * src/screens/characters/components/CharacterFilterBar.tsx
 * 캐릭터 필터 바 — 장르 칩 + 정렬 + 검색
 */

import { Typography } from '../../../constants/tokens';
import React, { useCallback, useRef, memo } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions, TextInput } from 'react-native';
import { PressableOpacity } from '../../../components/PressableOpacity';
import { Search, SlidersHorizontal } from 'lucide-react-native';

const { width: SCR_W } = (Dimensions.get('window') ?? { width: 375, height: 812 });

export interface FilterBarProps {
  genres: Array<{ id: string; label: string; emoji?: string }>;
  selectedGenre: string;
  onGenreSelect: (id: string) => void;
  sortLabel: string;
  onSortPress: () => void;
  searchValue: string;
  onSearchChange: (text: string) => void;
  searchFocused?: boolean;
  onSearchFocus?: () => void;
  onSearchBlur?: () => void;
  t?: Record<string, string | undefined>;
}

export const CharacterFilterBar = memo(function CharacterFilterBar({
  genres, selectedGenre, onGenreSelect,
  sortLabel, onSortPress,
  searchValue, onSearchChange,
  searchFocused: _searchFocused, onSearchFocus, onSearchBlur,
  t
  }: FilterBarProps) {
  const scrollRef = useRef<ScrollView>(null);
  const layouts = useRef<Record<string, { x: number; width: number }>>({});

  const handleGenreSelect = useCallback((id: string) => {
    onGenreSelect(id);
    const layout = layouts.current[id];
    if (layout && scrollRef.current) {
      const scrollX = layout.x - SCR_W / 2 + layout.width / 2;
      scrollRef.current.scrollTo({ x: Math.max(0, scrollX), animated: true });
    }
  }, [onGenreSelect]);

  return (
    <View>
      {/* 검색 바 */}
      <View style={st.searchWrap}>
        <Search size={16} color="#797990" />
        <TextInput
          style={st.searchInput}
          value={searchValue}
          onChangeText={onSearchChange}
          placeholder={String(t?.searchCharacters ?? t?.searchDots ?? t?.search ?? '')}
          placeholderTextColor="#4A4A5E"
          onFocus={onSearchFocus}
          onBlur={onSearchBlur}
          returnKeyType="search"
        />
        <PressableOpacity onPress={onSortPress} style={st.filterBtn}>
          <SlidersHorizontal size={16} color="#C8C8D4" />
          <Text style={st.filterLabel}>{sortLabel}</Text>
        </PressableOpacity>
      </View>

      {/* 장르 칩 */}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={st.chipScroll}
        contentContainerStyle={st.chipContent}
      >
        {genres.map(g => {
          const sel = selectedGenre === g.id;
          return (
            <PressableOpacity
              key={g.id}
              style={[st.chip, sel && st.chipSel]}
              onPress={() => handleGenreSelect(g.id)}
              onLayout={e => {
                layouts.current[g.id] = {
                  x: e.nativeEvent.layout.x,
                  width: e.nativeEvent.layout.width
  };
              }}
            >
              {g.emoji && <Text style={st.chipEmoji}>{g.emoji}</Text>}
              <Text style={[st.chipText, sel && st.chipTextSel]}>{g.label}</Text>
            </PressableOpacity>
          );
        })}
      </ScrollView>

      <View style={st.divider} />
    </View>
  );
});

const st = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 14, marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12, paddingVertical: 11 },
  searchInput: {
    flex: 1, fontSize: 14, fontFamily: Typography.fontFamily.regular,
    color: '#E0E0F0', padding: 0 },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: 'rgba(255,255,255,0.1)',
    paddingLeft: 10 },
  filterLabel: {
    fontSize: 12, fontFamily: Typography.fontFamily.medium, color: '#9090B0' },

  chipScroll: { flexGrow: 0 },
  chipContent: {
    paddingHorizontal: 14, gap: 6, paddingBottom: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 9, paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: '#09090F', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)' },
  chipSel: {
    backgroundColor: 'rgba(212,168,83,0.10)',
    borderColor: 'rgba(212,168,83,0.4)' },
  chipEmoji: { fontSize: 0, width: 0 },
  chipText: {
    fontSize: 12, fontFamily: Typography.fontFamily.medium, color: '#454560' },
  chipTextSel: { color: '#C8A040', fontFamily: Typography.fontFamily.semibold },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 14, marginBottom: 6 } });
