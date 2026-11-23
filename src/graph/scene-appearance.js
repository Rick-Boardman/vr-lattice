// SPDX-License-Identifier: Apache-2.0

const sceneThemes = new WeakMap();

/** Register the native appearance source without storing non-scene data on a Three scene. */
export function bindGraphSceneAppearance(scene, getMode, subscribe) {
  const source = { getMode, subscribe };
  sceneThemes.set(scene, source);
  return () => {
    if (sceneThemes.get(scene) === source) sceneThemes.delete(scene);
  };
}

/** Find the theme of the native owning scene through any attached group hierarchy. */
export function findGraphSceneAppearance(parent) {
  for (let object = parent; object; object = object.parent) {
    const theme = sceneThemes.get(object);
    if (theme) return theme;
  }
  return null;
}
