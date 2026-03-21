import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final Map<String, bool> _toggles = {
    'notifications': true,
    'darkMode': true,
    'biometrics': false,
    'analytics': true,
    'autoUpdate': true,
  };

  void _onToggle(String key) {
    setState(() => _toggles[key] = !_toggles[key]!);
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: ListView(
        padding: const EdgeInsets.only(bottom: 40),
        children: [
          const SizedBox(height: 8),

          // Header
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Settings',
                  style: TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.w800,
                    color: AppColors.text,
                    letterSpacing: -0.5,
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  'Customize your experience',
                  style: TextStyle(
                    fontSize: 15,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 24),

          // Profile Card
          _buildProfileCard(),

          const SizedBox(height: 28),

          // General Section
          _buildSectionLabel('GENERAL'),
          const SizedBox(height: 12),
          _buildGeneralSection(),

          const SizedBox(height: 28),

          // Preferences Section
          _buildSectionLabel('PREFERENCES'),
          const SizedBox(height: 12),
          _buildPreferencesSection(),

          const SizedBox(height: 28),

          // App Info
          const Center(
            child: Column(
              children: [
                Text(
                  'MyApp v1.0.0',
                  style: TextStyle(fontSize: 13, color: AppColors.textMuted),
                ),
                SizedBox(height: 2),
                Text(
                  'Made with Flutter & Material 3',
                  style: TextStyle(fontSize: 13, color: AppColors.textMuted),
                ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          // Sign Out Button
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: () {},
                borderRadius: BorderRadius.circular(16),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: AppColors.error.withValues(alpha: 0.4),
                      width: 1.5,
                    ),
                    color: AppColors.error.withValues(alpha: 0.05),
                  ),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.logout_rounded, color: AppColors.error, size: 20),
                      SizedBox(width: 10),
                      Text(
                        'Sign Out',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: AppColors.error,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProfileCard() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border, width: 1),
      ),
      child: Row(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              gradient: AppColors.primaryGradient,
            ),
            child: const Icon(Icons.person, color: Colors.white, size: 28),
          ),
          const SizedBox(width: 14),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'John Doe',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: AppColors.text,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  'john@example.com',
                  style: TextStyle(
                    fontSize: 13,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          const Icon(
            Icons.chevron_right_rounded,
            color: AppColors.textMuted,
            size: 22,
          ),
        ],
      ),
    );
  }

  Widget _buildSectionLabel(String label) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: AppColors.textMuted,
          letterSpacing: 1.2,
        ),
      ),
    );
  }

  Widget _buildGeneralSection() {
    final items = [
      _LinkItem(Icons.person_outline_rounded, 'Account', 'Profile, email, password', const Color(0xFF7C3AED)),
      _LinkItem(Icons.shield_outlined, 'Privacy', 'Data, permissions, visibility', const Color(0xFF6366F1)),
      _LinkItem(Icons.palette_outlined, 'Appearance', 'Theme, fonts, layout', const Color(0xFF4F46E5)),
      _LinkItem(Icons.cloud_download_outlined, 'Storage & Data', 'Cache, downloads, usage', const Color(0xFF818CF8)),
      _LinkItem(Icons.help_outline_rounded, 'Help & Support', 'FAQ, contact, report a bug', const Color(0xFFA78BFA)),
    ];

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border, width: 1),
      ),
      child: Column(
        children: List.generate(items.length, (index) {
          final item = items[index];
          final isLast = index == items.length - 1;
          return Column(
            children: [
              Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: () {},
                  borderRadius: isLast
                      ? const BorderRadius.only(
                          bottomLeft: Radius.circular(20),
                          bottomRight: Radius.circular(20),
                        )
                      : index == 0
                          ? const BorderRadius.only(
                              topLeft: Radius.circular(20),
                              topRight: Radius.circular(20),
                            )
                          : null,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: item.color.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(item.icon, color: item.color, size: 20),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                item.title,
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.text,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                item.subtitle,
                                style: const TextStyle(
                                  fontSize: 13,
                                  color: AppColors.textSecondary,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const Icon(
                          Icons.chevron_right_rounded,
                          color: AppColors.textMuted,
                          size: 18,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              if (!isLast) const Divider(indent: 70),
            ],
          );
        }),
      ),
    );
  }

  Widget _buildPreferencesSection() {
    final items = [
      _ToggleItem('notifications', Icons.notifications_outlined, 'Push Notifications', 'Receive alerts for important updates'),
      _ToggleItem('darkMode', Icons.dark_mode_outlined, 'Dark Mode', 'Use dark theme throughout the app'),
      _ToggleItem('biometrics', Icons.fingerprint_rounded, 'Biometric Login', 'Use Face ID or fingerprint to sign in'),
      _ToggleItem('analytics', Icons.bar_chart_rounded, 'Usage Analytics', 'Help us improve with anonymous data'),
      _ToggleItem('autoUpdate', Icons.system_update_rounded, 'Auto Updates', 'Automatically download new versions'),
    ];

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border, width: 1),
      ),
      child: Column(
        children: List.generate(items.length, (index) {
          final item = items[index];
          final isLast = index == items.length - 1;
          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: AppColors.accent.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(item.icon, color: AppColors.accent, size: 20),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.title,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              color: AppColors.text,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            item.description,
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Switch(
                      value: _toggles[item.key]!,
                      onChanged: (_) => _onToggle(item.key),
                    ),
                  ],
                ),
              ),
              if (!isLast) const Divider(indent: 70),
            ],
          );
        }),
      ),
    );
  }
}

class _LinkItem {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;

  const _LinkItem(this.icon, this.title, this.subtitle, this.color);
}

class _ToggleItem {
  final String key;
  final IconData icon;
  final String title;
  final String description;

  const _ToggleItem(this.key, this.icon, this.title, this.description);
}
