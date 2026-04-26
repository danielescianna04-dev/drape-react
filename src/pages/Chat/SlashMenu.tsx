// SlashMenu — popover shown above the chat input when the user types `/`.
// Lists installed skills that match the partial slash; tap autocompletes the
// command into the input. The actual skill body is dispatched server-side
// (agent.routes.ts detects the leading /<slash> and applies the skill).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { skillsApi, type Skill } from '../../core/api/skillsApi';
import { AppColors } from '../../shared/theme/colors';

interface Props {
  /** Current input value (controlled). */
  value: string;
  /** Callback to replace the input value when the user picks an item. */
  onSelect: (newValue: string) => void;
}

const SLASH_PROBE_RE = /^\/([a-z0-9-]*)$/;

export const SlashMenu: React.FC<Props> = ({ value, onSelect }) => {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const opacity = useRef(new Animated.Value(0)).current;

  const probe = String(value || '').match(SLASH_PROBE_RE);
  const partial = probe?.[1] ?? null;
  const visible = partial !== null;

  // Lazy-load installed skills the first time the menu opens; refresh after
  // 60s to pick up newly installed ones without spamming the endpoint.
  useEffect(() => {
    if (!visible) return;
    const stale = Date.now() - fetchedAt > 60_000;
    if (skills && !stale) return;
    let cancelled = false;
    skillsApi.listMine()
      .then((res) => {
        if (cancelled) return;
        setSkills(res.skills);
        setFetchedAt(Date.now());
      })
      .catch(() => { if (!cancelled) setSkills([]); });
    return () => { cancelled = true; };
  }, [visible, skills, fetchedAt]);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  const filtered = useMemo(() => {
    if (!skills) return [];
    if (!partial) return skills.slice(0, 8);
    const q = partial.toLowerCase();
    return skills
      .filter((s) =>
        s.slash.startsWith(q) ||
        s.slash.includes(q) ||
        s.name.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [skills, partial]);

  if (!visible) return null;

  return (
    <Animated.View pointerEvents={visible ? 'auto' : 'none'} style={[styles.container, { opacity }]}>
      <View style={styles.popover}>
        <View style={styles.header}>
          <Ionicons name="cube-outline" size={11} color="rgba(255,255,255,0.5)" />
          <Text style={styles.headerText}>PLUGIN</Text>
        </View>
        {skills === null ? (
          <Text style={styles.emptyText}>Caricamento…</Text>
        ) : filtered.length === 0 ? (
          <Text style={styles.emptyText}>
            {skills.length === 0
              ? 'Nessun plugin installato. Aprine alcuni dal Marketplace.'
              : `Nessun plugin per "/${partial}"`}
          </Text>
        ) : (
          <ScrollView keyboardShouldPersistTaps="always" style={{ maxHeight: 240 }}>
            {filtered.map((skill) => (
              <TouchableOpacity
                key={skill.id}
                style={styles.item}
                onPress={() => onSelect(`/${skill.slash} `)}
                activeOpacity={0.6}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemSlash}>/{skill.slash}</Text>
                  <Text style={styles.itemDesc} numberOfLines={1}>{skill.description}</Text>
                </View>
                <Ionicons name="arrow-forward" size={14} color="rgba(255,255,255,0.35)" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  popover: {
    backgroundColor: 'rgba(20,20,22,0.96)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 6,
    paddingHorizontal: 4,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    marginBottom: 4,
  },
  headerText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    fontStyle: 'italic',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  itemSlash: {
    color: AppColors.primary,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Menlo',
  },
  itemDesc: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 2,
  },
});
