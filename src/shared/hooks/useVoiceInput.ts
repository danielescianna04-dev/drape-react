/**
 * useVoiceInput — speech-to-text hook for any TextInput-like component.
 *
 * Usage:
 *   const { isListening, micPulse, toggle } = useVoiceInput({
 *     onTranscript: (text) => appendToInput(text),
 *   });
 *
 * The consumer renders a mic button whose onPress = toggle, and wraps its
 * icon in <Animated.View style={{ transform: [{ scale: micPulse }] }}>.
 */
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Linking } from 'react-native';
import * as Haptics from 'expo-haptics';

let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: (event: string, cb: (e: any) => void) => void = () => {};
try {
  const mod = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = mod.ExpoSpeechRecognitionModule;
  useSpeechRecognitionEvent = mod.useSpeechRecognitionEvent;
} catch {
  /* module missing — hook no-ops */
}

interface Options {
  onTranscript: (text: string) => void;
  lang?: string;
}

export function useVoiceInput({ onTranscript, lang = 'it-IT' }: Options) {
  const [isListening, setIsListening] = useState(false);
  const micPulse = useRef(new Animated.Value(1)).current;
  const simulatorFailRef = useRef(false);
  // Keep latest onTranscript callback available inside the speech event hooks
  // (the speech hook captures the function once; without this ref it would
  // close over the first render's value and stale-transcript bugs appear).
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);

  useSpeechRecognitionEvent('result', (event: any) => {
    const transcript = event?.results?.[0]?.transcript || '';
    if (transcript) onTranscriptRef.current(transcript);
  });
  useSpeechRecognitionEvent('end', () => {
    if (simulatorFailRef.current) { simulatorFailRef.current = false; return; }
    setIsListening(false);
    stopAnim();
  });
  useSpeechRecognitionEvent('error', (e: any) => {
    if (e?.error === 'audio-capture') {
      simulatorFailRef.current = true;
      return;
    }
    setIsListening(false);
    stopAnim();
  });

  const startAnim = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(micPulse, { toValue: 1.18, duration: 600, useNativeDriver: true }),
        Animated.timing(micPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    ).start();
  };

  const stopAnim = () => {
    micPulse.stopAnimation();
    Animated.timing(micPulse, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  };

  const toggle = async () => {
    if (!ExpoSpeechRecognitionModule) {
      Alert.alert('Dettatura non disponibile', 'Il riconoscimento vocale non è disponibile su questo dispositivo.');
      return;
    }
    if (isListening) {
      try { ExpoSpeechRecognitionModule.stop(); } catch {}
      setIsListening(false);
      stopAnim();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    try {
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!result.granted) {
        Alert.alert(
          'Permesso necessario',
          'Consenti l\'accesso al microfono per dettare il messaggio.',
          [
            { text: 'Annulla', style: 'cancel' },
            { text: 'Impostazioni', onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsListening(true);
      startAnim();
      ExpoSpeechRecognitionModule.start({ lang, interimResults: false });
    } catch {
      setIsListening(false);
      stopAnim();
    }
  };

  return { isListening, micPulse, toggle };
}
