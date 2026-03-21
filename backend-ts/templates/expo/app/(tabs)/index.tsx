import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/Colors';

const { width } = Dimensions.get('window');

interface Feature {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  color: string;
}

const features: Feature[] = [
  {
    icon: 'rocket',
    title: 'Blazing Fast',
    description: 'Built with performance in mind for smooth 60fps experiences.',
    color: '#7C3AED',
  },
  {
    icon: 'shield-checkmark',
    title: 'Secure by Default',
    description: 'Enterprise-grade security with end-to-end encryption.',
    color: '#6366F1',
  },
  {
    icon: 'cloud-done',
    title: 'Cloud Synced',
    description: 'Your data stays in sync across all your devices seamlessly.',
    color: '#4F46E5',
  },
  {
    icon: 'analytics',
    title: 'Smart Analytics',
    description: 'Real-time insights to help you make better decisions.',
    color: '#818CF8',
  },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        { paddingTop: insets.top },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header with gradient */}
      <LinearGradient
        colors={[Colors.gradientStart, Colors.gradientMiddle, Colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greeting}>Welcome back</Text>
              <Text style={styles.headerTitle}>MyApp</Text>
            </View>
            <View style={styles.avatarContainer}>
              <LinearGradient
                colors={['#A78BFA', '#7C3AED']}
                style={styles.avatar}
              >
                <Ionicons name="person" size={22} color="#FFF" />
              </LinearGradient>
            </View>
          </View>
          <Text style={styles.headerSubtitle}>
            Build something extraordinary today.
          </Text>
        </View>

        {/* Decorative circles */}
        <View style={styles.decorCircle1} />
        <View style={styles.decorCircle2} />
      </LinearGradient>

      {/* Quick Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>128</Text>
          <Text style={styles.statLabel}>Projects</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>1.2k</Text>
          <Text style={styles.statLabel}>Tasks Done</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>99%</Text>
          <Text style={styles.statLabel}>Uptime</Text>
        </View>
      </View>

      {/* Welcome Card */}
      <View style={styles.welcomeCard}>
        <LinearGradient
          colors={['rgba(124,58,237,0.12)', 'rgba(99,102,241,0.06)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.welcomeGradient}
        >
          <View style={styles.welcomeIconWrap}>
            <Ionicons name="sparkles" size={28} color={Colors.accent} />
          </View>
          <Text style={styles.welcomeTitle}>Get Started</Text>
          <Text style={styles.welcomeText}>
            Explore the features below to discover everything your app can do.
            Customize this template to build your next great idea.
          </Text>
          <Pressable style={styles.welcomeButton}>
            <LinearGradient
              colors={[Colors.gradientStart, Colors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.buttonGradient}
            >
              <Text style={styles.welcomeButtonText}>Learn More</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFF" />
            </LinearGradient>
          </Pressable>
        </LinearGradient>
      </View>

      {/* Features Section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Features</Text>
        <Pressable>
          <Text style={styles.seeAll}>See all</Text>
        </Pressable>
      </View>

      {features.map((feature, index) => (
        <Pressable
          key={index}
          style={({ pressed }) => [
            styles.featureCard,
            pressed && styles.featureCardPressed,
          ]}
        >
          <View
            style={[styles.featureIconWrap, { backgroundColor: feature.color + '20' }]}
          >
            <Ionicons name={feature.icon} size={24} color={feature.color} />
          </View>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>{feature.title}</Text>
            <Text style={styles.featureDescription}>{feature.description}</Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={Colors.textMuted}
          />
        </Pressable>
      ))}

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            pressed && styles.actionButtonPressed,
          ]}
        >
          <LinearGradient
            colors={[Colors.gradientStart, Colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.actionButtonGradient}
          >
            <Ionicons name="add-circle" size={22} color="#FFF" />
            <Text style={styles.actionButtonText}>New Project</Text>
          </LinearGradient>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.actionButtonOutline,
            pressed && styles.actionButtonPressed,
          ]}
        >
          <Ionicons name="document-text" size={22} color={Colors.accent} />
          <Text style={styles.actionButtonOutlineText}>View Docs</Text>
        </Pressable>
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    paddingBottom: 20,
  },
  // Header
  headerGradient: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 24,
    padding: 24,
    overflow: 'hidden',
  },
  headerContent: {
    zIndex: 1,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greeting: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  avatarContainer: {
    marginTop: 2,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  headerSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 16,
    lineHeight: 22,
    fontWeight: '400',
  },
  decorCircle1: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -30,
    right: -30,
  },
  decorCircle2: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.04)',
    bottom: -20,
    left: 40,
  },
  // Stats
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 20,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.accent,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  // Welcome Card
  welcomeCard: {
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  welcomeGradient: {
    padding: 24,
  },
  welcomeIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(124,58,237,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 21,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  welcomeText: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 20,
  },
  welcomeButton: {
    borderRadius: 14,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 22,
    gap: 8,
  },
  welcomeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Section
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 28,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  seeAll: {
    fontSize: 14,
    color: Colors.accent,
    fontWeight: '600',
  },
  // Feature Card
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  featureCardPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  featureIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  featureContent: {
    flex: 1,
    marginRight: 8,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  // Action Buttons
  actionRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 24,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  actionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  actionButtonOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    gap: 10,
  },
  actionButtonOutlineText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.accent,
  },
  actionButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
});
