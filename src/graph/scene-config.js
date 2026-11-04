// SPDX-License-Identifier: Apache-2.0
// Shared scene configuration for graph-scene entrypoints.
//
// Goal: keep “policy” (pulse rules, tunables) out of per-scene logic.
// This is intentionally small and pragmatic (not the full future GraphSceneConfig schema).

import { NETWORK_PULSE_DEFAULTS } from "../network-pulse-policy.js";

/**
 * Purpose: Build a graph-scene pulse policy object by overlaying caller-provided values onto the shared network-pulse defaults.
 * @param {object} [options] Pulse configuration overrides.
 * @param {number} [options.color=NETWORK_PULSE_DEFAULTS.color] Pulse color applied to highlighted edges.
 * @param {number} [options.maxPulses=NETWORK_PULSE_DEFAULTS.maxPulses] Maximum simultaneous pulses.
 * @param {number} [options.pulsesPerEdge=NETWORK_PULSE_DEFAULTS.pulsesPerEdge] Maximum pulses allowed on a single edge.
 * @param {number} [options.pulseRadius=NETWORK_PULSE_DEFAULTS.pulseRadius] Radius of each rendered pulse.
 * @param {number} [options.speed=NETWORK_PULSE_DEFAULTS.speed] Pulse travel speed.
 * @param {number} [options.dimOpacity=NETWORK_PULSE_DEFAULTS.dimOpacity] Base opacity for non-highlighted edge segments.
 * @param {number} [options.brightOpacity=NETWORK_PULSE_DEFAULTS.brightOpacity] Peak opacity used while a pulse passes over an edge.
 * @param {string[] | null} [options.edgeKinds=null] Optional allowlist of edge kinds that may pulse.
 * @returns {{ color: number, maxPulses: number, pulsesPerEdge: number, pulseRadius: number, speed: number, dimOpacity: number, brightOpacity: number, edgeKinds: string[] | null }} Pulse policy object for graph scenes.
 * Side effects: clones the provided edge-kind allowlist when present so callers can mutate their original array independently.
 */
export function makePulseConfig({
  color = NETWORK_PULSE_DEFAULTS.color,
  maxPulses = NETWORK_PULSE_DEFAULTS.maxPulses,
  pulsesPerEdge = NETWORK_PULSE_DEFAULTS.pulsesPerEdge,
  pulseRadius = NETWORK_PULSE_DEFAULTS.pulseRadius,
  speed = NETWORK_PULSE_DEFAULTS.speed,
  dimOpacity = NETWORK_PULSE_DEFAULTS.dimOpacity,
  brightOpacity = NETWORK_PULSE_DEFAULTS.brightOpacity,
  edgeKinds = null,
} = {}) {
  return {
    color,
    maxPulses,
    pulsesPerEdge,
    pulseRadius,
    speed,
    dimOpacity,
    brightOpacity,
    edgeKinds: Array.isArray(edgeKinds) ? edgeKinds.slice() : null,
  };
}

/**
 * Purpose: Test whether a graph edge kind is allowed by a graph-scene pulse policy.
 * @param {{ edgeKinds?: string[] | null } | null | undefined} pulseConfig Pulse policy returned by makePulseConfig.
 * @param {string} kind Edge kind to test.
 * @returns {boolean} `true` when the edge kind is allowed to pulse.
 * Side effects: none; pure policy helper.
 */
export function isPulseableEdgeKind(pulseConfig, kind) {
  const k = String(kind || "");
  const allow = pulseConfig?.edgeKinds;
  if (!Array.isArray(allow) || allow.length === 0) return true;
  return allow.includes(k);
}

/**
 * Purpose: Export the canonical pulse policy used by the application-network graph scene.
 * Return value: scene-config object whose `pulse` property allows only the edge kinds relevant to the application-network harness.
 * Side effects: none; constant export.
 */
export const APPLICATION_NETWORK_SCENE_CONFIG = {
  pulse: makePulseConfig({
    edgeKinds: ["APP_CALLS_APP", "APP_USES_SERVER", "SERVER_HOSTS_DATABASE", "APP_USES_FILESHARE", "SERVER_HOSTS_SHARE"],
  }),
};

/**
 * Purpose: Export the canonical pulse policy used by the people-network graph scene.
 * Return value: scene-config object whose `pulse` property pulses every edge kind by default.
 * Side effects: none; constant export.
 */
export const PEOPLE_NETWORK_SCENE_CONFIG = {
  // People network edges are already a derived/filtered set; pulse everything by default.
  pulse: makePulseConfig(),
};
