import assert from "node:assert/strict";
import test from "node:test";
import { bindGraphSceneAppearance, findGraphSceneAppearance } from "../src/graph/scene-appearance.js";

test("graph content inherits the nearest scene appearance and unsubscribes cleanly", () => {
  const scene = {};
  const content = { parent: { parent: scene } };
  const subscriptions = new Set();
  let mode = "light";
  const unbind = bindGraphSceneAppearance(scene, () => mode, handler => {
    subscriptions.add(handler);
    return () => subscriptions.delete(handler);
  });
  const inherited = findGraphSceneAppearance(content);
  assert.equal(inherited.getMode(), "light");
  const changes = [];
  const unsubscribe = inherited.subscribe(({ key }) => changes.push(key));
  mode = "dark";
  for (const notify of subscriptions) notify({ key: mode });
  assert.deepEqual(changes, ["dark"]);
  unsubscribe();
  assert.equal(subscriptions.size, 0);
  unbind();
  assert.equal(findGraphSceneAppearance(content), null);
});
