import type { Scenario } from '../types';
import { accountSecurityScenario } from './accountSecurity';
import { amazonOrderScenario } from './amazonOrder';
import { ssaSuspensionScenario } from './ssaSuspension';

/** Real-recording scenarios first, then fully scripted ones. */
export const scenarios: Scenario[] = [amazonOrderScenario, ssaSuspensionScenario, accountSecurityScenario];

export function getScenario(id: string): Scenario | undefined {
  return scenarios.find((s) => s.id === id);
}
