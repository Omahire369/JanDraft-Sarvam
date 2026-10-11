"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type FormEvent, type ReactNode } from "react";
import {
  CATEGORIES,
  COMPLAINT_MAX_CHARS,
  COMPLAINT_MIN_CHARS,
  LOCATION_MAX_CHARS,
  OUTPUT_LANGUAGES,
  type GrievanceDraft,
  type OutputLanguage,
} from "@/lib/grievance";

const SAMPLES: Array<{ complaint: string; location: string; category: string; language: OutputLanguage }> = [
  {
    complaint:
      "The water supply in our lane (Gali No. 4) has been very irregular for the last three weeks. Water comes for only about 20 minutes every two days, and it is often muddy and smells bad. Several children and elderly people in our lane have had stomach problems. We told the local lineman twice but nothing has changed. Most families are now buying water cans, which costs each household around ₹600 a month. We want regular, clean water supply restored and the pipeline checked for leakage or contamination.",
    location: "Shastri Nagar, Jaipur, Rajasthan",
    category: "Water supply",
    language: "english",
  },
  {
    complaint:
      "हमारे मोहल्ले की गली नंबर 3 में पिछले दो महीने से तीन स्ट्रीट लाइटें खराब हैं। रात में पूरी सड़क पर अंधेरा रहता है और पिछले हफ्ते एक बुज़ुर्ग व्यक्ति गड्ढे में गिरकर घायल हो गए। महिलाओं और बच्चों को शाम के बाद बाहर निकलने में डर लगता है। हमने वार्ड पार्षद के कार्यालय में मौखिक रूप से बताया था, लेकिन अब तक कोई कार्रवाई नहीं हुई। कृपया लाइटें जल्द ठीक करवाई जाएँ और गड्ढा भरवाया जाए।",
    location: "Ward 12, Lucknow, Uttar Pradesh",
    category: "Streetlights",
    language: "same",
  },
  {
    complaint:
      "Hamare area me pichle 10 din se garbage collection nahi ho raha. Main road ke corner pe kachre ka dher lag gaya hai, bahut badboo aa rahi hai aur kutte sab jagah kachra faila dete hain. Paas me ek primary school hai, bacche usi raste se jaate hain. Safai karamchari se poocha to bole gaadi kharab hai. Please jaldi se kachra uthwaya jaye aur regular collection shuru ho.",
    location: "Salt Lake Sector V, Kolkata, West Bengal",
    category: "Garbage & sanitation",
    language: "bengali",
  },
];

const LOADING_STEPS = [
  "Reading your complaint",
  "Separating stated facts from missing details",
  "Identifying the office likely responsible",
  "Writing the formal draft",
  "Running final checks",
];

type Status = "idle" | "loading" | "success" | "error";

