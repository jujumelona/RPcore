// src/utils/debug/PerformanceProfiler.tsx
// [sanitized comment]
// Performance Profiler Component for React Performance Analysis
// [sanitized comment]

import React, { Profiler, ProfilerOnRenderCallback, useState, useEffect } from 'react';
import { Zap } from 'lucide-react-native';
import { performanceMonitor } from './BugDetector';

interface Props {
  id: string;
  children?: React.ReactNode;
  onRender?: ProfilerOnRenderCallback;
}

export const PerformanceProfiler: React.FC<Props> = ({ id, children, onRender }) => {
  const handleRender: ProfilerOnRenderCallback = (
    profilerId,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime
  ) => {
    // Report to performance monitor
    performanceMonitor.startMeasurement(`${profilerId}_${phase}`, {
      componentName: profilerId,
      phase,
      baseDuration,
      startTime,
      commitTime
  });

    performanceMonitor.endMeasurement(`${profilerId}_${phase}`);

    if (__DEV__) {
      if (__DEV__) console.log(`[PerformanceProfiler] ${profilerId} ${phase}:`, {
        actualDuration: actualDuration.toFixed(2),
        baseDuration: baseDuration.toFixed(2),
        ratio: ((actualDuration / baseDuration) * 100).toFixed(1) + '%'
  });

      // Warn if render is significantly slower than baseline
      if (actualDuration > baseDuration * 2) {
        console.warn(`[PerformanceProfiler] Slow render detected in ${profilerId}:`, {
          actualDuration,
          baseDuration,
          slowdown: ((actualDuration / baseDuration - 1) * 100).toFixed(1) + '%'
  });
      }
    }

    // Call custom onRender callback
    if (onRender) {
      onRender(profilerId, phase, actualDuration, baseDuration, startTime, commitTime);
    }
  };

  return <Profiler id={id} onRender={handleRender}>{children}</Profiler>;
};

// [sanitized comment]
export const withPerformanceProfiling = <P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName?: string
) => {
  const profileId = componentName || WrappedComponent.name || 'UnknownComponent';

  const WrappedComponentWithProfiling = (props: P) => (
    <PerformanceProfiler id={profileId}>
      <WrappedComponent {...props} />
    </PerformanceProfiler>
  );

  WrappedComponentWithProfiling.displayName = `withPerformanceProfiling(${WrappedComponent.displayName || WrappedComponent.name})`;

  return WrappedComponentWithProfiling;
};

// [sanitized comment]
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

export const PerformanceReport: React.FC = () => {
  const [stats, setStats] = useState(performanceMonitor.getStats());
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setStats(performanceMonitor.getStats());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  if (!__DEV__ || !isVisible) {
    return (
      <TouchableOpacity
        style={styles.floatingButton}
        onPress={() => setIsVisible(true)}
      >
        <Zap color="white" size={20} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.overlay}>
      <View style={styles.reportContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Performance Report</Text>
          <TouchableOpacity onPress={() => setIsVisible(false)}>
            <Text style={styles.closeButton}>X</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          {Object.entries(stats).map(([name, data]) => (
            <View key={name} style={styles.metricCard}>
              <Text style={styles.metricName}>{name}</Text>
              <View style={styles.metricDetails}>
                <Text style={styles.metricText}>Count: {data.count}</Text>
                <Text style={styles.metricText}>Avg: {data.average.toFixed(2)}ms</Text>
                <Text style={styles.metricText}>Min: {data.min.toFixed(2)}ms</Text>
                <Text style={styles.metricText}>Max: {data.max.toFixed(2)}ms</Text>
              </View>
              
              {/* Performance indicator */}
              <View style={styles.performanceIndicator}>
                {data.average > 100 ? (
                  <Text style={styles.slowPerformance}>● Slow</Text>
                ) : data.average > 50 ? (
                  <Text style={styles.mediumPerformance}>● Medium</Text>
                ) : (
                  <Text style={styles.goodPerformance}>● Good</Text>
                )}
              </View>
            </View>
          ))}

          {Object.keys(stats).length === 0 && (
            <Text style={styles.noData}>No performance data available yet</Text>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => {
              performanceMonitor.clear();
              setStats({});
            }}
          >
            <Text style={styles.clearButtonText}>Clear Data</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// [sanitized comment]
const styles = StyleSheet.create({
  floatingButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: '#2196f3',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    zIndex: 1000
  },
  floatingButtonText: {
    color: 'white',
    fontSize: 20
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000
  },
  reportContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    width: '90%',
    maxHeight: '80%',
    elevation: 10
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333'
  },
  closeButton: {
    fontSize: 20,
    color: '#666',
    padding: 5
  },
  content: {
    flex: 1,
    padding: 20
  },
  metricCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 15,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2196f3'
  },
  metricName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8
  },
  metricDetails: {
    marginBottom: 8
  },
  metricText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2
  },
  performanceIndicator: {
    alignItems: 'flex-end'
  },
  goodPerformance: {
    color: '#4caf50',
    fontWeight: 'bold'
  },
  mediumPerformance: {
    color: '#ff9800',
    fontWeight: 'bold'
  },
  slowPerformance: {
    color: '#f44336',
    fontWeight: 'bold'
  },
  noData: {
    textAlign: 'center',
    color: '#666',
    fontStyle: 'italic',
    marginTop: 50
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee'
  },
  clearButton: {
    backgroundColor: '#f44336',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  clearButtonText: {
    color: 'white',
    fontWeight: 'bold'
  }
  });
