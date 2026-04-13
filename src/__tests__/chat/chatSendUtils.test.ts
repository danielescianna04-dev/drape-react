import { describe, expect, it } from 'vitest';
import {
  buildAiChatRequestPayload,
  buildToolCommandText,
  buildUserMessage,
  getActiveChatTabId,
  getImagesToSend,
  normalizeImagesForAgent,
  normalizeImagesForStore,
} from '../../pages/Chat/chatSendUtils';

describe('chatSendUtils', () => {
  it('builds user message from trimmed input first', () => {
    expect(buildUserMessage('  ciao  ', [{ uri: 'x' }])).toBe('ciao');
  });

  it('falls back to image placeholder when input is empty', () => {
    expect(buildUserMessage('   ', [{ uri: 'x' }, { uri: 'y' }])).toBe('[2 immagini allegate]');
  });

  it('prefers explicit images over selected images', () => {
    expect(getImagesToSend([{ uri: 'explicit' }], [{ uri: 'selected' }])?.[0]?.uri).toBe('explicit');
  });

  it('normalizes image payloads for store and agent', () => {
    expect(normalizeImagesForStore([{ uri: 'file://a' }])).toEqual([
      { uri: 'file://a', base64: '', type: 'image/jpeg' },
    ]);
    expect(normalizeImagesForAgent([{ uri: 'file://a', base64: 'abc', type: 'image/png' }])).toEqual([
      { base64: 'abc', type: 'image/png' },
    ]);
  });

  it('uses current tab id first', () => {
    expect(getActiveChatTabId('current', 'fallback')).toBe('current');
    expect(getActiveChatTabId(undefined, 'fallback')).toBe('fallback');
  });

  it('builds AI chat payload with normalized username', () => {
    const payload = buildAiChatRequestPayload(
      'ciao',
      'gpt',
      ['a'],
      {
        id: 'w1',
        name: 'Proj',
        language: 'ts',
        status: 'running',
        createdAt: new Date(),
        files: [],
      },
      'user+tag@example.com',
      'high',
    );

    expect(payload.username).toBe('user-tag');
    expect(payload.projectId).toBe('w1');
    expect(payload.context?.projectName).toBe('Proj');
  });

  it('builds shell-like tool commands', () => {
    expect(buildToolCommandText('read_file', { filePath: 'src/a.ts' })).toBe('cat src/a.ts');
    expect(buildToolCommandText('list_files', {})).toBe('ls .');
    expect(buildToolCommandText('search_in_files', { pattern: 'hello' })).toBe('grep -r "hello" .');
  });
});
