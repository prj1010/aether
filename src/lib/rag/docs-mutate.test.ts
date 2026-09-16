import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDocumentToEngine,
  getEngineDocument,
  removeDocumentFromEngine,
  resetEngine,
  updateDocumentInEngine,
} from "./engine.ts";

test("updateDocumentInEngine reindexes and bumps version", () => {
  resetEngine();
  const added = addDocumentToEngine({
    title: "Travel addendum",
    filename: "travel.txt",
    collection: "policy",
    text: "## Flights\nEconomy only.\n",
  });
  const updated = updateDocumentInEngine({
    id: added.document.id,
    title: "Travel addendum",
    collection: "policy",
    text: "## Flights\nPremium economy over six hours.\n",
  });
  assert.equal(updated.document.version, added.document.version + 1);
  const found = getEngineDocument(added.document.id);
  assert.ok(found);
  assert.match(found!.document.content, /Premium economy/);
  assert.ok(found!.chunks.length >= 1);
});

test("removeDocumentFromEngine drops the document and chunks", () => {
  resetEngine();
  const added = addDocumentToEngine({
    title: "Temp note",
    filename: "temp.txt",
    collection: "operations",
    text: "## Note\nDelete me.\n",
  });
  const removed = removeDocumentFromEngine(added.document.id);
  assert.equal(removed.id, added.document.id);
  assert.equal(getEngineDocument(added.document.id), null);
});
