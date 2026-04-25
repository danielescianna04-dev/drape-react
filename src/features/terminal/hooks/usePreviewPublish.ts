import { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import i18next from 'i18next';
import { getAuthHeaders } from '../../../core/api/getAuthToken';
import { tracciaPubblicazioneAvviata, tracciaPubblicazioneRiuscita, tracciaErrorePubblicazione, tracciaPubblicaPremuto } from '../../../core/services/analyticsService';

/**
 * Translate raw backend build/publish errors into user-friendly Italian messages.
 * Non-dev users shouldn't see "ENOSPC" or "heap out of memory" — those get mapped
 * to actionable copy. Anything we don't recognise falls through to a generic
 * message so we never show raw stack traces.
 */
function humanizePublishError(detail: string): string {
  const d = detail.toLowerCase();
  // Next.js "Cannot find module for page: /foo" → dead link/route, not an import issue
  const pageMatch = detail.match(/Cannot find module for page:\s*(\S+)/i);
  if (pageMatch) {
    return `C'è un link verso la pagina ${pageMatch[1]} ma quella pagina non esiste. Chiedi all'AI di crearla o di rimuovere il link, poi riprova.`;
  }
  if (/pagenotfounderror|failed to collect page data/.test(d)) {
    return 'Il progetto ha un link verso una pagina che non esiste. Chiedi all\'AI di correggere i link rotti e riprova.';
  }
  if (/cannot find module|module not found|can't resolve/.test(d)) {
    return 'Il progetto usa una libreria che non riesco a trovare. Chiedi all\'AI di sistemare gli import e riprova.';
  }
  if (/heap out of memory|javascript heap|out of memory/.test(d)) {
    return 'Il progetto è troppo grande per essere pubblicato in un colpo. Prova a rimuovere qualche dipendenza non necessaria.';
  }
  if (/enospc|no space left/.test(d)) {
    return 'Il server è temporaneamente senza spazio. Riprova tra qualche minuto.';
  }
  if (/eacces|permission denied/.test(d)) {
    return 'Errore di permessi sul server. Riprova tra un minuto, se persiste contattaci.';
  }
  if (/syntax error|unexpected token|parse error/.test(d)) {
    return 'C\'è un errore di sintassi nel codice. Chiedi all\'AI di controllarlo e riprova.';
  }
  if (/error ts\d+|type error|typescript/.test(d)) {
    return 'Il codice ha errori di TypeScript. Chiedi all\'AI di risolverli prima di ripubblicare.';
  }
  if (/npm err!|enoent|eusage/.test(d)) {
    return 'L\'installazione delle dipendenze ha fallito. Prova a rigenerare il progetto o rimuovi package non usati.';
  }
  if (/no build output|build output found/.test(d)) {
    return 'La costruzione non ha prodotto file pubblicabili. Il progetto potrebbe avere una configurazione non standard.';
  }
  if (/fetch failed|econnrefused|econnreset|etimedout/.test(d)) {
    return 'Problema di rete durante il build. Riprova tra un momento.';
  }
  if (/license|restrictive/.test(d)) {
    return 'Il progetto usa librerie con licenze incompatibili con la pubblicazione pubblica.';
  }
  if (/chunk|static export/.test(d)) {
    return 'Il progetto ha feature server-side incompatibili con la pubblicazione statica. Semplifica il codice lato server o usa solo la preview live.';
  }
  // Generic fallback
  return 'La pubblicazione non è riuscita. Riprova, se persiste contattaci.';
}

export type PublishCategory = 'app' | 'game' | 'tool' | 'site' | 'art' | 'other';

export interface ExistingPublish {
  slug: string;
  url: string;
  title?: string;
  description?: string;
  category?: PublishCategory;
  isPublic?: boolean;
  viewCount?: number;
}

interface PublishState {
  showPublishModal: boolean;
  publishSlug: string;
  isPublishing: boolean;
  publishStatus: 'idle' | 'building' | 'publishing' | 'done' | 'error';
  publishedUrl: string | null;
  publishError: string | null;
  existingPublish: ExistingPublish | null;
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
  const [existingPublish, setExistingPublish] = useState<ExistingPublish | null>(null);
  // Platform metadata (Explore-facing). Editable in PublishSheet.
  const [publishTitle, setPublishTitle] = useState('');
  const [publishDescription, setPublishDescription] = useState('');
  const [publishCategory, setPublishCategory] = useState<PublishCategory>('other');
  const [publishIsPublic, setPublishIsPublic] = useState(false);

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
          setExistingPublish({
            slug: data.slug,
            url: data.url,
            title: data.title,
            description: data.description,
            category: data.category,
            isPublic: data.isPublic,
            viewCount: data.viewCount,
          });
          // Pre-fill editable fields from server state.
          if (typeof data.title === 'string') setPublishTitle(data.title);
          if (typeof data.description === 'string') setPublishDescription(data.description);
          if (typeof data.category === 'string') setPublishCategory(data.category as PublishCategory);
          if (typeof data.isPublic === 'boolean') setPublishIsPublic(data.isPublic);
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
    tracciaPubblicazioneAvviata(slug);
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/fly/project/${projectId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          slug,
          title: publishTitle.trim(),
          description: publishDescription.trim(),
          category: publishCategory,
          isPublic: publishIsPublic,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setPublishStatus('error');
        const detail = [data?.error, data?.stderr].filter(Boolean).join(': ');
        const normalized = String(detail).toLowerCase();

        if (data?.error === 'PUBLISH_REQUIRES_PAID') {
          setPublishError(i18next.t('terminal:previewPublish.requiresPaid', { defaultValue: 'La pubblicazione è disponibile con il piano Go.' }));
          tracciaErrorePubblicazione('Publish requires paid plan');
        } else if (data?.error === 'PUBLISH_NEEDS_SERVER_RUNTIME') {
          setPublishError(data.message || 'Il tuo progetto usa funzionalità server-side che non possono essere pubblicate come sito statico.');
          tracciaErrorePubblicazione('Publish needs server runtime');
        } else if (response.status === 409) {
          setPublishError(i18next.t('terminal:previewPublish.slugTaken'));
          tracciaErrorePubblicazione('Slug taken');
        } else if (normalized.includes('server-side frameworks')) {
          setPublishError(i18next.t('terminal:previewPublish.serverSideNotSupported'));
          tracciaErrorePubblicazione('Server-side framework not supported');
        } else {
          setPublishError(humanizePublishError(detail));
          tracciaErrorePubblicazione(detail || 'Publish failed');
        }
      } else {
        setPublishStatus('done');
        setPublishedUrl(data.url);
        setExistingPublish({
          slug: data.slug,
          url: data.url,
          title: publishTitle.trim() || data.slug,
          description: publishDescription.trim(),
          category: publishCategory,
          isPublic: publishIsPublic,
        });
        tracciaPubblicazioneRiuscita(data.slug, data.url);
      }
    } catch (e: any) {
      setPublishStatus('error');
      setPublishError(e.message || i18next.t('common:networkError'));
      tracciaErrorePubblicazione(e.message || 'Network error');
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
    tracciaPubblicaPremuto();
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
    publishTitle,
    publishDescription,
    publishCategory,
    publishIsPublic,
    // Actions
    setPublishSlug,
    setPublishTitle,
    setPublishDescription,
    setPublishCategory,
    setPublishIsPublic,
    handlePublish,
    handleUnpublish,
    openPublishModal,
    closePublishModal: () => setShowPublishModal(false),
  };
}
