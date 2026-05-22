/**
 * AiSdkTestScreen — manual harness to exercise the AI SDK v6 chat pipeline.
 *
 * Hits POST /agent/v2/chat via the new useAgentChat hook, renders messages by
 * walking the AI SDK `parts[]` array, and exposes a HITL answer input when a
 * `user_question` tool part arrives.
 *
 * Intentionally minimal — not part of the production chat surface. Navigate
 * via useNavigationStore.navigateTo('aiSdkTest'). Remove once v2 is integrated
 * into ChatPage.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAgentChat, postQuestionAnswer } from '../core/ai/useAgentChat';
import { useNavigationStore } from '../core/navigation/navigationStore';
import { useWorkstationStore } from '../core/terminal/workstationStore';

export const AiSdkTestScreen: React.FC = () => {
  const navigateTo = useNavigationStore((s) => s.navigateTo);
  const workstations = useWorkstationStore((s) => s.workstations);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    workstations[0]?.id ?? null,
  );
  const [input, setInput] = useState('');
  const [answerInputs, setAnswerInputs] = useState<Record<string, string>>({});
  const [questionMeta, setQuestionMeta] = useState<Record<string, { requestID: string }>>({});

  const chat = useAgentChat({ projectId: selectedProjectId || '' });
  const { messages, sendMessage, error } = chat as any;
  const status: string = (chat as any).status || 'idle';

  // Intercept data-question-meta parts to remember the opencode requestID per
  // toolCallId. We scan messages on every render — cheap given the array size.
  React.useEffect(() => {
    const meta: Record<string, { requestID: string }> = {};
    for (const m of messages || []) {
      for (const p of (m.parts || []) as any[]) {
        if (p?.type === 'data-question-meta' && p.data?.toolCallId && p.data?.requestID) {
          meta[p.data.toolCallId] = { requestID: p.data.requestID };
        }
      }
    }
    setQuestionMeta(meta);
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || !selectedProjectId) return;
    sendMessage({ text: input });
    setInput('');
  };

  const handleAnswerQuestion = async (toolCallId: string) => {
    const answer = answerInputs[toolCallId]?.trim();
    if (!answer || !selectedProjectId) return;
    const meta = questionMeta[toolCallId];
    if (!meta?.requestID) {
      Alert.alert('Errore', 'requestID opencode non ancora ricevuto, riprova tra un secondo');
      return;
    }
    try {
      await postQuestionAnswer({
        projectId: selectedProjectId,
        requestID: meta.requestID,
        answer,
      });
      setAnswerInputs((prev) => ({ ...prev, [toolCallId]: '' }));
    } catch (err: any) {
      Alert.alert('Risposta fallita', err?.message || 'Errore sconosciuto');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigateTo('home')} style={styles.backButton}>
          <Text style={styles.backText}>← Home</Text>
        </TouchableOpacity>
        <Text style={styles.title}>AI SDK Test</Text>
        <Text style={styles.statusText}>{status}</Text>
      </View>

      <ScrollView horizontal style={styles.projectPicker} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
        {workstations.map((ws) => (
          <TouchableOpacity
            key={ws.id}
            style={[styles.projectChip, selectedProjectId === ws.id && styles.projectChipActive]}
            onPress={() => setSelectedProjectId(ws.id)}
          >
            <Text style={styles.projectChipText}>{ws.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.messages} contentContainerStyle={{ padding: 12, gap: 8 }}>
        {(messages || []).map((msg: any) => (
          <View key={msg.id} style={[styles.message, msg.role === 'user' ? styles.userMsg : styles.assistantMsg]}>
            <Text style={styles.role}>{msg.role}</Text>
            {(msg.parts || []).map((part: any, idx: number) => {
              if (part.type === 'text') {
                return <Text key={idx} style={styles.text}>{part.text}</Text>;
              }
              if (part.type?.startsWith('tool-')) {
                const toolName = part.type.replace(/^tool-/, '');
                const isQuestion = toolName === 'user_question';
                return (
                  <View key={idx} style={styles.toolBlock}>
                    <Text style={styles.toolHeader}>🔧 {toolName} · {part.state || 'input-streaming'}</Text>
                    {part.input ? (
                      <Text style={styles.toolInput} numberOfLines={3}>
                        input: {JSON.stringify(part.input).slice(0, 200)}
                      </Text>
                    ) : null}
                    {isQuestion && part.state === 'input-available' && (
                      <View style={styles.questionAnswerRow}>
                        <TextInput
                          style={styles.answerInput}
                          value={answerInputs[part.toolCallId] || ''}
                          onChangeText={(t) => setAnswerInputs((prev) => ({ ...prev, [part.toolCallId]: t }))}
                          placeholder="La tua risposta…"
                          placeholderTextColor="#888"
                        />
                        <TouchableOpacity
                          style={styles.answerButton}
                          onPress={() => handleAnswerQuestion(part.toolCallId)}
                        >
                          <Text style={styles.answerButtonText}>↑</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {part.output ? (
                      <Text style={styles.toolOutput} numberOfLines={5}>
                        output: {JSON.stringify(part.output).slice(0, 400)}
                      </Text>
                    ) : null}
                  </View>
                );
              }
              if (part.type === 'data-question-meta') {
                return <Text key={idx} style={styles.metaText}>📌 requestID: {part.data?.requestID}</Text>;
              }
              return <Text key={idx} style={styles.metaText}>· {part.type}</Text>;
            })}
          </View>
        ))}
        {status === 'streaming' && <ActivityIndicator color="#fff" style={{ marginTop: 12 }} />}
        {error && <Text style={styles.error}>Error: {String(error?.message || error)}</Text>}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={selectedProjectId ? 'Scrivi al backend v2…' : 'Seleziona un progetto sopra'}
          placeholderTextColor="#777"
          editable={!!selectedProjectId}
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={!input.trim() || !selectedProjectId}>
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f2a',
    gap: 12,
  },
  backButton: { paddingVertical: 4, paddingHorizontal: 6 },
  backText: { color: '#9aa6ff', fontSize: 14 },
  title: { color: '#fff', fontSize: 16, fontWeight: '600', flex: 1 },
  statusText: { color: '#888', fontSize: 12, fontFamily: 'Menlo' },
  projectPicker: { maxHeight: 40, paddingVertical: 6 },
  projectChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#1a1a26' },
  projectChipActive: { backgroundColor: '#3b3b6e' },
  projectChipText: { color: '#fff', fontSize: 12 },
  messages: { flex: 1 },
  message: { padding: 10, borderRadius: 10, gap: 4 },
  userMsg: { backgroundColor: '#1e2456', alignSelf: 'flex-end', maxWidth: '85%' },
  assistantMsg: { backgroundColor: '#181822', alignSelf: 'flex-start', maxWidth: '95%' },
  role: { color: '#888', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  text: { color: '#e5e5ef', fontSize: 14, lineHeight: 20 },
  toolBlock: {
    backgroundColor: '#0f0f18',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    gap: 6,
  },
  toolHeader: { color: '#9aa6ff', fontSize: 11, fontFamily: 'Menlo' },
  toolInput: { color: '#aaa', fontSize: 11, fontFamily: 'Menlo' },
  toolOutput: { color: '#9fd89f', fontSize: 11, fontFamily: 'Menlo' },
  metaText: { color: '#666', fontSize: 11, fontFamily: 'Menlo' },
  questionAnswerRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  answerInput: {
    flex: 1,
    backgroundColor: '#1a1a26',
    color: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    fontSize: 13,
  },
  answerButton: {
    backgroundColor: '#3b3b6e',
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 8,
  },
  answerButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  inputRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#1f1f2a',
  },
  input: {
    flex: 1,
    backgroundColor: '#15151f',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    fontSize: 14,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#3b3b6e',
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 10,
  },
  sendButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  error: { color: '#ff8a8a', fontSize: 12, marginTop: 8 },
});

export default AiSdkTestScreen;
