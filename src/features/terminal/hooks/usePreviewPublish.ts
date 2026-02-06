import { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { useAuthStore } from '../../../core/auth/authStore';
import { getAuthHeaders } from '../../../core/api/getAuthToken';

interface PublishState {
  showPublishModal: boolean;
  publishSlug: string;
  isPublishing: boolean;
  publishStatus: 'idle' | 'building' | 'publishing' | 'done' | 'error';
  publishedUrl: string | null;
  publishError: string | null;
  existingPublish: { slug: string; url: string } | null;
}

interface UsePreviewPublishParams {
  projectId: string | undefined;
  apiUrl: string;
  serverStatus: 'checking' | 'running' | 'stopped';
}

export function usePreviewPublish({ projectId, apiUrl, serverStatus }: UsePreviewPublishParams) {
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishSlug, setPublishSlug] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<PublishState['publishStatus']>('idle');
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [existingPublish, setExistingPublish] = useState<{ slug: string; url: string } | null>(null);

  // Check if project is already published
  useEffect(() => {
    if (!projectId || !apiUrl || serverStatus !== 'running') return;
    getAuthHeaders().then(authHeaders =>
      fetch(`${apiUrl}/fly/project/${projectId}/published`, { headers: authHeaders })
    ).then(r => r.json())
      .then(data => {
        if (data.published) {
          setExistingPublish({ slug: data.slug, url: data.url });
        }
      })
      .catch((err) => console.warn('[Publish] Failed to check published status:', err?.message || err));
  }, [projectId, apiUrl, serverStatus]);

  const handlePublish = async () => {
    const slug = existingPublish?.slug || publishSlug.trim();
    if (!slug || !projectId) return;
    setIsPublishing(true);
    setPublishStatus('building');
    setPublishError(null);
    setPublishedUrl(null);
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/fly/project/${projectId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ slug }),
      });
      const data = await response.json();
      if (!response.ok) {
        setPublishStatus('error');
        setPublishError(data.error || 'Publish failed');
      } else {
        setPublishStatus('done');
        setPublishedUrl(data.url);
        setExistingPublish({ slug: data.slug, url: data.url });
      }
    } catch (e: any) {
      setPublishStatus('error');
      setPublishError(e.message || 'Network error');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleUnpublish = () => {
    Alert.alert(
      'Rimuovi pubblicazione',
      `Il sito drape.info/p/${existingPublish?.slug} non sara' piu' accessibile.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Rimuovi', style: 'destructive', onPress: async () => {
            if (!projectId) return;
            try {
              const deleteAuthHeaders = await getAuthHeaders();
              await fetch(`${apiUrl}/fly/project/${projectId}/published`, { method: 'DELETE', headers: deleteAuthHeaders });
              setExistingPublish(null);
              setShowPublishModal(false);
            } catch {}
          }
        },
      ]
    );
  };

  const openPublishModal = () => {
    setPublishSlug(existingPublish?.slug || '');
    setPublishStatus('idle');
    setPublishedUrl(null);
    setPublishError(null);
    setShowPublishModal(true);
  };

  return {
    // State
    showPublishModal,
    publishSlug,
    isPublishing,
    publishStatus,
    publishedUrl,
    publishError,
    existingPublish,
    // Actions
    setPublishSlug,
    handlePublish,
    handleUnpublish,
    openPublishModal,
    closePublishModal: () => setShowPublishModal(false),
  };
}
