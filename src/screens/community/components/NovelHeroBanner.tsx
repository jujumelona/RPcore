// src/screens/community/components/NovelHeroBanner.tsx
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BookOpen } from 'lucide-react-native';
import { Space, Radius, Typography } from '../../../constants/tokens';

const HERO_HEIGHT = 220;
const { width: SCREEN_WIDTH } = (Dimensions.get('window') ?? { width: 375, height: 812 });

interface NovelHeroBannerProps {
  title: string;
  tags: string[];
}

export function NovelHeroBanner({ title, tags }: NovelHeroBannerProps) {
  return (
    <Animated.View entering={FadeIn.duration(280)} style={styles.heroBanner}>
      <LinearGradient
        colors={['#08080C', '#0E0E14', '#050507']}
        start={[0, 0]}
        end={[1, 1]}
        style={styles.heroGradient}
      >
        <View style={styles.heroDeco1} />
        <View style={styles.heroDeco2} />

        <View style={styles.heroContent}>
          <BookOpen size={32} color={'#D4A853'} style={styles._marginBottom} />
          <Text style={styles.heroTitle} numberOfLines={2}>{title}</Text>

          {tags.length > 0 && (
            <View style={styles.heroTagRow}>
              {tags.slice(0, 4).map(tag => (
                <View key={tag} style={styles.heroTag}>
                  <Text style={styles.heroTagText}>#{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  heroBanner: { marginHorizontal: 0, height: HERO_HEIGHT, width: SCREEN_WIDTH },
  heroGradient: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: Space['5'],
    position: 'relative',
    overflow: 'hidden' },
  heroDeco1: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: `${'#D4A853'}12` },
  heroDeco2: {
    position: 'absolute',
    top: 30,
    right: 60,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${'#D4A853'}08` },
  heroContent: { gap: 10 },
  _marginBottom: { marginBottom: 4 },
  heroTitle: {
    fontSize: 22,
    fontFamily: Typography.fontFamily.extrabold,
    color: '#F0F0F5',
    lineHeight: 28,
    letterSpacing: -0.3 },
  heroTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heroTag: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)' },
  heroTagText: { fontSize: 11, color: '#8A8A9E' } });
