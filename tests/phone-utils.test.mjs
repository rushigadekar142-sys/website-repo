import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWhatsAppNumber, buildWhatsAppUrl } from "../js/utils/phone.js";

test("adds the workspace country code to a 10-digit Indian number", () => {
  assert.equal(normalizeWhatsAppNumber("98765 43210", "91"), "919876543210");
});

test("does not duplicate an existing country code", () => {
  assert.equal(normalizeWhatsAppNumber("+91 98765 43210", "91"), "919876543210");
  assert.equal(normalizeWhatsAppNumber("919876543210", "91"), "919876543210");
});

test("converts a domestic trunk prefix to the workspace country code", () => {
  assert.equal(normalizeWhatsAppNumber("09876543210", "91"), "919876543210");
});

test("converts an international 00 prefix", () => {
  assert.equal(normalizeWhatsAppNumber("0091 98765 43210", "91"), "919876543210");
});

test("supports a different workspace country code", () => {
  assert.equal(normalizeWhatsAppNumber("2025550123", "1"), "12025550123");
});

test("preserves explicit international numbers", () => {
  assert.equal(normalizeWhatsAppNumber("+1 (202) 555-0123", "91"), "12025550123");
});

test("rejects empty and implausibly short values", () => {
  assert.equal(normalizeWhatsAppNumber("", "91"), null);
  assert.equal(normalizeWhatsAppNumber("12345", "91"), null);
});

test("builds a valid WhatsApp deep link and encodes the message", () => {
  assert.equal(
    buildWhatsAppUrl("919876543210", "Hello there & welcome"),
    "https://wa.me/919876543210?text=Hello%20there%20%26%20welcome"
  );
});

test("does not build links for invalid numbers", () => {
  assert.equal(buildWhatsAppUrl("12345"), null);
});
