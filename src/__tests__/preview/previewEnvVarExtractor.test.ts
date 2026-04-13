import { describe, it, expect } from 'vitest';
import { extractMissingEnvVars } from '../../features/terminal/preview/errors/previewEnvVarExtractor';

describe('extractMissingEnvVars', () => {
  it('extracts NEXT_PUBLIC_API_KEY from error message', () => {
    const vars = extractMissingEnvVars(
      'process.env.NEXT_PUBLIC_API_KEY is not defined',
    );
    expect(vars).toContain('NEXT_PUBLIC_API_KEY');
  });

  it('extracts VITE_API_URL from error message', () => {
    const vars = extractMissingEnvVars('Missing env: VITE_API_URL');
    expect(vars).toContain('VITE_API_URL');
  });

  it('extracts multiple vars from a single error string', () => {
    const vars = extractMissingEnvVars(
      '- DATABASE_URL\n- NEXT_PUBLIC_KEY\n- REDIS_HOST',
    );
    expect(vars).toContain('DATABASE_URL');
    expect(vars).toContain('NEXT_PUBLIC_KEY');
    expect(vars).toContain('REDIS_HOST');
  });

  it('returns empty array for non-env errors', () => {
    const vars = extractMissingEnvVars('something went wrong');
    expect(vars).toEqual([]);
  });

  it('deduplicates extracted vars', () => {
    const vars = extractMissingEnvVars(
      'DATABASE_URL is missing. Check DATABASE_URL in .env',
    );
    const count = vars.filter((v) => v === 'DATABASE_URL').length;
    expect(count).toBe(1);
  });
});
