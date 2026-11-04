// SPDX-License-Identifier: Apache-2.0
const GRAPH_DOCUMENT_HOTBAR_PRIMARY_COMMANDS = Object.freeze({
  workflow: Object.freeze({
    new: "open-document-hub",
    load: "toggle-load",
    save: "save-workflow",
  }),
  planning: Object.freeze({
    new: "open-document-hub",
    load: "toggle-load",
    save: "save-planning-graph",
  }),
});

/**
 * Purpose: Resolve the shared command ids for the primary graph-document hotbar slots so graph apps can keep New/Load/Save semantics consistent across workflow and planning modes.
 * @param {object} [options={}] Primary-slot command options.
 * @param {boolean} [options.planningMode=false] Whether the app is currently operating on a planning graph instead of a workflow document.
 * @param {{ workflow?: { new?: string, load?: string, save?: string }, planning?: { new?: string, load?: string, save?: string } }} [options.commandSets] Optional command id overrides for workflow and planning modes.
 * @returns {{ new: string, load: string, save: string }} Canonical command ids for the New, Load, and Save hotbar slots in the active graph-document mode.
 * Side effects: none.
 */
export function resolveGraphDocumentHotbarPrimaryCommands({
  planningMode = false,
  commandSets = GRAPH_DOCUMENT_HOTBAR_PRIMARY_COMMANDS,
} = {}) {
  const workflow = commandSets?.workflow ?? GRAPH_DOCUMENT_HOTBAR_PRIMARY_COMMANDS.workflow;
  const planning = commandSets?.planning ?? GRAPH_DOCUMENT_HOTBAR_PRIMARY_COMMANDS.planning;
  const base = planningMode ? planning : workflow;
  return {
    new: String(base?.new ?? GRAPH_DOCUMENT_HOTBAR_PRIMARY_COMMANDS.workflow.new),
    load: String(base?.load ?? GRAPH_DOCUMENT_HOTBAR_PRIMARY_COMMANDS.workflow.load),
    save: String(base?.save ?? GRAPH_DOCUMENT_HOTBAR_PRIMARY_COMMANDS.workflow.save),
  };
}

/**
 * Purpose: Resolve the shared New/Load/Save hotbar slot metadata so graph apps can present the same primary-document actions and tooltips through the runtime hotbar.
 * @param {object} [options={}] Primary-slot presentation options.
 * @param {boolean} [options.planningMode=false] Whether the app is currently operating on a planning graph instead of a workflow document.
 * @param {boolean} [options.loadOpen=false] Whether the workflow load surface is open.
 * @param {boolean} [options.dirty=false] Whether the active workflow document has unsaved changes.
 * @param {{ workflow?: { new?: string, load?: string, save?: string }, planning?: { new?: string, load?: string, save?: string } }} [options.commandSets] Optional command id overrides for workflow and planning modes.
 * @returns {{ newItem: { command: string, tooltip: string, active: boolean }, loadItem: { command: string, tooltip: string, active: boolean }, saveItem: { command: string, tooltip: string, active: boolean } }} Shared primary-slot descriptors for the graph hotbar.
 * Side effects: none.
 */
export function resolveGraphDocumentHotbarPrimaryItems({
  planningMode = false,
  loadOpen = false,
  dirty = false,
  commandSets = GRAPH_DOCUMENT_HOTBAR_PRIMARY_COMMANDS,
} = {}) {
  const commands = resolveGraphDocumentHotbarPrimaryCommands({ planningMode, commandSets });
  return {
    newItem: {
      command: commands.new,
      tooltip: "Open document hub",
      active: false,
    },
    loadItem: {
      command: commands.load,
      tooltip: loadOpen ? "Close document hub" : "Open document hub",
      active: loadOpen,
    },
    saveItem: {
      command: commands.save,
      tooltip: planningMode
        ? "Save current planning graph"
        : (dirty ? "Save unsaved workflow changes" : "Save current version"),
      active: planningMode ? false : dirty,
    },
  };
}
