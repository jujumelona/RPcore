// src/utils/debug/ErrorBoundary.tsx
// [sanitized comment]
// Enhanced Error Boundary with Bug Detection Integration
// [sanitized comment]

import React, { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { errorReporter } from './BugDetector';
import { getTranslations } from '../../i18n/translations';
import { useLanguageStore } from '../../store/languageStore';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  componentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class BugDetectionErrorBoundary extends Component<Props, State> {
  private retryCount = 0;
  private maxRetries = 3;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
  };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error
  };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });

    // Report to bug detection system
    errorReporter.reportError(error, errorInfo.componentStack ?? undefined, {
      componentName: this.props.componentName || 'Unknown',
      retryCount: this.retryCount,
      timestamp: Date.now()
  });

    // Call custom error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    if (__DEV__) {
      console.error('[BugDetectionErrorBoundary] Error caught:', error, errorInfo);
    }
  }

  handleRetry = () => {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null
  });
    }
  };

  handleReset = () => {
    this.retryCount = 0;
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
  });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback component
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const lang = useLanguageStore.getState().appLanguage || 'en';
      const t = getTranslations(lang);

      // Default error UI
      return (
        <View style={styles.container}>
          <View style={styles.errorCard}>
            <Text style={styles.title}>{t.unexpectedError}</Text>
            
            <Text style={styles.componentName}>
              {t.componentLabel}: {this.props.componentName || '알 수 없음'}
            </Text>

            {__DEV__ && (
              <ScrollView style={styles.errorScroll}>
                <Text style={styles.errorTitle}>{t.errorMessageLabel}:</Text>
                <Text style={styles.errorText}>
                  {this.state.error?.message || '알 수 없는 오류'}
                </Text>

                <Text style={styles.errorTitle}>{t.errorStackLabel}:</Text>
                <Text style={styles.errorText}>
                  {this.state.error?.stack || '스택트레이스를 확인할 수 없습니다'}
                </Text>

                <Text style={styles.errorTitle}>{t.componentErrorLabel}:</Text>
                <Text style={styles.errorText}>
                  {this.state.errorInfo?.componentStack || 'No component stack available'}
                </Text>
              </ScrollView>
            )}

            <View style={styles.buttonContainer}>
              {this.retryCount < this.maxRetries && (
                <TouchableOpacity
                  style={[styles.button, styles.retryButton]}
                  onPress={this.handleRetry}
                >
                  <Text style={styles.buttonText}>
                    {t.retryWithCount.replace('{count}', String(this.maxRetries - this.retryCount))}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.button, styles.resetButton]}
                onPress={this.handleReset}
              >
                <Text style={styles.buttonText}>Reset</Text>
              </TouchableOpacity>
            </View>

            {this.retryCount >= this.maxRetries && (
              <Text style={styles.maxRetriesWarning}>
                {t.maxRetriesExceeded}
              </Text>
            )}
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

// [sanitized comment]
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#050507'
  },
  errorCard: {
    backgroundColor: '#0E0E14',
    borderRadius: 12,
    padding: 20,
    maxWidth: 500,
    width: '100%',
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#F87171',
    textAlign: 'center',
    marginBottom: 12
  },
  componentName: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    marginBottom: 16,
    fontStyle: 'italic'
  },
  errorScroll: {
    maxHeight: 300,
    marginBottom: 16
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 4
  },
  errorText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    fontFamily: 'monospace',
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 8,
    borderRadius: 4
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 100
  },
  retryButton: {
    backgroundColor: '#2196f3'
  },
  resetButton: {
    backgroundColor: '#ff9800'
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center'
  },
  maxRetriesWarning: {
    textAlign: 'center',
    color: '#d32f2f',
    marginTop: 12,
    fontSize: 14,
    fontWeight: 'bold'
  }
  });

// [sanitized comment]
export const withBugDetection = <P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName?: string
) => {
  const WrappedComponentWithBugDetection = (props: P) => (
    <BugDetectionErrorBoundary componentName={componentName || WrappedComponent.name}>
      <WrappedComponent {...props} />
    </BugDetectionErrorBoundary>
  );

  WrappedComponentWithBugDetection.displayName = `withBugDetection(${WrappedComponent.displayName || WrappedComponent.name})`;

  return WrappedComponentWithBugDetection;
};

// [sanitized comment]
export const useErrorBoundary = (componentName?: string) => {
  const reportError = (error: Error, additionalInfo?: Record<string, any>) => {
    errorReporter.reportError(error, undefined, {
      componentName: componentName || 'Unknown',
      ...additionalInfo
  });
  };

  return { reportError };
};
