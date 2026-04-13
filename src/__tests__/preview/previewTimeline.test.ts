import { describe, it, expect } from 'vitest';
import {
  createTimeline,
  addTimelineEntry,
  advanceStep,
  getProgressForStep,
} from '../../features/terminal/preview/previewTimeline';

describe('createTimeline', () => {
  it('returns empty timeline', () => {
    const tl = createTimeline();
    expect(tl.entries).toEqual([]);
    expect(tl.currentStep).toBeNull();
    expect(tl.progress).toBe(0);
    expect(tl.displayedMessage).toBe('');
  });
});

describe('addTimelineEntry', () => {
  it('adds entry with timestamp', () => {
    const tl = createTimeline();
    const updated = addTimelineEntry(tl, {
      type: 'log',
      message: 'Installing deps...',
    });
    expect(updated.entries).toHaveLength(1);
    expect(updated.entries[0].message).toBe('Installing deps...');
    expect(updated.entries[0].timestamp).toBeGreaterThan(0);
    expect(updated.displayedMessage).toBe('Installing deps...');
  });
});

describe('advanceStep', () => {
  it('updates currentStep and progress', () => {
    const tl = createTimeline();
    const updated = advanceStep(tl, 'installing', 'Installing...');
    expect(updated.currentStep).toBe('installing');
    expect(updated.progress).toBe(60);
    expect(updated.displayedMessage).toBe('Installing...');
    expect(updated.entries).toHaveLength(1);
    expect(updated.entries[0].type).toBe('step');
  });
});

describe('getProgressForStep', () => {
  it('returns correct values', () => {
    expect(getProgressForStep('analyzing')).toBe(5);
    expect(getProgressForStep('cloning')).toBe(15);
    expect(getProgressForStep('detecting')).toBe(30);
    expect(getProgressForStep('booting')).toBe(45);
    expect(getProgressForStep('installing')).toBe(60);
    expect(getProgressForStep('starting')).toBe(80);
    expect(getProgressForStep('ready')).toBe(100);
  });
});
