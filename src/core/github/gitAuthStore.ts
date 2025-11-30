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
    console.log('🔐 [GitAuthStore] requestAuth called:', {
      reason: request.reason,
      repositoryUrl: request.repositoryUrl,
      owner: request.owner,
      id,
    });
    set({
      showAuthPopup: true,
      currentRequest: {
        ...request,
        id,
      },
    });
    console.log('🔐 [GitAuthStore] showAuthPopup set to TRUE');
  },

  completeAuth: (token) => {
    console.log('🔐 [GitAuthStore] completeAuth called with token:', token?.substring(0, 10) + '...');
    const { currentRequest } = get();
    if (currentRequest) {
      console.log('🔐 [GitAuthStore] Calling onSuccess callback...');
      currentRequest.onSuccess(token);
      console.log('🔐 [GitAuthStore] onSuccess callback completed');
    } else {
      console.warn('🔐 [GitAuthStore] No currentRequest found!');
    }
    set({
      showAuthPopup: false,
      currentRequest: null,
    });
    console.log('🔐 [GitAuthStore] Popup closed');
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
  console.log('🔐 [requestGitAuth] Called with reason:', reason);
  return new Promise((resolve, reject) => {
    console.log('🔐 [requestGitAuth] Creating promise and calling requestAuth...');
    useGitAuthStore.getState().requestAuth({
      reason,
      repositoryUrl: options?.repositoryUrl,
      owner: options?.owner,
      onSuccess: (token) => {
        console.log('🔐 [requestGitAuth] onSuccess called with token');
        resolve(token);
      },
      onCancel: () => {
        console.log('🔐 [requestGitAuth] onCancel called');
        reject(new Error('Authentication cancelled'));
      },
    });
  });
};
