const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}$/i;
const BLOCKED_EMAIL_LOCALS = new Set(["email", "mail", "test", "demo", "sample", "none", "na", "n/a"]);
const BLOCKED_EMAIL_DOMAINS = new Set([
  "example.com",
  "test.com",
  "domain.com",
  "email.com",
  "yourdomain.com",
  "gmail.con",
  "yahoo.con",
  "hotmail.con",
]);
const OBVIOUS_FAKE_PHONE_SEQUENCES = new Set([
  "0000000000",
  "1111111111",
  "1234567890",
  "0123456789",
  "9876543210",
]);

export function normalizeEmail(value: string | null | undefined) {
  if (!value) return null;

  const cleaned = value.trim().replace(/[.,;:!?]+$/, "").toLowerCase();
  if (!cleaned || cleaned.length > 254 || !EMAIL_PATTERN.test(cleaned)) return null;

  const [localPart, domain] = cleaned.split("@");
  if (!localPart || !domain) return null;
  if (localPart.startsWith(".") || localPart.endsWith(".")) return null;
  if (localPart.includes("..") || domain.includes("..")) return null;
  if (BLOCKED_EMAIL_LOCALS.has(localPart)) return null;
  if (BLOCKED_EMAIL_DOMAINS.has(domain)) return null;
  if (!domain.includes(".")) return null;

  const tld = domain.split(".").pop() ?? "";
  if (tld.length < 2) return null;

  return cleaned;
}

function isLikelyFakeDigits(digits: string) {
  if (digits.length < 10) return true;
  if (/^(\d)\1+$/.test(digits)) return true;
  if (OBVIOUS_FAKE_PHONE_SEQUENCES.has(digits.slice(-10))) return true;
  return false;
}

export function normalizePhone(value: string | null | undefined) {
  if (!value) return null;

  const compact = value.trim().replace(/(ext|x)\s*\d+$/i, "");
  const hasPlusPrefix = compact.startsWith("+");
  const digits = compact.replace(/\D/g, "");

  if (digits.length < 10 || digits.length > 15) return null;
  if (isLikelyFakeDigits(digits)) return null;

  if (digits.length === 10) {
    if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
    return digits;
  }

  if (digits.length === 12 && digits.startsWith("91")) {
    const nationalNumber = digits.slice(2);
    if (!/^[6-9]\d{9}$/.test(nationalNumber)) return null;
    return `+${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return hasPlusPrefix ? `+${digits}` : `+${digits}`;
}

export function sanitizeLeadContact<T extends { visitor_email?: string | null; visitor_phone?: string | null }>(lead: T) {
  return {
    ...lead,
    visitor_email: normalizeEmail(lead.visitor_email),
    visitor_phone: normalizePhone(lead.visitor_phone),
  };
}
