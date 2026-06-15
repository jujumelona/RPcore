import { Typography } from '../constants/tokens';
﻿﻿import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguageStore } from '../store/languageStore';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

function getT() {
  return useLanguageStore.getState().t;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary] 에러 발생:', error.message);
    console.error('[ErrorBoundary] 스택:', error.stack);
    console.error('[ErrorBoundary] 컴포넌트 스택:', errorInfo.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      // fallback이 명시적으로 제공된 경우 사용
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }

      // 기본 에러 UI 표시
      return (
        <SafeAreaView style={s.container}>
          <ScrollView contentContainerStyle={s.content}>
            <Text style={s.title}>{getT()?.appError ?? ''}</Text>
            <View style={s.errorBox}>
              <Text style={s.errorMsg}>
                {this.state.error?.message ?? getT()?.unknownError ?? ''}
              </Text>
              {__DEV__ && this.state.error?.stack && (
                <Text style={s.errorStack} numberOfLines={20}>
                  {this.state.error.stack}
                </Text>
              )}
            </View>
            <TouchableOpacity style={s.retryBtn} onPress={this.handleReset}>
              <Text style={s.retryTxt}>{getT()?.retryBtn ?? ''}</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#08080C' },
  content: { flexGrow: 1, padding: 20 },
  title: { fontSize: 18, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5', marginBottom: 16, marginTop: 20 },
  errorBox: {
    backgroundColor: '#13131A', borderRadius: 8, padding: 14,
    borderWidth: 1, borderColor: '#FF5555', marginBottom: 20 },
  errorMsg: { fontSize: 13, color: '#FF5555', fontFamily: Typography.fontFamily.bold, marginBottom: 8 },
  errorStack: { fontSize: 10, color: '#8A8A9E', fontFamily: 'monospace' },
  retryBtn: {
    backgroundColor: '#D4A853', padding: 14, borderRadius: 10, alignItems: 'center' },
  retryTxt: { color: '#050507', fontSize: 15, fontFamily: Typography.fontFamily.bold } });
