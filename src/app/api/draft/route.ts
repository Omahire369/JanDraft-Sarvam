import {
  COMPLAINT_MAX_CHARS,
  COMPLAINT_MIN_CHARS,
  LOCATION_MAX_CHARS,
  isCategory,
  isOutputLanguage,
  type DraftErrorBody,
  type GrievanceDraft,
} from "@/lib/grievance";
import { DraftError, generateGrievanceDraft } from "@/lib/sarvam";

// Allow time for one retry on a transient upstream failure.
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

function errorResponse(message: string, status: number) {
  return Response.json({ error: message } satisfies DraftErrorBody, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 32_000) {
    return errorResponse("Request is too large.", 413);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse("Request body must be valid JSON.", 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return errorResponse("Request body must be a JSON object.", 400);
  }

  const body = payload as Record<string, unknown>;

  if (typeof body.complaint !== "string") {
    return errorResponse("Please describe your complaint.", 400);
  }
  const complaint = body.complaint.replace(/\r\n/g, "\n").trim();
  if (complaint.length < COMPLAINT_MIN_CHARS) {
    return errorResponse(
      `Please describe your complaint in a little more detail (at least ${COMPLAINT_MIN_CHARS} characters).`,
      400,
    );
  }
  if (complaint.length > COMPLAINT_MAX_CHARS) {
    return errorResponse(`Your complaint is too long. Please keep it under ${COMPLAINT_MAX_CHARS} characters.`, 400);
  }

  let location: string | undefined;
  if (body.location !== undefined && body.location !== null && body.location !== "") {
    if (typeof body.location !== "string") return errorResponse("Location must be text.", 400);
    location = body.location.replace(/\s+/g, " ").trim();
    if (location.length > LOCATION_MAX_CHARS) {
      return errorResponse(`Location must be under ${LOCATION_MAX_CHARS} characters.`, 400);
    }
    if (!location) location = undefined;
  }

  let category: string | undefined;
  if (body.category !== undefined && body.category !== null && body.category !== "") {
    if (!isCategory(body.category)) return errorResponse("Please choose a valid complaint category.", 400);
    category = body.category;
  }

  const language = body.language ?? "same";
  if (!isOutputLanguage(language)) {
    return errorResponse("Please choose a supported output language.", 400);
  }

  try {
    const draft: GrievanceDraft = await generateGrievanceDraft({ complaint, location, category, language });
    return Response.json(draft, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof DraftError) {
      return errorResponse(err.message, err.status);
    }
    console.error("[api/draft] Unexpected error", err instanceof Error ? err.name : typeof err);
    return errorResponse("Something went wrong while drafting. Please try again.", 500);
  }
}
