import React, { useState, forwardRef } from 'react';
import { View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  TextStyle,
  TextInputProps,
  StyleProp } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut
  } from 'react-native-reanimated';
import { EmotionColors, EmotionType } from '../../constants/EmotionColors';
import { useHapticFeedback } from '../../hooks/useHapticFeedback';
import { Color, Radius, Typography } from '../../constants/tokens';
import { Eye, EyeOff, Check } from 'lucide-react-native';

interface BaseInputProps extends Omit<TextInputProps, 'onChange'> {
  label?: string;
  error?: string;
  helperText?: string;
  emotion?: EmotionType;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  labelStyle?: StyleProp<TextStyle>;
  errorStyle?: StyleProp<TextStyle>;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onIconPress?: () => void;
  secureToggleEnabled?: boolean;
}

interface FormFieldProps extends BaseInputProps {
  variant?: 'filled' | 'outlined';
  size?: 'small' | 'medium' | 'large';
}

export const FormField = forwardRef<any, FormFieldProps>(
  (
    {
      label,
      error,
      helperText,
      emotion = 'neutral',
      containerStyle,
      inputStyle,
      labelStyle,
      errorStyle,
      leftIcon,
      rightIcon,
      onIconPress,
      secureToggleEnabled = false,
      variant = 'outlined',
      size = 'medium',
      secureTextEntry,
      ...props
    },
    ref
  ) => {
    const [isSecure, setIsSecure] = useState(secureTextEntry);
    const [isFocused, setIsFocused] = useState(false);
    const { trigger } = useHapticFeedback();
    
    const colors = EmotionColors[emotion];
    
    const toggleSecure = () => {
      if (secureToggleEnabled) {
        trigger('light');
        setIsSecure(!isSecure);
      }
    };

    const getSizeStyles = () => {
      switch (size) {
        case 'small':
          return {
            paddingHorizontal: 12,
            paddingVertical: 8,
            fontSize: 14
  };
        case 'large':
          return {
            paddingHorizontal: 20,
            paddingVertical: 12,
            fontSize: 18
  };
        default: // medium
          return {
            paddingHorizontal: 16,
            paddingVertical: 10,
            fontSize: 16
  };
      }
    };

    const getVariantStyles = () => {
      if (variant === 'filled') {
        return {
          backgroundColor: Color.surface0,
          borderWidth: 0,
          borderBottomWidth: 2,
          borderBottomColor: error 
            ? Color.danger 
            : isFocused 
              ? colors.primary 
              : Color.border1
  };
      } else {
        return {
          backgroundColor: Color.bg1,
          borderWidth: 1,
          borderColor: error 
            ? Color.danger 
            : isFocused 
              ? colors.primary 
              : Color.border1
  };
      }
    };

    return (
      <View style={[styles.container, containerStyle]}>
        {label ? (
          <Text style={[styles.label, labelStyle, { color: colors.text }]}>
            {label}
          </Text>
        ) : null}
        
        <View
          style={[
            styles.inputContainer,
            getVariantStyles(),
            getSizeStyles(),
            { borderRadius: Radius.md }
          ]}
        >
          {leftIcon ? (
            <TouchableOpacity
              style={styles.iconContainer}
              onPress={() => leftIcon && onIconPress?.()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {leftIcon}
            </TouchableOpacity>
          ) : null}
          
          <TextInput
            {...props}
            ref={ref}
            style={[styles.input, inputStyle, { fontSize: getSizeStyles().fontSize, color: Color.text0 }]}
            secureTextEntry={isSecure}
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              props.onBlur?.(e);
            }}
          />
          
          {(rightIcon || secureToggleEnabled) && (
            <TouchableOpacity
              style={styles.iconContainer}
              onPress={secureToggleEnabled ? toggleSecure : onIconPress}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {secureToggleEnabled ? (
                isSecure ? (
                  <EyeOff size={size === 'small' ? 16 : size === 'large' ? 24 : 20} color={colors.text} />
                ) : (
                  <Eye size={size === 'small' ? 16 : size === 'large' ? 24 : 20} color={colors.text} />
                )
              ) : (
                rightIcon
              )}
            </TouchableOpacity>
          )}
        </View>
        
        {error ? (
          <Animated.Text
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            style={[styles.errorText, errorStyle]}
          >
            {error}
          </Animated.Text>
        ) : helperText ? (
          <Text style={[styles.helperText, { color: Color.text2 }]}>
            {helperText}
          </Text>
        ) : null}
      </View>
    );
  }
);

interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label?: string;
  disabled?: boolean;
  emotion?: EmotionType;
  containerStyle?: StyleProp<ViewStyle>;
  trackStyle?: StyleProp<ViewStyle>;
  thumbStyle?: StyleProp<ViewStyle>;
}

