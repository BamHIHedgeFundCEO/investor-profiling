import { expectTypeOf, test } from 'vitest';
import { compose } from '../src/lib/scoring/compose';
import type { ComposeInput, PresentationLayer } from '../src/lib/scoring/types';

declare const base: ComposeInput;
declare const presentation: PresentationLayer;

test('compose() cannot receive presentation data', () => {
  // @ts-expect-error presentation_layer is typed `never`
  compose({ ...base, presentation_layer: presentation });
  // @ts-expect-error mbti is typed `never`
  compose({ ...base, mbti: 'INTJ' });
  // @ts-expect-error tone is typed `never`
  compose({ ...base, tone: 'analytical' });

  const withExtra = { ...base, presentation_layer: presentation };
  // @ts-expect-error also rejected when passed through a variable
  compose(withExtra);

  expectTypeOf<ComposeInput['presentation_layer']>().toEqualTypeOf<undefined>();
});
