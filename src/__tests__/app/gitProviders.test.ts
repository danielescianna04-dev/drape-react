import { parseGitUrl } from '@/app/gitProviders';

describe('parseGitUrl', () => {
  it('parses GitHub repositories', () => {
    expect(parseGitUrl('https://github.com/openai/codex.git')).toEqual({
      provider: 'github',
      owner: 'openai',
      repo: 'codex',
      fullName: 'openai/codex',
    });
  });

  it('parses GitLab repositories', () => {
    expect(parseGitUrl('https://gitlab.com/acme/platform')).toEqual({
      provider: 'gitlab',
      owner: 'acme',
      repo: 'platform',
      fullName: 'acme/platform',
    });
  });

  it('falls back to generic gitea-style parsing', () => {
    expect(parseGitUrl('https://git.example.com/team/internal-tools.git')).toEqual({
      provider: 'gitea',
      owner: 'team',
      repo: 'internal-tools',
      fullName: 'team/internal-tools',
    });
  });
});
