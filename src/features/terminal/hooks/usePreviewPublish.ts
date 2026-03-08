import { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import i18next from 'i18next';
import { getAuthHeaders } from '../../../core/api/getAuthToken';
import { trackPublish, trackPublishSuccess, trackPublishError } from '../../../core/services/analyticsService';

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
    if (!projectId || !apiUrl) return;
    let cancelled = false;

    getAuthHeaders()
      .then(authHeaders =>
        fetch(`${apiUrl}/fly/project/${projectId}/published`, { headers: authHeaders })
      )
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data.published) {
          setExistingPublish({ slug: data.slug, url: data.url });
        } else {
          setExistingPublish(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('[Publish] Failed to check published status:', err?.message || err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, apiUrl, serverStatus]);

  const handlePublish = async () => {
    const slug = existingPublish?.slug || publishSlug.trim();
    if (!slug || !projectId) return;
    setIsPublishing(true);
    setPublishStatus('building');
    setPublishError(null);
    setPublishedUrl(null);
    trackPublish(slug);
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
        const detail = [data?.error, data?.stderr].filter(Boolean).join(': ');
        const normalized = String(detail).toLowerCase();

        if (response.status === 409) {
          setPublishError(i18next.t('terminal:previewPublish.slugTaken'));
          trackPublishError('Slug taken');
        } else if (normalized.includes('server-side frameworks')) {
          setPublishError(i18next.t('terminal:previewPublish.serverSideNotSupported'));
          trackPublishError('Server-side framework not supported');
        } else {
          setPublishError(detail || i18next.t('terminal:previewPublish.publishFailed'));
          trackPublishError(detail || 'Publish failed');
        }
      } else {
        setPublishStatus('done');
        setPublishedUrl(data.url);
        setExistingPublish({ slug: data.slug, url: data.url });
        trackPublishSuccess(data.slug, data.url);
      }
    } catch (e: any) {
      setPublishStatus('error');
      setPublishError(e.message || i18next.t('common:networkError'));
      trackPublishError(e.message || 'Network error');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleUnpublish = () => {
    Alert.alert(
      i18next.t('terminal:previewPublish.removeTitle'),
      i18next.t('terminal:previewPublish.removeMessage', { slug: existingPublish?.slug }),
      [
        { text: i18next.t('common:cancel'), style: 'cancel' },
        {
          text: i18next.t('common:remove'), style: 'destructive', onPress: async () => {
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
