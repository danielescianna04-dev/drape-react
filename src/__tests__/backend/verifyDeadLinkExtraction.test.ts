import { describe, expect, it } from 'vitest';
import { extractDeadLinkHrefs } from '../../../backend-ts/src/services/verify/error-classifier';

const deadErr = (href: string | null, text = 'Progetti', page = '/') => {
  const bracket = href === null ? '' : ` [href=${href}]`;
  return `Dead interactive element: link "${text}"${bracket} on page ${page} — "${text}" (link) clicked but nothing happened`;
};

describe('extractDeadLinkHrefs', () => {
  it('extracts absolute-path hrefs from dead-click errors', () => {
    expect(extractDeadLinkHrefs([deadErr('/progetti')])).toEqual(['/progetti']);
  });

  it('supports nested routes with hyphens and underscores', () => {
    expect(extractDeadLinkHrefs([deadErr('/account/my-orders_2')])).toEqual(['/account/my-orders_2']);
  });

  it('deduplicates identical hrefs across multiple errors', () => {
    const errors = [deadErr('/progetti'), deadErr('/progetti', 'Vedi progetti')];
    expect(extractDeadLinkHrefs(errors)).toEqual(['/progetti']);
  });

  it('keeps distinct hrefs in input order', () => {
    const errors = [deadErr('/progetti'), deadErr('/about'), deadErr('/contatti')];
    expect(extractDeadLinkHrefs(errors)).toEqual(['/progetti', '/about', '/contatti']);
  });

  it('ignores non-dead-click errors', () => {
    const noise = '[route /progetti] Server returned HTTP 500 [href=/progetti]';
    expect(extractDeadLinkHrefs([noise])).toEqual([]);
  });

  it('ignores placeholder and fragment hrefs', () => {
    const errors = [
      deadErr('#'),
      deadErr('none'),
      deadErr('javascript:void(0)'),
      deadErr('mailto:foo@bar.com'),
      deadErr(''),
      deadErr(null),
    ];
    expect(extractDeadLinkHrefs(errors)).toEqual([]);
  });

  it('ignores root "/" and protocol-relative urls', () => {
    const errors = [deadErr('/'), deadErr('//example.com/x')];
    expect(extractDeadLinkHrefs(errors)).toEqual([]);
  });

  it('ignores absolute http urls (external links)', () => {
    // `http://...` fails the "must start with /" rule
    expect(extractDeadLinkHrefs([deadErr('http://foo.com/bar')])).toEqual([]);
  });

  it('rejects paths containing query strings or unsafe chars', () => {
    const errors = [
      deadErr('/search?q=1'),
      deadErr('/progetti#top'),
      deadErr('/path with space'),
    ];
    expect(extractDeadLinkHrefs(errors)).toEqual([]);
  });

  it('returns an empty array when given no errors', () => {
    expect(extractDeadLinkHrefs([])).toEqual([]);
  });
});
