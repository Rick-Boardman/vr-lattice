// SPDX-License-Identifier: Apache-2.0
/**
 * Purpose: Defines the canonical pulse effect configuration used by shared graph scenes when callers do not supply overrides.
 * Parameters: none.
 * Return value: Frozen config object with color, pulse-count, radius, speed, and opacity defaults for edge pulse rendering.
 * Side effects: none.
 * @type {{
 *   color: number,
 *   maxPulses: number,
 *   pulsesPerEdge: number,
 *   pulseRadius: number,
 *   speed: number,
 *   dimOpacity: number,
 *   brightOpacity: number,
 * }}
 */
export const NETWORK_PULSE_DEFAULTS = Object.freeze({
  color: 0x9ec2ff,
  maxPulses: 180,
  pulsesPerEdge: 3,
  pulseRadius: 0.18,
  speed: 0.55,
  dimOpacity: 0.14,
  brightOpacity: 0.98,
})