export const Switch = ({
  value,
  onValueChange,
  label,
  disabled = false,
  emotion = 'neutral',
  containerStyle,
  trackStyle,
  thumbStyle
  }: SwitchProps) => {
  const { trigger } = useHapticFeedback();
  const colors = EmotionColors[emotion];

  const handlePress = () => {
    if (!disabled) {
      trigger('light');
      onValueChange(!value);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.switchContainer, containerStyle]}
      onPress={handlePress}
      disabled={disabled}
      activeOpacity={0.7}
    >
    <View style={[styles.switchTrack, trackStyle, {
      backgroundColor: value ? colors.primary : Color.surface0,
      borderColor: value ? colors.primary : Color.border1
  }]}>
      <Animated.View
        style={[
          styles.switchThumb,
          thumbStyle,
          {
            backgroundColor: value ? colors.text : Color.text3,
            transform: [{ translateX: value ? 20 : 0 }]
  }
        ]}
      />
    </View>
    {label ? <Text style={[styles.switchLabel, { color: Color.text0 }]}>{label}</Text> : null}
  </TouchableOpacity>
  );
};

interface CheckboxProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label?: string;
  disabled?: boolean;
  emotion?: EmotionType;
  containerStyle?: StyleProp<ViewStyle>;
  size?: number;
}

export const Checkbox = ({
  value,
  onValueChange,
  label,
  disabled = false,
  emotion = 'neutral',
  containerStyle,
  size = 24
  }: CheckboxProps) => {
  const { trigger } = useHapticFeedback();
  const colors = EmotionColors[emotion];

  const handlePress = () => {
    if (!disabled) {
      trigger('light');
      onValueChange(!value);
    }
  };

  const checkboxDynamicStyle = {
    width: size,
    height: size,
    borderRadius: Radius.sm,
    backgroundColor: value ? colors.primary : ('transparent' as const),
    borderColor: value ? colors.primary : Color.border1,
    borderWidth: value ? 0 : 1
  };

  const checkmarkDynamicStyle = {
    fontSize: size * 0.6,
    color: colors.text
  };

  return (
    <TouchableOpacity
      style={[styles.checkboxContainer, containerStyle]}
      onPress={handlePress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <View style={[styles.checkbox, checkboxDynamicStyle]}>
        {value && (
          <Check size={size * 0.7} color={colors.text} />
        )}
      </View>
      {label ? <Text style={[styles.checkboxLabel, styles.checkboxLabelColor]}>{label}</Text> : null}
    </TouchableOpacity>
  );
};

interface RadioButtonProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label?: string;
  disabled?: boolean;
  emotion?: EmotionType;
  containerStyle?: StyleProp<ViewStyle>;
  size?: number;
}

export const RadioButton = ({
  value,
  onValueChange,
  label,
  disabled = false,
  emotion = 'neutral',
  containerStyle,
  size = 24
  }: RadioButtonProps) => {
  const { trigger } = useHapticFeedback();
  const colors = EmotionColors[emotion];

  const handlePress = () => {
    if (!disabled && !value) {
      trigger('light');
      onValueChange(true);
    }
  };

  const radioDynamicStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderColor: value ? colors.primary : Color.border1,
    borderWidth: 2,
    backgroundColor: value ? ('transparent' as const) : Color.bg1
  };

  const radioInnerDynamicStyle = {
    width: size / 2,
    height: size / 2,
    borderRadius: size / 4,
    backgroundColor: colors.primary
  };

  return (
    <TouchableOpacity
      style={[styles.radioContainer, containerStyle]}
      onPress={handlePress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <View style={[styles.radioButton, radioDynamicStyle]}>
        {value && (
          <View style={[styles.radioInner, radioInnerDynamicStyle]} />
        )}
      </View>
      {label ? <Text style={[styles.radioLabel, styles.radioLabelColor]}>{label}</Text> : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16
  },
  label: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium,
    marginBottom: 8,
    color: Color.text0
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48
  },
  iconContainer: {
    paddingHorizontal: 8
  },
  input: {
    flex: 1,
    color: Color.text0,
    fontFamily: 'System'
  },
  errorText: {
    color: Color.danger,
    fontSize: 12,
    marginTop: 4
  },
  helperText: {
    fontSize: 12,
    marginTop: 4,
    color: Color.text2
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  switchTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    paddingHorizontal: 2
  },
  switchThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    elevation: 2
  },
  switchLabel: {
    fontSize: 16,
    color: Color.text0
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  checkbox: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  checkmark: {
    fontFamily: Typography.fontFamily.bold
  },
  checkboxLabel: {
    fontSize: 16,
    color: Color.text0
  },
  checkboxLabelColor: {
    color: Color.text0
  },
  radioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  radioButton: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  radioInner: {
    backgroundColor: Color.text0
  },
  radioLabel: {
    fontSize: 16,
    color: Color.text0
  },
  radioLabelColor: {
    color: Color.text0
  }
  });

export default {
  FormField,
  Switch,
  Checkbox,
  RadioButton
  };
