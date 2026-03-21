import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/Colors';

interface SettingToggle {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  defaultValue: boolean;
}

interface SettingLink {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  color: string;
}

const toggleSettings: SettingToggle[] = [
  {
    id: 'notifications',
    icon: 'notifications',
    title: 'Push Notifications',
    description: 'Receive alerts for important updates',
    defaultValue: true,
  },
  {
    id: 'darkMode',
    icon: 'moon',
    title: 'Dark Mode',
    description: 'Use dark theme throughout the app',
    defaultValue: true,
  },
  {
    id: 'biometrics',
    icon: 'finger-print',
    title: 'Biometric Login',
    description: 'Use Face ID or fingerprint to sign in',
    defaultValue: false,
  },
  {
    id: 'analytics',
    icon: 'bar-chart',
    title: 'Usage Analytics',
    description: 'Help us improve by sharing anonymous data',
    defaultValue: true,
  },
  {
    id: 'autoUpdate',
    icon: 'refresh-circle',
    title: 'Auto Updates',
    description: 'Automatically download new versions',
    defaultValue: true,
  },
];

const linkSettings: SettingLink[] = [
  {
    icon: 'person-circle',
    title: 'Account',
    subtitle: 'Profile, email, password',
    color: '#7C3AED',
  },
  {
    icon: 'shield-half',
    title: 'Privacy',
    subtitle: 'Data, permissions, visibility',
    color: '#6366F1',
  },
  {
    icon: 'color-palette',
    title: 'Appearance',
    subtitle: 'Theme, fonts, layout',
    color: '#4F46E5',
  },
  {
    icon: 'cloud-download',
    title: 'Storage & Data',
    subtitle: 'Cache, downloads, usage',
    color: '#818CF8',
  },
  {
    icon: 'help-circle',
    title: 'Help & Support',
    subtitle: 'FAQ, contact, report a bug',
    color: '#A78BFA',
  },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [toggles, setToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(toggleSettings.map((s) => [s.id, s.defaultValue]))
  );

  const handleToggle = (id: string) => {
    setToggles((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        { paddingTop: insets.top + 8 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
        <Text style={styles.headerSubtitle}>Customize your experience</Text>
      </View>

      {/* Profile Card */}
      <Pressable style={styles.profileCard}>
        <LinearGradient
          colors={[Colors.gradientStart, Colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.profileAvatar}
        >
          <Ionicons name="person" size={28} color="#FFF" />
        </LinearGradient>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>John Doe</Text>
          <Text style={styles.profileEmail}>john@example.com</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={Colors.textMuted} />
      </Pressable>

      {/* General Section */}
      <Text style={styles.sectionTitle}>General</Text>
      <View style={styles.sectionCard}>
        {linkSettings.map((item, index) => (
          <Pressable
            key={index}
            style={({ pressed }) => [
              styles.linkRow,
              pressed && styles.linkRowPressed,
              index < linkSettings.length - 1 && styles.linkRowBorder,
            ]}
          >
            <View
              style={[styles.linkIcon, { backgroundColor: item.color + '18' }]}
            >
              <Ionicons name={item.icon} size={20} color={item.color} />
            </View>
            <View style={styles.linkContent}>
              <Text style={styles.linkTitle}>{item.title}</Text>
              <Text style={styles.linkSubtitle}>{item.subtitle}</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={Colors.textMuted}
            />
          </Pressable>
        ))}
      </View>

      {/* Preferences Section */}
      <Text style={styles.sectionTitle}>Preferences</Text>
      <View style={styles.sectionCard}>
        {toggleSettings.map((setting, index) => (
          <View
            key={setting.id}
            style={[
              styles.toggleRow,
              index < toggleSettings.length - 1 && styles.toggleRowBorder,
            ]}
          >
            <View style={styles.toggleIcon}>
              <Ionicons
                name={setting.icon}
                size={20}
                color={Colors.accent}
              />
            </View>
            <View style={styles.toggleContent}>
              <Text style={styles.toggleTitle}>{setting.title}</Text>
              <Text style={styles.toggleDescription}>
                {setting.description}
              </Text>
            </View>
            <Switch
              value={toggles[setting.id]}
              onValueChange={() => handleToggle(setting.id)}
              trackColor={{
                false: Colors.surfaceLight,
                true: Colors.gradientStart + '60',
              }}
              thumbColor={
                toggles[setting.id] ? Colors.gradientStart : Colors.textMuted
              }
              ios_backgroundColor={Colors.surfaceLight}
            />
          </View>
        ))}
      </View>

      {/* App Info */}
      <View style={styles.appInfo}>
        <Text style={styles.appInfoText}>MyApp v1.0.0</Text>
        <Text style={styles.appInfoText}>Made with Expo SDK 52</Text>
      </View>

      {/* Sign Out */}
      <Pressable
        style={({ pressed }) => [
          styles.signOutButton,
          pressed && styles.signOutPressed,
        ]}
      >
        <Ionicons name="log-out-outline" size={20} color={Colors.error} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>

      <View style={{ height: 40 }} />
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  // Profile Card
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 28,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 14,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  profileEmail: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  // Section
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: 28,
  },
  // Link Rows
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  linkRowPressed: {
    backgroundColor: Colors.surfaceLight,
  },
  linkRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  linkContent: {
    flex: 1,
  },
  linkTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  linkSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  // Toggle Rows
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  toggleRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  toggleIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.accent + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  toggleContent: {
    flex: 1,
    marginRight: 12,
  },
  toggleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  toggleDescription: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  // App Info
  appInfo: {
    alignItems: 'center',
    marginBottom: 16,
  },
  appInfoText: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  // Sign Out
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.error + '40',
    backgroundColor: Colors.error + '08',
    gap: 10,
  },
  signOutPressed: {
    opacity: 0.6,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.error,
  },
});
