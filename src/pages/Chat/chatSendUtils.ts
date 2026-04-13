import type { WorkstationInfo } from '../../shared/types';

export interface ChatInputImage {
  uri: string;
  base64?: string;
  type?: string;
}

export const getImagesToSend = (
  images?: ChatInputImage[],
  selectedImages: ChatInputImage[] = [],
): ChatInputImage[] | undefined => {
  if (images && images.length > 0) return images;
  if (selectedImages.length > 0) return selectedImages;
  return undefined;
};

export const buildUserMessage = (
  input: string,
  images?: ChatInputImage[],
): string => {
  const trimmed = input.trim();
  if (trimmed) return trimmed;
  if (images && images.length > 0) {
    return `[${images.length} immagini allegate]`;
  }
  return '';
};

export const normalizeImagesForStore = (images?: ChatInputImage[]) => (
  images?.map((img) => ({
    uri: String(img.uri || ''),
    base64: String(img.base64 || ''),
    type: String(img.type || 'image/jpeg'),
  }))
);

export const normalizeImagesForAgent = (images?: ChatInputImage[]) => (
  images?.map((img) => ({
    base64: String(img.base64 || ''),
    type: String(img.type || 'image/jpeg'),
  }))
);

export const getActiveChatTabId = (currentTabId?: string, tabId?: string) => currentTabId || tabId || null;

export const buildAiChatRequestPayload = (
  userMessage: string,
  selectedModel: string,
  conversationHistory: string[],
  currentWorkstation: WorkstationInfo | null,
  rawUserId: string | null,
  thinkingLevel?: string,
) => {
  const normalizedUserId = rawUserId || 'anonymous';

  return {
    prompt: userMessage,
    selectedModel,
    conversationHistory,
    workstationId: currentWorkstation?.id,
    projectId: currentWorkstation?.projectId || currentWorkstation?.id,
    repositoryUrl: currentWorkstation?.githubUrl || currentWorkstation?.repositoryUrl,
    userId: rawUserId,
    username: normalizedUserId.split('@')[0].replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase(),
    thinkingLevel: thinkingLevel || null,
    context: currentWorkstation ? {
      projectName: currentWorkstation.name || 'Unnamed Project',
      language: currentWorkstation.language || 'Unknown',
      repositoryUrl: currentWorkstation.githubUrl || currentWorkstation.repositoryUrl || '',
    } : undefined,
  };
};

export const buildToolCommandText = (
  tool: string,
  args: Record<string, unknown>,
) => {
  switch (tool) {
    case 'read_file':
      return `cat ${String(args.filePath || '')}`.trim();
    case 'list_files':
      return `ls ${String(args.directory || '.')}`.trim();
    case 'search_in_files':
      return `grep -r "${String(args.pattern || '')}" .`;
    default:
      return tool;
  }
};
