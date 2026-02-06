import React, { createContext, useContext, useEffect, ReactNode } from 'react';
import { aiService } from '../core/ai/aiService';
import { config } from '../config/config';

interface NetworkConfig {
  apiUrl: string;
  wsUrl: string;
}

const NetworkConfigContext = createContext<NetworkConfig | null>(null);

export function NetworkConfigProvider({ children }: { children: ReactNode }) {
  // Use config from .env directly - no auto-discovery
  const apiUrl = config.apiUrl;
  const wsUrl = config.wsUrl;

  // Initialize aiService with the configured URL
  useEffect(() => {
    aiService.setBaseUrl(apiUrl);
  }, [apiUrl]);

  const value: NetworkConfig = {
    apiUrl,
    wsUrl,
  };

  return (
    <NetworkConfigContext.Provider value={value}>
      {children}
    </NetworkConfigContext.Provider>
  );
}

export function useNetworkConfig() {
  const context = useContext(NetworkConfigContext);

  if (!context) {
    throw new Error('useNetworkConfig must be used within NetworkConfigProvider');
  }

  return context;
}