export default function JanDraftApp() {
  const [complaint, setComplaint] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");
  const [language, setLanguage] = useState<OutputLanguage>("same");

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<GrievanceDraft | null>(null);
  const [draftText, setDraftText] = useState("");
  const [checkedEvidence, setCheckedEvidence] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const [sampleIndex, setSampleIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const complaintRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (status !== "loading") return;
    const started = Date.now();
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => window.clearInterval(id);
  }, [status]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Grow the draft editor to fit its content so the whole letter is readable without inner scrolling.
  useLayoutEffect(() => {
    const el = draftRef.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + 2}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [draftText, status]);

  const trimmedLength = complaint.trim().length;
  const overLimit = complaint.length > COMPLAINT_MAX_CHARS;
  const isLoading = status === "loading";
  const loadingStep = Math.min(Math.floor(elapsed / 3), LOADING_STEPS.length - 1);
  const placeholderCount = (draftText.match(/\[[^\]\n]{2,}\]/g) ?? []).length;

  function scrollToResultsOnMobile() {
    if (window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (isLoading) return;

    if (trimmedLength < COMPLAINT_MIN_CHARS) {
      setFormError(`Please describe the problem in a bit more detail (at least ${COMPLAINT_MIN_CHARS} characters).`);
      complaintRef.current?.focus();
      return;
    }
    if (overLimit) {
      setFormError(`Please shorten your complaint to ${COMPLAINT_MAX_CHARS.toLocaleString("en-IN")} characters or fewer.`);
      complaintRef.current?.focus();
      return;
    }
    setFormError(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("loading");
    setElapsed(0);
    setError(null);
    setResult(null);
    setCopied(false);
    scrollToResultsOnMobile();

    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          complaint: complaint.trim(),
          location: location.trim() || undefined,
          category: category || undefined,
          language,
        }),
        signal: controller.signal,
      });

      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        // handled below
      }

      if (!res.ok) {
        const message =
          data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : res.status === 504
              ? "The request timed out. Please try again."
              : `Something went wrong (HTTP ${res.status}). Please try again.`;
        throw new Error(message);
      }
      if (!data || typeof data !== "object" || !("formal_draft" in data)) {
        throw new Error("The server returned an unexpected response. Please try again.");
      }

      const draft = data as GrievanceDraft;
      setResult(draft);
      setDraftText(draft.formal_draft);
      setCheckedEvidence(new Set());
      setStatus("success");
      scrollToResultsOnMobile();
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(
        err instanceof TypeError
          ? "Network error — please check your internet connection and try again."
          : err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.",
      );
      setStatus("error");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function handleSample() {
    const sample = SAMPLES[sampleIndex % SAMPLES.length];
    setComplaint(sample.complaint);
    setLocation(sample.location);
    setCategory(sample.category);
    setLanguage(sample.language);
    setSampleIndex((i) => i + 1);
    setFormError(null);
  }

  function handleReset() {
    abortRef.current?.abort();
    abortRef.current = null;
    setComplaint("");
    setLocation("");
    setCategory("");
    setLanguage("same");
    setStatus("idle");
    setError(null);
    setFormError(null);
    setResult(null);
    setDraftText("");
    setCheckedEvidence(new Set());
    setCopied(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    complaintRef.current?.focus();
  }

  async function handleCopy() {
    const text = draftText;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    const blob = new Blob([draftText.replace(/\n/g, "\r\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jandraft-grievance-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function toggleEvidence(index: number) {
    setCheckedEvidence((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75 sticky top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white" aria-hidden>
              <PenIcon className="h-4 w-4" />
            </span>
            <span className="font-serif text-xl font-semibold tracking-tight">JanDraft</span>
          </div>
          <span className="hidden rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-500 sm:inline-block">
            Independent drafting tool · Not a government service
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
        <section className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-accent">Citizen grievance drafting</p>
          <h1 className="mt-3 font-serif text-3xl font-semibold leading-tight tracking-tight text-ink-900 sm:text-[2.6rem] sm:leading-[1.15]">
            Turn your complaint into a clear, formal grievance.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-ink-700 sm:text-lg">
            Describe the problem in your own words: English, Hindi, Bengali, Tamil, or a mix. JanDraft organises
            your facts, points out what&apos;s missing, and drafts a respectful letter for you to review, edit and
            submit yourself.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2 text-sm text-ink-700">
            <TrustChip icon={<ShieldIcon className="h-3.5 w-3.5" />}>Uses only the facts you give</TrustChip>
            <TrustChip icon={<SendOffIcon className="h-3.5 w-3.5" />}>Nothing is submitted for you</TrustChip>
            <TrustChip icon={<LockIcon className="h-3.5 w-3.5" />}>Complaints are not stored</TrustChip>
          </ul>
        </section>

        <div className="mt-10 grid gap-8 lg:grid-cols-12 lg:gap-10">
          {/* Input card */}
          <section className="lg:col-span-5">
            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(23,32,51,0.04),0_8px_24px_-12px_rgba(23,32,51,0.10)] sm:p-6 lg:sticky lg:top-24"
              noValidate
            >
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="complaint" className="text-sm font-semibold text-ink-900">
                  Your complaint <span className="text-danger">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleSample}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
                >
                  <SparkIcon className="h-3.5 w-3.5" />
                  {sampleIndex === 0 ? "Try a sample" : "Another sample"}
                </button>
              </div>
              <p id="complaint-hint" className="mt-1 text-sm text-ink-500">
                What happened, where, since when, who is affected, and what you&apos;ve already tried.
              </p>
              <textarea
                id="complaint"
                ref={complaintRef}
                value={complaint}
                onChange={(e) => {
                  setComplaint(e.target.value);
                  if (formError) setFormError(null);
                }}
                rows={10}
                maxLength={COMPLAINT_MAX_CHARS + 500}
                aria-describedby="complaint-hint complaint-count"
                aria-invalid={Boolean(formError) || overLimit}
                placeholder="Example: The streetlights on our road have not worked for two months. It is completely dark at night and an elderly neighbour fell into a pothole last week. We informed the ward office verbally but nothing has been done…"
                className="mt-3 block w-full resize-y rounded-xl border border-line-strong bg-paper/40 px-3.5 py-3 text-[15px] leading-relaxed text-ink-900 placeholder:text-ink-300 focus:border-accent focus:bg-surface focus:outline-none focus:ring-4 focus:ring-accent/10 aria-[invalid=true]:border-danger"
              />
              <div id="complaint-count" className="mt-1.5 flex justify-end text-xs tabular-nums">
                <span className={overLimit ? "font-medium text-danger" : "text-ink-500"}>
                  {complaint.length.toLocaleString("en-IN")} / {COMPLAINT_MAX_CHARS.toLocaleString("en-IN")}
                </span>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <div>
                  <label htmlFor="location" className="text-sm font-semibold text-ink-900">
                    District / location <span className="font-normal text-ink-500">(optional)</span>
                  </label>
                  <input
                    id="location"
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    maxLength={LOCATION_MAX_CHARS}
                    placeholder="e.g. Ward 12, Lucknow, UP"
                    autoComplete="address-level2"
                    className="mt-2 block w-full rounded-xl border border-line-strong bg-paper/40 px-3.5 py-2.5 text-[15px] text-ink-900 placeholder:text-ink-300 focus:border-accent focus:bg-surface focus:outline-none focus:ring-4 focus:ring-accent/10"
                  />
                </div>
                <div>
                  <label htmlFor="category" className="text-sm font-semibold text-ink-900">
                    Category <span className="font-normal text-ink-500">(optional)</span>
                  </label>
                  <div className="relative mt-2">
                    <select
                      id="category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="block w-full appearance-none rounded-xl border border-line-strong bg-paper/40 py-2.5 pl-3.5 pr-9 text-[15px] text-ink-900 focus:border-accent focus:bg-surface focus:outline-none focus:ring-4 focus:ring-accent/10"
                    >
                      <option value="">Let JanDraft infer</option>
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <ChevronIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                  </div>
                </div>
              </div>

              <fieldset className="mt-5">
                <legend className="text-sm font-semibold text-ink-900">Output language</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {OUTPUT_LANGUAGES.map((l) => (
                    <label
                      key={l.value}
                      className="cursor-pointer rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-sm text-ink-700 transition-colors hover:border-ink-300 has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:font-medium has-[:checked]:text-accent-strong has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-accent/15"
                    >
                      <input
                        type="radio"
                        name="language"
                        value={l.value}
                        checked={language === l.value}
                        onChange={() => setLanguage(l.value)}
                        className="sr-only"
                      />
                      {l.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              {formError && (
                <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger">
                  <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  {formError}
                </p>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isLoading ? (
                    <>
                      <Spinner className="h-4 w-4" />
                      Drafting…
                    </>
                  ) : (
                    <>
                      Generate Draft
                      <ArrowIcon className="h-4 w-4" />
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-surface px-4 py-3 text-[15px] font-medium text-ink-700 transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <ResetIcon className="h-4 w-4" />
                  Reset
                </button>
              </div>

              <p className="mt-4 text-xs leading-relaxed text-ink-500">
                Your text is sent securely to Sarvam AI only to generate this draft. JanDraft has no database and
                does not save your complaint.
              </p>
            </form>
          </section>

          {/* Results */}
          <section ref={resultsRef} className="scroll-mt-20 lg:col-span-7" aria-live="polite" aria-busy={isLoading}>
            {status === "idle" && <EmptyState />}
            {status === "loading" && <LoadingState step={loadingStep} elapsed={elapsed} />}
            {status === "error" && error && (
              <ErrorState message={error} onRetry={() => handleSubmit()} />
            )}
            {status === "success" && result && (
              <div className="space-y-5">
                <div className="flex items-start gap-3 rounded-2xl border border-warn/25 bg-warn-soft px-4 py-3.5 text-sm leading-relaxed text-warn sm:px-5">
                  <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    <strong className="font-semibold">This is a draft only. It has not been submitted to any government authority.</strong>{" "}
                    Review it, replace every <span className="font-mono text-[13px]">[placeholder]</span> with your
                    details, verify the recipient, and submit it yourself through the correct office or official
                    grievance channel.
                  </p>
                </div>

                <Card>
                  <div className="flex flex-wrap items-center gap-2">
                    <SectionLabel>Subject</SectionLabel>
                    {result.output_language && (
                      <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-medium text-ink-500">
                        {result.output_language}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-2 font-serif text-xl font-semibold leading-snug text-ink-900 sm:text-2xl">
                    {result.subject}
                  </h2>
                  {result.summary && <p className="mt-3 leading-relaxed text-ink-700">{result.summary}</p>}
                </Card>

                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <SectionLabel>Suggested recipient</SectionLabel>
                    <span className="inline-flex items-center gap-1 rounded-full border border-warn/30 bg-warn-soft px-2.5 py-0.5 text-xs font-medium text-warn">
                      <AlertIcon className="h-3 w-3" />
                      Recommendation · verify before sending
                    </span>
                  </div>
                  <p className="mt-2 text-lg font-semibold text-ink-900">
                    {result.suggested_recipient || "Not determined. Please identify the responsible office."}
                  </p>
                  {result.recipient_rationale && (
                    <p className="mt-2 text-sm leading-relaxed text-ink-700">{result.recipient_rationale}</p>
                  )}
                </Card>

                <Card padded={false}>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
                    <div>
                      <SectionLabel>Formal draft</SectionLabel>
                      <p className="mt-1 text-xs text-ink-500">
                        Editable.{" "}
                        {placeholderCount > 0
                          ? `${placeholderCount} placeholder${placeholderCount === 1 ? "" : "s"} in [brackets] still need your details.`
                          : "No bracketed placeholders remaining."}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <ToolbarButton onClick={handleCopy} aria-label="Copy draft to clipboard">
                        {copied ? <CheckIcon className="h-4 w-4 text-accent" /> : <CopyIcon className="h-4 w-4" />}
                        {copied ? "Copied" : "Copy Draft"}
                      </ToolbarButton>
                      <ToolbarButton onClick={handleDownload} aria-label="Download draft as a text file">
                        <DownloadIcon className="h-4 w-4" />
                        Download TXT
                      </ToolbarButton>
                    </div>
                  </div>
                  <label htmlFor="formal-draft" className="sr-only">
                    Formal draft (editable)
                  </label>
                  <textarea
                    id="formal-draft"
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    ref={draftRef}
                    rows={14}
                    spellCheck={false}
                    className="block w-full resize-none overflow-hidden rounded-b-2xl bg-[#fffdf8] px-5 py-5 font-serif text-[15.5px] leading-[1.75] text-ink-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent/20 sm:px-8 sm:py-7"
                  />
                </Card>

                <div className="grid gap-5 md:grid-cols-2">
                  <ListCard
                    title="Key facts you provided"
                    items={result.key_facts}
                    empty="No specific facts were extracted."
                    icon={<CheckIcon className="h-3.5 w-3.5" />}
                    tone="accent"
                  />
                  <ListCard
                    title="Missing information"
                    subtitle="Adding these will strengthen your grievance."
                    items={result.missing_information}
                    empty="Nothing obvious is missing."
                    icon={<QuestionIcon className="h-3.5 w-3.5" />}
                    tone="warn"
                  />
                </div>

                {result.evidence_checklist.length > 0 && (
                  <Card>
                    <SectionLabel>Evidence checklist</SectionLabel>
                    <p className="mt-1 text-xs text-ink-500">Tick off what you have. This list is only kept on this page.</p>
                    <ul className="mt-3 space-y-1">
                      {result.evidence_checklist.map((item, i) => (
                        <li key={i}>
                          <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-paper">
                            <input
                              type="checkbox"
                              checked={checkedEvidence.has(i)}
                              onChange={() => toggleEvidence(i)}
                              className="mt-1 h-4 w-4 shrink-0 accent-[#0e6b5c]"
                            />
                            <span className={`text-[15px] leading-relaxed ${checkedEvidence.has(i) ? "text-ink-500 line-through" : "text-ink-700"}`}>
                              {item}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                {result.next_steps.length > 0 && (
                  <Card>
                    <SectionLabel>Next steps</SectionLabel>
                    <ol className="mt-3 space-y-3">
                      {result.next_steps.map((step, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-strong tabular-nums">
                            {i + 1}
                          </span>
                          <span className="pt-0.5 text-[15px] leading-relaxed text-ink-700">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </Card>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <p className="text-xs text-ink-500">AI-generated draft. Check every detail before you use it.</p>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <ResetIcon className="h-4 w-4" />
                    Start a new draft
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm leading-relaxed text-ink-500 sm:px-6">
          <p>
            <span className="font-serif font-semibold text-ink-700">JanDraft</span> is an independent drafting aid
            powered by Sarvam AI. It is not a government service, is not affiliated with or endorsed by any
            government body, does not submit complaints, and does not provide legal advice. Always verify the
            recipient and every detail before submitting a grievance.
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ---------- Result states ---------- */

function EmptyState() {
  const items = [
    ["Subject & summary", "A concise subject line and a neutral summary of your issue."],
    ["Suggested recipient", "The office likely responsible, as a recommendation for you to verify."],
    ["Formal draft", "A respectful, well-structured letter you can edit, copy, or download."],
    ["Gaps & evidence", "Details that are missing, and documents worth attaching."],
    ["Next steps", "Practical guidance on what to do with your draft."],
  ];
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-surface/60 p-6 sm:p-8">
      <p className="font-serif text-lg font-semibold text-ink-900">What you&apos;ll get</p>
      <p className="mt-1 text-sm text-ink-500">Your results appear here after you generate a draft.</p>
      <ol className="mt-6 space-y-4">
        {items.map(([title, desc], i) => (
          <li key={title} className="flex gap-4">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line-strong bg-surface text-xs font-semibold text-ink-500 tabular-nums">
              {i + 1}
            </span>
            <div>
              <p className="font-medium text-ink-900">{title}</p>
              <p className="text-sm leading-relaxed text-ink-500">{desc}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-ink-500">
        JanDraft never submits anything on your behalf. You stay in control of what is sent, and to whom.
      </p>
    </div>
  );
}

function LoadingState({ step, elapsed }: { step: number; elapsed: number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8" role="status">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2.5 font-medium text-ink-900">
          <Spinner className="h-4 w-4 text-accent" />
          Preparing your draft…
        </p>
        <span className="text-xs tabular-nums text-ink-500">{elapsed}s</span>
      </div>
      <ol className="mt-5 space-y-2.5">
        {LOADING_STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-3 text-sm">
            {i < step ? (
              <CheckIcon className="h-4 w-4 text-accent" />
            ) : i === step ? (
              <span className="grid h-4 w-4 place-items-center">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              </span>
            ) : (
              <span className="grid h-4 w-4 place-items-center">
                <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
              </span>
            )}
            <span className={i <= step ? "text-ink-900" : "text-ink-300"}>{label}</span>
          </li>
        ))}
      </ol>
      <div className="mt-7 space-y-3" aria-hidden>
        <div className="jd-skeleton h-5 w-2/3" />
        <div className="jd-skeleton h-3.5 w-full" />
        <div className="jd-skeleton h-3.5 w-11/12" />
        <div className="jd-skeleton h-3.5 w-4/5" />
        <div className="jd-skeleton mt-5 h-40 w-full" />
      </div>
      <p className="mt-5 text-xs text-ink-500">This usually takes 5–20 seconds. Longer complaints can take a little more.</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-danger/25 bg-danger-soft p-6 sm:p-7">
      <div className="flex items-start gap-3">
        <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
        <div>
          <p className="font-semibold text-danger">We couldn&apos;t generate your draft</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-700">{message}</p>
          <p className="mt-1 text-sm text-ink-500">Your complaint text is still in the form.</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-surface px-3.5 py-2 text-sm font-medium text-danger hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
          >
            <ResetIcon className="h-4 w-4" />
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Small building blocks ---------- */

function Card({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  return (
    <div
      className={`rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(23,32,51,0.04)] ${padded ? "p-5 sm:p-6" : ""}`}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">{children}</h3>;
}

function ListCard({
  title,
  subtitle,
  items,
  empty,
  icon,
  tone,
}: {
  title: string;
  subtitle?: string;
  items: string[];
  empty: string;
  icon: ReactNode;
  tone: "accent" | "warn";
}) {
  const bullet = tone === "accent" ? "bg-accent-soft text-accent-strong" : "bg-warn-soft text-warn";
  return (
    <Card>
      <SectionLabel>{title}</SectionLabel>
      {subtitle && <p className="mt-1 text-xs text-ink-500">{subtitle}</p>}
      {items.length > 0 ? (
        <ul className="mt-3 space-y-2.5">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2.5">
              <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${bullet}`}>{icon}</span>
              <span className="text-[15px] leading-relaxed text-ink-700">{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ink-500">{empty}</p>
      )}
    </Card>
  );
}

function ToolbarButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {children}
    </button>
  );
}

function TrustChip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5">
      <span className="text-accent">{icon}</span>
      {children}
    </li>
  );
}

/* ---------- Icons (inline, no dependency) ---------- */

type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

const PenIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </Svg>
);
const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
  </Svg>
);
const SendOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M3 3l18 18" />
  </Svg>
);
const LockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Svg>
);
const SparkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
  </Svg>
);
const ArrowIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
const ResetIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </Svg>
);
const CopyIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Svg>
);
const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5M12 15V3" />
  </Svg>
);
const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);
const QuestionIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
    <path d="M12 17h.01" />
  </Svg>
);
const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4M12 16h.01" />
  </Svg>
);
const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </Svg>
);
const ChevronIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

function Spinner({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`animate-spin ${className ?? ""}`} aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
