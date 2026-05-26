import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useProvisionDatabase } from './useProvisionDatabase';
import type { AppwriteCredentials } from '../../lib/api/appwriteApi';

interface Props {
  projectId: string;
  onConnected: (credentials: AppwriteCredentials) => void;
  /** Mostra mini badge "Connesso" se già provisionato. Se false, nasconde il bottone quando connesso. */
  alwaysVisible?: boolean;
}

/**
 * Bottone "Connetti database" — UX trasparente per provisioning Appwrite.
 *
 * Nessun signup, nessun magic link richiesto all'utente: il backend Bynot gestisce
 * tutto via la sua Server API key. L'utente vede solo "Database pronto".
 */
export function ConnectDatabaseButton({ projectId, onConnected, alwaysVisible }: Props) {
  const { loading, error, credentials, provision, loadFromDb } = useProvisionDatabase(projectId);

  // Al mount, controlla se è già provisionato in Supabase
  React.useEffect(() => {
    let cancelled = false;
    loadFromDb().then((creds) => {
      if (!cancelled && creds) onConnected(creds);
    });
    return () => { cancelled = true; };
  }, [loadFromDb, onConnected]);

  const handlePress = React.useCallback(async () => {
    try {
      const creds = await provision();
      onConnected(creds);
    } catch {
      // error in state
    }
  }, [provision, onConnected]);

  if (credentials && !alwaysVisible) {
    return null;
  }

  if (credentials && alwaysVisible) {
    return (
      <View style={[styles.badge, styles.connectedBadge]}>
        <Text style={styles.connectedText}>● Database connesso</Text>
      </View>
    );
  }

  return (
    <View>
      <Pressable
        onPress={handlePress}
        disabled={loading}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
          loading && styles.buttonDisabled,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Connetti database</Text>
        )}
      </Pressable>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#1f6feb',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonPressed: { opacity: 0.8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  connectedBadge: { backgroundColor: 'rgba(46,160,67,0.15)' },
  connectedText: { color: '#3fb950', fontSize: 12, fontWeight: '600' },
  errorText: {
    marginTop: 8,
    color: '#f85149',
    fontSize: 12,
  },
});
