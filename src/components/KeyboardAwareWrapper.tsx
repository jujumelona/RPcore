// src/components/KeyboardAwareWrapper.tsx
import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import { ScrollView, type ScrollViewProps, StyleSheet } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

interface Props extends ScrollViewProps {
  extraBottomPadding?: number;
}

export const KeyboardAwareWrapper = forwardRef<ScrollView, React.PropsWithChildren<Props>>((
  { children, extraBottomPadding = 300, style, contentContainerStyle, ...rest }, ref
): React.ReactElement => {
  const scrollRef = useRef<ScrollView>(null);

  useImperativeHandle(ref, () => scrollRef.current as ScrollView);

  return (
    <KeyboardAwareScrollView
      ref={scrollRef as any}
      style={[styles.container, style]}
      contentContainerStyle={[
        { paddingBottom: extraBottomPadding },
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      // [FIX] iOS에서 키보드 열린 채 스크롤 시 튕기는 현상 방지
      bottomOffset={30}
      {...rest}
    >
      {children}
    </KeyboardAwareScrollView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1 } });
