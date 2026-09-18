// Loads and validates the JSON data once. Scoring functions take this data as
// arguments, so scripts can pass perturbed copies instead.

import itemBankJson from '../../data/item_bank.json';
import weightsJson from '../../data/weights.json';
import guardrailsJson from '../../data/guardrails.json';
import type { GuardrailConfig, ItemBank, Weights } from './types';
import { validateConfig, validateItemBank } from './validate';

export const itemBank = itemBankJson as unknown as ItemBank;
export const weights = weightsJson as unknown as Weights;
export const guardrails = guardrailsJson as unknown as GuardrailConfig;

validateItemBank(itemBank);
validateConfig(itemBank, weights, guardrails);
