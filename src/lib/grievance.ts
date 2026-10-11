// Shared constants and types used by both the client UI and the /api/draft route.

export const COMPLAINT_MIN_CHARS = 30;
export const COMPLAINT_MAX_CHARS = 4000;
export const LOCATION_MAX_CHARS = 120;

export const OUTPUT_LANGUAGES = [
  { value: "same", label: "Same as my complaint" },
  { value: "english", label: "English" },
  { value: "hindi", label: "हिन्दी · Hindi" },
  { value: "bengali", label: "বাংলা · Bengali" },
  { value: "tamil", label: "தமிழ் · Tamil" },
] as const;

export type OutputLanguage = (typeof OUTPUT_LANGUAGES)[number]["value"];

export const CATEGORIES = [
  "Water supply",
  "Electricity",
  "Roads & potholes",
  "Garbage & sanitation",
  "Drainage & sewage",
  "Streetlights",
  "Public health & hospitals",
  "Public transport",
  "Police & public safety",
  "Ration / PDS",
  "Pension & welfare schemes",
  "Education & schools",
  "Land & revenue records",
  "Municipal services",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface DraftRequest {
  complaint: string;
  location?: string;
  category?: string;
  language?: OutputLanguage;
}

export interface GrievanceDraft {
  subject: string;
  suggested_recipient: string;
  recipient_rationale: string;
  summary: string;
  formal_draft: string;
  key_facts: string[];
  missing_information: string[];
  evidence_checklist: string[];
  next_steps: string[];
  output_language: string;
}

export interface DraftErrorBody {
  error: string;
}

export function isOutputLanguage(value: unknown): value is OutputLanguage {
  return OUTPUT_LANGUAGES.some((l) => l.value === value);
}

export function isCategory(value: unknown): value is Category {
  return CATEGORIES.some((c) => c === value);
}
