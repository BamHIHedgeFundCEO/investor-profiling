import { describe, expect, it, vi } from 'vitest';
import { buildRow, saveProfile } from '../src/lib/persistence/supabase';
import interestsData from '../src/data/interests.json';
import { runScenario, scenarioById } from '../src/lib/demo';
import type { ProfileRecord, SocialLayer } from '../src/lib/scoring/types';

const ENV = { url: 'https://example.supabase.co', key: 'anon-key' };

async function profileWith(social: SocialLayer | null): Promise<ProfileRecord> {
  const p = await runScenario(scenarioById('calm')!);
  return {
    ...p,
    social_layer: social,
    responses: { ...p.responses, Q13: { target: 'btc', text: '我年薪 120 萬，還是想買', quality: 'usable' } },
  };
}

const ok = () => vi.fn(async () => ({ ok: true, status: 201 }) as unknown as Response);

describe('interest data', () => {
  const data = interestsData as { interests: { id: string; label: string }[]; contact_prefs: { id: string }[] };

  it('is data, not code: the twelve options and three preferences live in JSON', () => {
    expect(data.interests).toHaveLength(12);
    expect(new Set(data.interests.map((i) => i.id)).size).toBe(12);
    expect(data.contact_prefs.map((p) => p.id)).toEqual(['online_only', 'open_to_offline', 'undecided']);
  });

  it('carries no weight, score or order field — it must not look like it counts', () => {
    for (const i of data.interests) expect(Object.keys(i).sort()).toEqual(['id', 'label']);
  });
});

describe('consent gates the upload', () => {
  it('uploads nothing at all without consent_research', async () => {
    const fetchImpl = ok();
    const p = await profileWith({ interests: ['gym'], consent_matching: true, consent_research: false });
    expect(await saveProfile(p, { env: ENV, fetchImpl })).toBe('no_consent');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uploads nothing when there is no social layer at all', async () => {
    const fetchImpl = ok();
    expect(await saveProfile(await profileWith(null), { env: ENV, fetchImpl })).toBe('no_consent');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does nothing when the database is not configured', async () => {
    const fetchImpl = ok();
    const p = await profileWith({ interests: [], consent_matching: false, consent_research: true });
    expect(await saveProfile(p, { env: {}, fetchImpl })).toBe('not_configured');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uploads once consent_research is given', async () => {
    const fetchImpl = ok();
    const p = await profileWith({ interests: [], consent_matching: false, consent_research: true });
    expect(await saveProfile(p, { env: ENV, fetchImpl })).toBe('saved');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe('what actually goes in the row', () => {
  it('drops interests unless consent_matching is also given', async () => {
    const p = await profileWith({
      interests: ['gym', 'golf'],
      contact_pref: 'open_to_offline',
      consent_matching: false,
      consent_research: true,
    });
    const row = buildRow(p);
    expect(row.social_layer).toEqual({ interests: [], consent_matching: false, consent_research: true });
    expect(JSON.stringify(row)).not.toContain('golf');
  });

  it('keeps interests when consent_matching is given', async () => {
    const social: SocialLayer = {
      interests: ['gym', 'golf'],
      contact_pref: 'open_to_offline',
      consent_matching: true,
      consent_research: true,
    };
    expect(buildRow(await profileWith(social)).social_layer).toEqual(social);
  });

  it('strips PII from open text before it leaves the browser', async () => {
    const p = await profileWith({ interests: [], consent_matching: false, consent_research: true });
    const row = buildRow(p);
    const q13 = row.responses.Q13 as { text: string };
    expect(q13.text).toContain('[AMOUNT]');
    expect(JSON.stringify(row)).not.toContain('120 萬');
  });

  it('carries no name, email or identifier of any kind', async () => {
    const p = await profileWith({ interests: [], consent_matching: false, consent_research: true });
    const keys = Object.keys(buildRow(p));
    for (const forbidden of ['name', 'email', 'user_id', 'ip']) expect(keys).not.toContain(forbidden);
  });

  it('records the analyzer and quality flags for later interpretation', async () => {
    const p = await profileWith({ interests: [], consent_matching: false, consent_research: true });
    const row = buildRow(p);
    expect(row.analyzer_used).toBe('rule_based');
    expect(Array.isArray(row.quality_flags)).toBe(true);
  });
});

describe('failure is never the respondent’s problem', () => {
  it('a rejected write resolves as failed instead of throwing', async () => {
    const failing = vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = await profileWith({ interests: [], consent_matching: false, consent_research: true });
    await expect(saveProfile(p, { env: ENV, fetchImpl: failing })).resolves.toBe('failed');
  });

  it('a network error resolves as failed instead of throwing', async () => {
    const offline = vi.fn(async () => {
      throw new Error('offline');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = await profileWith({ interests: [], consent_matching: false, consent_research: true });
    await expect(saveProfile(p, { env: ENV, fetchImpl: offline as unknown as typeof fetch })).resolves.toBe('failed');
  });
});
