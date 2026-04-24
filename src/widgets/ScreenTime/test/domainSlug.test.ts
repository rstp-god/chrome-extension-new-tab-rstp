import { describe, expect, it } from 'vitest'

import { slugifyDomain } from '@/widgets/ScreenTime/utils/domainSlug.ts'

describe('slugifyDomain', () => {
  it('converts dots to underscores and prefixes with d_', () => {
    expect(slugifyDomain('github.com')).toBe('d_github_com')
    expect(slugifyDomain('sub.domain.co.uk')).toBe('d_sub_domain_co_uk')
  })

  it('normalises case to lowercase', () => {
    expect(slugifyDomain('GitHub.COM')).toBe('d_github_com')
  })

  it('escapes any non-alphanumeric character', () => {
    expect(slugifyDomain('my-site.io')).toBe('d_my_site_io')
    expect(slugifyDomain('xn--bcher-kva.example')).toBe('d_xn__bcher_kva_example')
  })

  it('handles digit-leading hosts (legal, slug still ident-safe)', () => {
    // Real hostnames don't start with digits, but the regex-ness is what matters.
    expect(slugifyDomain('1337.com')).toBe('d_1337_com')
  })

  it('produces an ident-safe string — only a-z 0-9 _', () => {
    const slug = slugifyDomain("evil{}; url('bad')")
    expect(/^[a-z0-9_]+$/.test(slug)).toBe(true)
  })
})
