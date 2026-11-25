/**
 * Phone helpers used by CRM communication actions.
 * Workspace country code can be stored as defaultCountryCode or countryCode.
 * E.164 digits only are returned for the WhatsApp wa.me endpoint.
 */
export function normalizeWhatsAppNumber(value, defaultCountryCode = "91") {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const hasInternationalPrefix = raw.startsWith("+") || /^00/.test(raw);
  let digits = raw.replace(/\D/g, "");
  const countryCode = String(defaultCountryCode || "91").replace(/\D/g, "");

  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);

  if (hasInternationalPrefix) {
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }

  if (digits.length === 10) {
    if (!countryCode || countryCode.length > 3) return null;
    digits = countryCode + digits;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    if (!countryCode || countryCode.length > 3) return null;
    digits = countryCode + digits.slice(1);
  }

  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function buildWhatsAppUrl(value, message = "") {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  const base = "https://wa.me/" + digits;
  return message ? base + "?text=" + encodeURIComponent(String(message)) : base;
}
