import { create } from 'zustand';

interface GitAuthRequest {
  id: string;
  repositoryUrl?: string;
  owner?: string;
  reason: string;
  onSuccess: (token: string) => void;
  onCancel: () => void;
}

interface GitAuthState {
  // Popup state
  showAuthPopup: boolean;
  currentRequest: GitAuthRequest | null;

  // Actions
  requestAuth: (request: Omit<GitAuthRequest, 'id'>) => void;
  completeAuth: (token: string) => void;
  cancelAuth: () => void;
  closePopup: () => void;
}

export const useGitAuthStore = create<GitAuthState>((set, get) => ({
  showAuthPopup: false,
  currentRequest: null,

  requestAuth: (request) => {
    const id = `auth-${Date.now()}`;
    set({
      showAuthPopup: true,
      currentRequest: {
        ...request,
        id,
      },
    });
  },

  completeAuth: (token) => {
    const { currentRequest } = get();
    if (currentRequest) {
      currentRequest.onSuccess(token);
    } else {
      console.warn('🔐 [GitAuthStore] No currentRequest found!');
    }
    set({
      showAuthPopup: false,
      currentRequest: null,
    });
  },

  cancelAuth: () => {
    const { currentRequest } = get();
    if (currentRequest) {
      currentRequest.onCancel();
    }
    set({
      showAuthPopup: false,
      currentRequest: null,
    });
  },

  closePopup: () => {
    set({
      showAuthPopup: false,
      currentRequest: null,
    });
  },
}));

// Helper function to request auth from anywhere
export const requestGitAuth = (
  reason: string,
  options?: {
    repositoryUrl?: string;
    owner?: string;
  }
): Promise<string> => {
  return new Promise((resolve, reject) => {
    useGitAuthStore.getState().requestAuth({
      reason,
      repositoryUrl: options?.repositoryUrl,
      owner: options?.owner,
      onSuccess: (token) => {
        resolve(token);
      },
      onCancel: () => {
        reject(new Error('Authentication cancelled'));
      },
    });
  });
};
