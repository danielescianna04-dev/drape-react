import { NativeModules, Platform } from 'react-native';

const GlassEffectModule = Platform.OS === 'ios' ? NativeModules.GlassEffectModule : null;

export async function applyGlassEffect(nativeID: string, cornerRadius: number = 28): Promise<boolean> {
  if (!GlassEffectModule) {
    return false;
  }
  try {
    const result = await GlassEffectModule.applyWithCallback(nativeID, cornerRadius);
    console.log('[GlassEffect] Native result:', JSON.stringify(result));
    return result?.status === 'success' || result?.status === 'already_applied';
  } catch (e: any) {
    console.error('[GlassEffect] Native error:', e.message || e);
    return false;
  }
}

export function removeGlassEffect(nativeID: string): void {
  GlassEffectModule?.remove(nativeID);
}

export function removeAllGlassEffects(): void {
  GlassEffectModule?.removeAll();
}
