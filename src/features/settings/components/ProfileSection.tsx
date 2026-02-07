import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';
import { GlassCard } from './GlassCard';

interface ProfileSectionProps {
  user: {
    displayName?: string | null;
    email?: string | null;
  } | null;
  currentPlan: 'free' | 'go' | 'starter' | 'pro' | 'team';
  onEditPress: () => void;
  loading?: boolean;
}

export const ProfileSection: React.FC<ProfileSectionProps> = ({
  user,
  currentPlan,
  onEditPress,
  loading = false,
}) => {
  if (!user) return null;

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onEditPress}>
      <GlassCard style={styles.profileBlur} key={loading ? 'loading-profile' : 'loaded-profile'}>
        <View style={styles.profileSection}>
          <View style={styles.profileAvatarContainer}>
            <LinearGradient
              colors={[AppColors.primary, AppColors.primaryShade]}
              style={styles.profileAvatar}
            >
              <Text style={styles.profileAvatarText}>
                {user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </LinearGradient>
          </View>
          <View style={styles.profileInfo}>
            <View style={styles.profileNameRow}>
              <Text style={styles.profileName}>{user.displayName || 'User'}</Text>
              <View style={[styles.planBadge, { backgroundColor: currentPlan === 'free' ? 'rgba(148,163,184,0.2)' : currentPlan === 'pro' ? `${AppColors.primary}20` : '#F472B620' }]}>
                <Text style={[styles.planBadgeText, { color: currentPlan === 'free' ? '#94A3B8' : currentPlan === 'pro' ? AppColors.primary : '#F472B6' }]}>
                  {currentPlan.toUpperCase()}
                </Text>
              </View>
            </View>
            <Text style={styles.profileEmail}>{user.email}</Text>
          </View>
          <View style={styles.editProfileBtn}>
            <Ionicons name="pencil" size={14} color="rgba(255,255,255,0.6)" />
          </View>
        </View>
      </GlassCard>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  profileBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 24,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(20,20,22,0.5)',
    borderRadius: 16,
  },
  profileAvatarContainer: {
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  profileAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.4,
  },
  profileEmail: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  planBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  editProfileBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
