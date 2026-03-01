import { create } from 'zustand';

type ToastType = 'success' | 'error' | 'info';

interface ToastState {
  visible: boolean;
  message: string;
  icon: string;
  type: ToastType;
  duration: number;

  showToast: (opts: {
    message: string;
    icon?: string;
    type?: ToastType;
    duration?: number;
  }) => void;
  hideToast: () => void;
}

let _timer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  visible: false,
  message: '',
  icon: 'checkmark-circle',
  type: 'success',
  duration: 2500,

  showToast: ({ message, icon = 'checkmark-circle', type = 'success', duration = 2500 }) => {
    if (_timer) clearTimeout(_timer);

    set({ visible: true, message, icon, type, duration });

    _timer = setTimeout(() => {
      set({ visible: false });
      _timer = null;
    }, duration);
  },

  hideToast: () => {
    if (_timer) {
      clearTimeout(_timer);
      _timer = null;
    }
    set({ visible: false });
  },
}));
