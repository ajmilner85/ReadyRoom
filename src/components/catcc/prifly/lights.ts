/** Lights panels: PriFly's (modelled on the DCS lights panel) and the Bridge's. key, label, settings, default. */
import type { LightSetting } from '../../../catcc/core/room/ops.ts';

export type LightItem = [string, string, LightSetting[], LightSetting];

const L3: LightSetting[] = ['ON', 'OFF', 'AUTO'];
const LCAT: LightSetting[] = ['GREEN', 'RED', 'OFF', 'AUTO'];

/** PriFly's lights, modelled on the DCS lights panel. Navigation and room lights are the Bridge's. */
export const PRIFLY_LIGHTS: LightItem[] = [
  ['semaphore', 'Semaphore', ['VIOLET', 'YELLOW', 'GREEN', 'RED', 'OFF', 'AUTO'], 'AUTO'],
  ['deck', 'Deck lights 1–5', L3, 'ON'],
  ['catzone', 'Cat 1, 2 zone lights', L3, 'AUTO'],
  ['rear', 'Rear deck lights', L3, 'ON'],
  ['board', 'Board number', L3, 'OFF'],
  ['below', 'Below deck lights', L3, 'AUTO'],
  ['landing', 'Landing lights', L3, 'ON'],
  ['cat1', 'Cat 1 light', LCAT, 'RED'],
  ['cat2', 'Cat 2 light', LCAT, 'AUTO'],
  ['cat34', 'Cat 3 / 4 lights', LCAT, 'OFF'],
];
export const BRIDGE_LIGHTS: LightItem[] = [
  ['nav1', 'Navigation lights 1', L3, 'AUTO'],
  ['nav2', 'Navigation lights 2', L3, 'AUTO'],
  ['room', 'Bridge / room lights', ['ON', 'NIGHT', 'OFF'], 'NIGHT'],
];

