import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View,
  Text,
  StyleSheet,
  Pressable,
  EmitterSubscription } from 'react-native';
import { Space, Radius, Typography } from '../constants/tokens';
import { engineBusListener, type EngineErrorPayload } from '../core/llama/EngineEventBus';
import { recordCrash } from '../utils/crashLogger';
import { getLastUiAction } from '../utils/uiActionLog';
// BUG-3 FIX: class component라 hook 불가 -> getState()로 직접 읽음
import { useLanguageStore } from '../store/languageStore';

// module-level helper: 항상 최신 t를 반환
function getT() { return useLanguageStore.getState().t; }

interface Props {
  children: ReactNode;
  // Soft reset: clear KV cache only.
  onSoftReset?: () => Promise<void>;
  // Full restart: reload engine.
  onEngineRestart?: () => Promise<void>;
}

interface State {
  hasError: boolean;
  isFatal: boolean;
  errorMessage: string;
  isRecovering: boolean;
}

export class EngineErrorBoundary extends Component<Props, State> {
  private _engineErrorSub: EmitterSubscription | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      isFatal: false,
      errorMessage: '',
      isRecovering: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      isFatal: false,
      errorMessage: error.message ?? getT()?.unknownError ?? '' };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const last = getLastUiAction();
    recordCrash('engine-react-error-boundary', error, {
      componentStack: errorInfo.componentStack,
      lastUiAction: last?.label,
      lastUiActionAt: last?.ts });
    if (last?.label) {
      console.error('[EngineErrorBoundary] Last UI action:', last.label);
    }
    console.error('[EngineErrorBoundary] React render error:', error.message);
  }

  componentDidMount(): void {
    this._engineErrorSub = engineBusListener.onError((payload: EngineErrorPayload) => {
      const last = getLastUiAction();
      recordCrash('engine-native-error-boundary', new Error(payload.message), {
        ...(payload as unknown as Record<string, unknown>),
        lastUiAction: last?.label,
        lastUiActionAt: last?.ts });
      if (last?.label) {
        console.error('[EngineErrorBoundary] Last UI action:', last.label);
      }
      console.error('[EngineErrorBoundary] Native error:', payload.message);
      this.setState({
        hasError: true,
        isFatal: payload.isFatal,
        errorMessage: payload.message });
    });
  }

  componentWillUnmount(): void {
    this._engineErrorSub?.remove();
  }

  private handleSoftReset = async (): Promise<void> => {
    this.setState({ isRecovering: true });
    try {
      await this.props.onSoftReset?.();
      this.setState({ hasError: false, isRecovering: false, errorMessage: '' });
    } catch {
      this.setState({ isFatal: true, isRecovering: false });
    }
  };

  private handleEngineRestart = async (): Promise<void> => {
    this.setState({ isRecovering: true });
    try {
      await this.props.onEngineRestart?.();
      this.setState({ hasError: false, isRecovering: false, errorMessage: '' });
    } catch {
      this.setState({ isRecovering: false });
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { isFatal, errorMessage, isRecovering } = this.state;
    const last = getLastUiAction();

    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>!</Text>

        <Text style={styles.title}>
          {isFatal ? (getT()?.engineErrorFatal ?? '') : (getT()?.engineErrorUnstable ?? '')}
        </Text>

        <Text style={styles.subtitle}>
          {isFatal
            ? (getT()?.engineRestartHint ?? '')
            : (getT()?.engineMemoryHint ?? '')}
        </Text>

        {__DEV__ && errorMessage ? (
          <View style={styles.debugBox}>
            <Text style={styles.debugText}>{errorMessage}</Text>
            {last?.label ? (
              <Text style={styles.debugText}>{`Last action: ${last.label}`}</Text>
            ) : null}
          </View>
        ) : null}

        {!isFatal && this.props.onSoftReset ? (
          <Pressable
            style={[styles.button, styles.primaryButton]}
            onPress={this.handleSoftReset}
            disabled={isRecovering}
          >
            <Text style={styles.buttonText}>
              {isRecovering ? (getT()?.engineClearingMem ?? '') : (getT()?.engineClearMemBtn ?? '')}
            </Text>
          </Pressable>
        ) : null}

        {this.props.onEngineRestart ? (
          <Pressable
            style={[styles.button, isFatal ? styles.primaryButton : styles.secondaryButton]}
            onPress={this.handleEngineRestart}
            disabled={isRecovering}
          >
            <Text style={[styles.buttonText, !isFatal && styles.secondaryButtonText]}>
              {isRecovering ? (getT()?.engineRestartingBtn ?? '') : (getT()?.engineRestartBtn ?? '')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space['6'],
    backgroundColor: '#08080C' },
  emoji: {
    fontSize: 56,
    marginBottom: Space['4'] },
  title: {
    fontSize: Typography.size.lg,
    fontFamily: Typography.fontFamily.bold,
    color: '#F0F0F5',
    textAlign: 'center',
    marginBottom: Space['2'] },
  subtitle: {
    fontSize: Typography.size.base,
    color: '#8A8A9E',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Space['5'] },
  debugBox: {
    width: '100%',
    backgroundColor: '#0C0C14',
    borderRadius: Radius.md,
    padding: Space['4'],
    marginBottom: Space['5'],
    borderWidth: 1,
    borderColor: '#FF5555' },
  debugText: {
    fontSize: Typography.size.sm,
    color: '#8A8A9E' },
  button: {
    minWidth: 220,
    paddingVertical: Space['3'],
    paddingHorizontal: Space['5'],
    borderRadius: Radius.full,
    alignItems: 'center',
    marginBottom: Space['3'] },
  primaryButton: {
    backgroundColor: '#D4A853' },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#D4A853' },
  buttonText: {
    fontSize: Typography.size.md,
    fontFamily: Typography.fontFamily.semibold,
    color: '#050507' },
  secondaryButtonText: {
    color: '#D4A853' } });
