import React, { useRef, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Search } from 'lucide-react-native';
import { Radius, Typo, Typography } from '../../../constants/tokens';
import { makeA11yProps } from '../../../utils/a11yUtils';

interface LicenseSearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
  placeholder?: string;
}

export const LicenseSearchBar: React.FC<LicenseSearchBarProps> = ({
  value,
  onChangeText,
  onClear,
  placeholder = '라이브러리 이름으로 검색...' }) => {
  const inputRef = useRef<TextInput>(null);
  const animatedOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedOpacity, {
      toValue: value ? 1 : 0,
      duration: 180,
      useNativeDriver: true }).start();
    // [MEMORY LEAK FIX] Animated.Value 정리
    return () => {
      animatedOpacity.stopAnimation?.();
    };
  }, [value, animatedOpacity]);

  const handleClear = () => {
    onChangeText('');
    onClear();
    inputRef.current?.focus();
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Search size={20} color="#6B7280" style={styles.searchIcon} />

        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          clearButtonMode="never"
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          {...makeA11yProps({
            label: '오픈소스 라이브러리 검색',
            hint: '이름을 입력하면 라이선스 목록이 필터링됩니다' })}
        />

        <Animated.View style={[styles.clearWrap, { opacity: animatedOpacity }]} pointerEvents={value ? 'auto' : 'none'}>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={handleClear}
            {...makeA11yProps({
              label: '검색어 지우기',
              role: 'button' })}
          >
            <Text style={styles.clearText}>×</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E0E14',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 12,
    paddingVertical: 8 },
  searchIcon: {
    marginRight: 8 },
  input: {
    flex: 1,
    fontSize: Typo.size.md,
    color: '#111827',
    paddingVertical: 4,
    minHeight: 32 },
  clearWrap: {
    justifyContent: 'center',
    alignItems: 'center' },
  clearButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center' },
  clearText: {
    fontSize: 18,
    lineHeight: 20,
    color: '#6B7280',
    fontFamily: Typography.fontFamily.bold } });
