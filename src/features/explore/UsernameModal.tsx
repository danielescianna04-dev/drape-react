// One-shot modal that asks the user to pick a public username so
// their published apps can carry an @handle in Explore. Triggered
// from PublishSheet when "Mostra in Explore" is turned on for a
// user that has no username yet.

import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Modal, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { config } from '../../config/config';
import { getAuthHeaders } from '../../core/api/getAuthToken';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: (username: string) => void;
  initialValue?: string;
}

// Glass wrapper — same treatment as the publish sheet so both
// modals share the same vitreous look. 1px border with a brighter
// top edge fakes the refraction lip of glass against any backdrop.
const Glass: React.FC<{
  style?: any;
  radius?: number;
  tint?: 'card' | 'input';
  children: React.ReactNode;
}> = ({ style, radius = 16, tint = 'card', children }) => {
  const fallbackBg = tint === 'card'
    ? 'rgba(28,28,32,0.65)'
    : 'rgba(255,255,255,0.07)';
  const baseStyle = {
    borderRadius: radius,
    overflow: 'hidden' as const,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderTopColor: 'rgba(255,255,255,0.35)',
  };
  if (isLiquidGlassSupported) {
    return (
      <LiquidGlassView
        interactive
        effect="clear"
        colorScheme="dark"
        style={[baseStyle, { backgroundColor: 'transparent' }, style]}
      >
        {children}
      </LiquidGlassView>
    );
  }
  return (
    <View style={[baseStyle, { backgroundColor: fallbackBg }, style]}>
      {children}
    </View>
  );
};

export const UsernameModal: React.FC<Props> = ({ visible, onClose, onSaved, initialValue = '' }) => {
  const [username, setUsername] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    setError(null);
    const clean = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{2,30}$/.test(clean)) {
      setError('Solo lettere minuscole, numeri e underscore (2-30).');
      return;
    }
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const r = await fetch(`${config.apiUrl}/creator/me/username`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ username: clean }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.message || data?.error || 'Salvataggio non riuscito');
        return;
      }
      onSaved(data.username);
      onClose();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }, [username, onSaved, onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
      <Pressable style={s.overlay} onPress={() => !saving && onClose()}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 360 }}>
          <Glass radius={24}>
            <View style={s.cardInner}>
              <View style={s.iconWrap}>
                <Ionicons name="at-circle-outline" size={28} color="#A78BFA" />
              </View>
              <Text style={s.title}>Scegli il tuo @username</Text>
              <Text style={s.sub}>
                Apparirà accanto alle tue app in Explore. Puoi cambiarlo dopo dalle impostazioni.
              </Text>
              <Glass radius={16} tint="input" style={{ marginBottom: 10 }}>
                <View style={s.inputRow}>
                  <Text style={s.prefix}>@</Text>
                  <TextInput
                    style={s.input}
                    value={username}
                    onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="il_mio_handle"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    editable={!saving}
                    maxLength={30}
                  />
                </View>
              </Glass>
              {error && <Text style={s.err}>{error}</Text>}
              <View style={s.row}>
                <Glass radius={18} style={{ flex: 1 }}>
                  <TouchableOpacity style={s.cancel} onPress={onClose} disabled={saving}>
                    <Text style={s.cancelText}>Annulla</Text>
                  </TouchableOpacity>
                </Glass>
                <TouchableOpacity style={[s.save, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator size="small" color="#0a0a0c" /> : (
                    <>
                      <Ionicons name="checkmark" size={16} color="#0a0a0c" />
                      <Text style={s.saveText}>Salva</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </Glass>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  cardInner: { padding: 24 },
  iconWrap: { alignItems: 'center', marginBottom: 8 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 6 },
  sub: { color: 'rgba(255,255,255,0.55)', fontSize: 13, textAlign: 'center', marginBottom: 18 },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11 },
  prefix: { color: 'rgba(255,255,255,0.4)', fontSize: 14, marginRight: 4 },
  input: { flex: 1, color: '#fff', fontSize: 14, padding: 0 },
  err: { color: '#FF4444', fontSize: 12, marginBottom: 10, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancel: { paddingVertical: 14, alignItems: 'center' },
  cancelText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' },
  save: { flex: 1, flexDirection: 'row', paddingVertical: 14, borderRadius: 18, backgroundColor: '#A78BFA', alignItems: 'center', justifyContent: 'center', gap: 6 },
  saveText: { color: '#0a0a0c', fontSize: 14, fontWeight: '700' },
});
