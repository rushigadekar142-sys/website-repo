import test from "node:test";
import assert from "node:assert/strict";
import { safeExternalUrl } from "../js/utils/safe-url.js";

test("allows HTTPS URLs and canonicalizes them", () => {
  assert.equal(safeExternalUrl("https://example.com/path"), "https://example.com/path");
});
test("allows HTTP URLs", () => {
  assert.equal(safeExternalUrl("http://example.com"), "http://example.com/");
});
test("rejects javascript and data URLs", () => {
  assert.equal(safeExternalUrl("javascript:alert(1)"), "");
  assert.equal(safeExternalUrl("data:text/html,hello"), "");
});
test("rejects relative URLs and malformed values", () => {
  assert.equal(safeExternalUrl("/account"), "");
  assert.equal(safeExternalUrl("not a url"), "");
});
test("rejects URLs containing credentials", () => {
  assert.equal(safeExternalUrl("https://user:pass@example.com"), "");
});
test("handles empty and non-string values", () => {
  assert.equal(safeExternalUrl("  "), "");
  assert.equal(safeExternalUrl(null), "");
});
