import {
  buildChangedFiles,
  buildCommitFileTree,
  buildGitChangeTree,
  countCommitFileTreeFiles,
  countGitChangeNodeFiles,
  formatGitCommitDate,
  getBranchColorMap,
  getCommitTimelineColors,
} from '@/features/terminal/components/gitSheetUtils';

describe('gitSheetUtils', () => {
  it('deduplicates changed files while preserving delete priority', () => {
    const changed = buildChangedFiles({
      staged: ['src/App.tsx'],
      modified: ['src/App.tsx', 'README.md'],
      untracked: ['docs/ARCHITECTURE.md'],
      deleted: ['old/file.ts', 'README.md'],
    });

    expect(changed).toEqual([
      { file: 'old/file.ts', type: 'deleted' },
      { file: 'README.md', type: 'deleted' },
      { file: 'src/App.tsx', type: 'modified' },
      { file: 'docs/ARCHITECTURE.md', type: 'untracked' },
    ]);
  });

  it('builds a nested tree for change files', () => {
    const tree = buildGitChangeTree([
      { file: 'src/pages/Chat/ChatPage.tsx', type: 'modified' },
      { file: 'src/pages/Chat/ChatInputBar.tsx', type: 'modified' },
      { file: 'README.md', type: 'deleted' },
    ]);

    expect(tree[0].name).toBe('src');
    expect(countGitChangeNodeFiles(tree[0])).toBe(2);
    expect(tree[1]).toMatchObject({ name: 'README.md', type: 'file', changeType: 'deleted' });
  });

  it('builds commit file trees and counts nested files', () => {
    const tree = buildCommitFileTree([
      { file: 'src/features/terminal/GitSheet.tsx', status: 'M' },
      { file: 'src/features/terminal/GitDiffModals.tsx', status: 'A' },
      { file: 'docs/ARCHITECTURE.md', status: 'M' },
    ]);

    expect(tree[0].name).toBe('docs');
    expect(tree[1].name).toBe('src');
    expect(countCommitFileTreeFiles(tree[1])).toBe(2);
  });

  it('assigns stable branch and timeline colors', () => {
    const branches = [
      { name: 'main', isCurrent: true, isRemote: false },
      { name: 'feature/refactor', isCurrent: false, isRemote: false },
    ];

    const branchColors = getBranchColorMap(branches);
    const timelineColors = getCommitTimelineColors(
      [
        { hash: 'a', shortHash: 'aaaaaaa', message: 'head', author: 'me', authorEmail: '', date: new Date(), isHead: true },
        { hash: 'b', shortHash: 'bbbbbbb', message: 'feature', author: 'me', authorEmail: '', date: new Date(), isHead: false },
      ],
      'main',
      branchColors,
      {
        aaaaaaa: ['main'],
        bbbbbbb: ['feature/refactor'],
      },
    );

    expect(branchColors.main).toBeTruthy();
    expect(branchColors['feature/refactor']).toBeTruthy();
    expect(timelineColors[0]).toBe(branchColors.main);
    expect(timelineColors[1]).toBe(branchColors['feature/refactor']);
  });

  it('formats commit dates consistently', () => {
    expect(formatGitCommitDate(new Date('2026-04-13T09:05:00.000Z'))).toContain('2026');
  });
});
