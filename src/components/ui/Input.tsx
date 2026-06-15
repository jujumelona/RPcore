/* eslint-disable @typescript-eslint/no-unused-vars */
import { ReactNode, forwardRef, useCallback } from 'react';
import { StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle } from 'react-native';
import { TextInput, type TextInputProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming
  } from 'react-native-reanimated';

import { Duration, Radius, Space, Typography } from '../../constants/tokens';

const BORDER_DEFAULT = '#181820';

interface InputProps extends TextInputProps {
  containerStyle?: ViewStyle;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  focusColor?: string;
  label?: string;
  helperText?: string;
  errorText?: string;
  required?: boolean;
  labelStyle?: TextStyle;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    containerStyle,
    leftSlot,
    rightSlot,
    focusColor = '#D4A853',
    onFocus,
    onBlur,
    style,
    label,
    helperText,
    errorText,
    required = false,
    labelStyle,
    editable = true,
    ...rest
  },
  ref,
) {
  const focused = useSharedValue(0);
  const borderColor = useSharedValue(BORDER_DEFAULT);

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: borderColor.value
  }));

  const handleFocus = useCallback(
    (e: any) => {
      focused.value = withTiming(1, { duration: Duration.fast });
      borderColor.value = errorText ? '#FF5555' : focusColor;
      onFocus?.(e as import('react-native').NativeSyntheticEvent<import('react-native').TextInputFocusEventData>);
    },
    [onFocus, focused, borderColor, focusColor, errorText],
  );

  const handleBlur = useCallback(
    (e: any) => {
      focused.value = withTiming(0, { duration: Duration.normal });
      borderColor.value = errorText ? '#FF5555' : BORDER_DEFAULT;
      onBlur?.(e as import('react-native').NativeSyntheticEvent<import('react-native').TextInputFocusEventData>);
    },
    [onBlur, focused, borderColor, errorText],
  );

  return (
    <View style={styles.fieldWrap}>
      {label ? (
        <Text style={[styles.label, labelStyle]}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}

      <Animated.View
        style={[
          styles.container,
          borderStyle,
          !editable && styles.containerDisabled,
          errorText && styles.containerError,
          containerStyle,
        ]}
      >
        {leftSlot ? <View style={styles.leftSlot}>{leftSlot}</View> : null}

        <TextInput
          ref={ref}
          style={[styles.input, !editable && styles.inputDisabled, style]}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholderTextColor="#797990"
          cursorColor={errorText ? '#FF5555' : '#D4A853'}
          selectionColor={errorText ? 'rgba(255,85,85,0.14)' : 'rgba(212,168,83,0.14)'}
          underlineColorAndroid="transparent"
          editable={editable}
          accessibilityState={{ disabled: !editable }}
          {...rest}
        />

        {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
      </Animated.View>

      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
      {!errorText && helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
    </View>
  );
});

interface SearchInputProps extends Omit<InputProps, 'leftSlot'> {
  searchIcon?: ReactNode;
  clearIcon?: ReactNode;
  showClear?: boolean;
  onClear?: () => void;
}

export function SearchInput({
  searchIcon,
  clearIcon,
  showClear,
  onClear: _onClear,
  ...rest
}: SearchInputProps) {
  return (
    <Input
      leftSlot={searchIcon ? <View style={styles.searchIconWrap}>{searchIcon}</View> : undefined}
      rightSlot={showClear && clearIcon ? <View style={styles.clearWrap}>{clearIcon}</View> : undefined}
      returnKeyType="search"
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  fieldWrap: {
    width: '100%'
  },
  label: {
    marginBottom: 8,
    color: '#C8C8D4',
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.medium
  },
  required: {
    color: '#FF5555',
    fontFamily: Typography.fontFamily.bold
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#13131A',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(34,34,46,0.7)',
    paddingHorizontal: Space['4'],
    minHeight: 52,
    elevation: 3
  },
  containerDisabled: {
    opacity: 0.55
  },
  containerError: {
    borderColor: '#FF5555',
    backgroundColor: '#1A1012'
  },
  input: {
    flex: 1,
    fontSize: Typography.size.base,
    color: '#F0F0F5',
    fontFamily: Typography.fontFamily.regular,
    paddingVertical: Space['3'],
    letterSpacing: Typography.letterSpacing.normal,
    textAlignVertical: 'center'
  },
  inputDisabled: {
    color: '#8A8A9E'
  },
  leftSlot: {
    marginRight: Space['3'],
    justifyContent: 'center'
  },
  rightSlot: {
    marginLeft: Space['3'],
    justifyContent: 'center'
  },
  helperText: {
    marginTop: 8,
    color: '#8A8A9E',
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.regular
  },
  errorText: {
    marginTop: 8,
    color: '#FF5555',
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.medium
  },
  searchIconWrap: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center'
  },
  clearWrap: {
    width: 26,
    height: 26,
    justifyContent: 'center',
    alignItems: 'center'
  }
  });
