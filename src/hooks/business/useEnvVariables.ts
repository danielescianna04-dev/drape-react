import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { config } from '../../config/config';
import i18n from '../../i18n';

export interface EnvVariable {
  key: string;
  value: string;
  isSecret: boolean;
  description?: string;
}

/**
 * Hook for managing environment variables in a workstation
 * Handles loading, saving, adding, updating, and deleting env vars
 */
export const useEnvVariables = (workstationId: string | undefined) => {
  const [envVars, setEnvVars] = useState<EnvVariable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasEnvExample, setHasEnvExample] = useState(false);

  const loadEnvVariables = useCallback(async () => {
    if (!workstationId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(
        `${config.apiUrl}/workstation/${workstationId}/env-variables`
      );

      if (!response.ok) {
        throw new Error(`Failed to load env variables: ${response.status}`);
      }

      const data = await response.json();
      setEnvVars(data.variables || []);
      setHasEnvExample(data.hasEnvExample || false);
    } catch (error) {
      console.error('Failed to load env variables:', error);
      Alert.alert(i18n.t('common:error'), i18n.t('common:envVarLoadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [workstationId]);

  useEffect(() => {
    loadEnvVariables();
  }, [loadEnvVariables]);

  const saveEnvVariables = useCallback(async () => {
    if (!workstationId) return;

    try {
      setIsSaving(true);
      const response = await fetch(
        `${config.apiUrl}/workstation/${workstationId}/env-variables`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            variables: envVars,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to save env variables: ${response.status}`);
      }

      Alert.alert(i18n.t('common:success'), i18n.t('common:envVarSaveSuccess'));
    } catch (error) {
      console.error('Failed to save env variables:', error);
      Alert.alert(i18n.t('common:error'), i18n.t('common:envVarSaveFailed'));
    } finally {
      setIsSaving(false);
    }
  }, [workstationId, envVars]);

  const addEnvVariable = useCallback((key: string, value: string) => {
    if (!key.trim()) {
      Alert.alert(i18n.t('common:error'), i18n.t('common:envVarEnterName'));
      return false;
    }

    const existingVar = envVars.find(v => v.key === key);
    if (existingVar) {
      Alert.alert(i18n.t('common:error'), i18n.t('common:envVarAlreadyExists'));
      return false;
    }

    setEnvVars([...envVars, { key, value, isSecret: true }]);
    return true;
  }, [envVars]);

  const updateEnvVariable = useCallback((key: string, value: string) => {
    setEnvVars(envVars.map(v => v.key === key ? { ...v, value } : v));
  }, [envVars]);

  const deleteEnvVariable = useCallback((key: string) => {
    Alert.alert(
      i18n.t('common:deleteVariableTitle'),
      i18n.t('common:deleteVariableMessage', { key }),
      [
        { text: i18n.t('common:cancel'), style: 'cancel' },
        {
          text: i18n.t('common:delete'),
          style: 'destructive',
          onPress: () => setEnvVars(envVars.filter(v => v.key !== key))
        }
      ]
    );
  }, [envVars]);

  return {
    envVars,
    isLoading,
    isSaving,
    hasEnvExample,
    loadEnvVariables,
    saveEnvVariables,
    addEnvVariable,
    updateEnvVariable,
    deleteEnvVariable,
  };
};
