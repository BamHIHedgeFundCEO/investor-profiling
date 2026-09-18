// Optional, consent-gated, non-blocking upload of a finished profile.
//
// Three rules, in priority order:
//   1. Nothing is uploaded without explicit consent. The intro page promises the
//      financial answers stay in the browser; that promise has to survive contact
//      with the data-collection feature, not be quietly amended by it.
//   2. Non-blocking. A failed write never delays or breaks the results page —
//      it is logged to the console and forgotten. The respondent's experience is
//      not hostage to our data collection.
//   3. PII is stripped from the open-text answers before they leave the browser,
//      exactly as it is before they go to the analyzer.
//
// Only the anon key is used, which is designed to be public; the table's RLS
// policy allows INSERT and nothing else (docs/supabase.sql).

import { stripPii } from '../analyzer/pii';
import type { ProfileRecord, Responses } from '../scoring/types';

export type SaveResult = 'saved' | 'no_consent' | 'not_configured' | 'failed';

export interface ProfileRow {
  schema_version: string;
  item_bank_version: string;
  responses: Responses;
  scoring_layer: ProfileRecord['scoring_layer'];
  presentation_layer: ProfileRecord['presentation_layer'];
  social_layer: ProfileRecord['social_layer'];
  quality_flags: string[];
  analyzer_used: string | null;
}

/** Pure: the exact row that would be sent. Exported so a test can inspect it. */
export function buildRow(profile: ProfileRecord): ProfileRow {
  const responses: Responses = {};
  for (const [id, r] of Object.entries(profile.responses)) {
    responses[id] = 'text' in r ? { ...r, text: stripPii(r.text) } : r;
  }
  const social = profile.social_layer;
  return {
    schema_version: profile.schema_version,
    item_bank_version: profile.item_bank_version,
    responses,
    scoring_layer: profile.scoring_layer,
    presentation_layer: profile.presentation_layer,
    // Interests and contact preference are for matching. Without that consent they
    // are not stored at all — not stored empty, not stored: the consent flags alone
    // are kept so the record still says why.
    social_layer:
      social && social.consent_matching
        ? social
        : social
          ? { interests: [], consent_matching: false, consent_research: social.consent_research }
          : null,
    quality_flags: profile.scoring_layer.flags,
    analyzer_used: profile.scoring_layer.text_analysis?.analyzer ?? null,
  };
}

interface Env {
  url?: string;
  key?: string;
}

function env(): Env {
  const e = (import.meta.env ?? {}) as Record<string, string | undefined>;
  return { url: e.VITE_SUPABASE_URL, key: e.VITE_SUPABASE_ANON_KEY };
}

/**
 * Fire-and-forget. Resolves with what happened; never throws, never blocks the UI.
 */
export async function saveProfile(
  profile: ProfileRecord,
  deps: { env?: Env; fetchImpl?: typeof fetch } = {},
): Promise<SaveResult> {
  if (!profile.social_layer?.consent_research) return 'no_consent';

  const { url, key } = deps.env ?? env();
  if (!url || !key) return 'not_configured';

  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${url.replace(/\/$/, '')}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: key,
        authorization: `Bearer ${key}`,
        prefer: 'return=minimal',
      },
      body: JSON.stringify(buildRow(profile)),
    });
    if (!res.ok) throw new Error(`supabase ${res.status}`);
    return 'saved';
  } catch (e) {
    // Console only. The respondent already has their result and owes us nothing.
    console.warn('[persistence] profile not saved:', (e as Error).message);
    return 'failed';
  }
}
