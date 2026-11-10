"use client";
import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { RESUME_LIMITS } from "@/lib/matching/config";
import { cleanMatchText } from "@/lib/matching/documents";
import { readResume } from "@/lib/matching/resume";
interface Props {
  enabled: boolean;
  busy: boolean;
  failed: boolean;
  wordOnly: boolean;
  progress: string;
  warning: string;
  activeResume: boolean;
  onApply: (text: string, goal: string) => void;
  onEnable: () => void;
  onDisable: () => void;
  onForget: () => void;
  onRefresh: () => void;
  onLexical: () => void;
}
export default function ResumeMatching(props: Props) {
  const [resume, setResume] = useState(""),
    [goal, setGoal] = useState(""),
    [filename, setFilename] = useState(""),
    [reading, setReading] = useState(false),
    [error, setError] = useState(""),
    [applied, setApplied] = useState(false),
    [open, setOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null),
    area = useRef<HTMLTextAreaElement>(null),
    goalArea = useRef<HTMLTextAreaElement>(null),
    sequence = useRef(0);
  useEffect(() => {
    if (area.current) {
      area.current.style.height = "auto";
      area.current.style.height = `${Math.min(360, Math.max(144, area.current.scrollHeight))}px`;
    }
  }, [resume, open]);
  useEffect(() => {
    if (goalArea.current) {
      goalArea.current.style.height = "auto";
      goalArea.current.style.height = `${Math.min(240, Math.max(96, goalArea.current.scrollHeight))}px`;
    }
  }, [goal, open]);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  const forget = () => {
    sequence.current++;
    setReading(false);
    setResume("");
    setGoal("");
    setFilename("");
    setError("");
    setApplied(false);
    if (file.current) file.current.value = "";
    props.onForget();
  };
  const choose = async (selected: File) => {
    const request = ++sequence.current;
    setReading(true);
    setError("");
    try {
      const text = await readResume(selected);
      if (request !== sequence.current) return;
      setResume(text);
      setFilename(selected.name);
      setApplied(false);
    } catch (error) {
      if (request === sequence.current)
        setError(
          error instanceof Error
            ? error.message
            : "Couldn’t read the file. Paste your experience below.",
        );
    } finally {
      if (request === sequence.current) {
        setReading(false);
        if (file.current) file.current.value = "";
      }
    }
  };
  const apply = () => {
    const text = cleanMatchText(resume);
    if (resume.length > RESUME_LIMITS.characters) {
      setError("Use 30,000 characters or fewer.");
      area.current?.focus();
      return;
    }
    if (text && text.length < 40) {
      setError(
        "Add a little more detail about your projects, experience or skills.",
      );
      area.current?.focus();
      return;
    }
    if (!text && !goal.trim()) {
      setError(
        "Add experience or a goal, or use your existing profile with Deeper matching.",
      );
      area.current?.focus();
      return;
    }
    setError("");
    setApplied(true);
    props.onApply(text, goal.trim());
  };
  return (
    <section
      className="rounded-xl border border-border bg-surface p-4 md:p-5"
      aria-labelledby="resume-matching-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="resume-matching-title"
            className="font-heading text-base font-semibold"
          >
            Go beyond shared words
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            Compare actual projects and experience. Private matching runs on
            your device.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {props.enabled ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={props.onRefresh}
                disabled={props.busy}
              >
                Refresh network
              </Button>
              {props.wordOnly && !props.busy && (
                <Button variant="secondary" size="sm" onClick={props.onEnable}>
                  Try deeper matching
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={props.onDisable}>
                Standard matching
              </Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" onClick={props.onEnable}>
              Deeper matching
            </Button>
          )}
        </div>
      </div>
      {!props.enabled && (
        <p className="mt-2 text-xs text-text-muted">
          Deeper matching downloads about 55 MB on first use and caches the
          model when your browser allows it. On a slow connection, switch to
          private word matching for a smaller download.
        </p>
      )}
      {props.enabled && (
        <p role="status" className="mt-3 text-xs text-accent-light">
          {props.busy
            ? props.progress || "Matching on your device…"
            : props.activeResume
              ? "Using your resume and goal. Nothing was uploaded or added to your profile."
              : "Matching your profile and search on this device."}
        </p>
      )}
      {props.warning && (
        <p
          role="status"
          className="mt-2 text-xs leading-relaxed text-text-secondary"
        >
          {props.warning}
        </p>
      )}
      {props.enabled && (props.busy || props.failed) && (
        <Button
          className="mt-2"
          variant="ghost"
          size="sm"
          onClick={props.onLexical}
        >
          Use private word matching
        </Button>
      )}
      <details
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        className="mt-4 border-t border-border pt-3"
      >
        <summary className="cursor-pointer rounded text-sm text-accent-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          Use a resume or set a goal{props.enabled && applied && " · applied"}
        </summary>
        <div className="mt-4 space-y-4">
          <p className="text-xs leading-relaxed text-text-muted">
            Your resume and goal stay in this tab’s memory. TSE doesn’t send
            them to its server or an AI provider, save them in browser storage,
            or publish them as your bio. Remove them below when you’re done.
            Matching works best with English text.
          </p>
          <div>
            <label
              htmlFor="resume-file"
              className="mb-2 block text-xs text-text-secondary"
            >
              Choose a resume · PDF or .txt, up to 5 MB and 10 pages
            </label>
            <input
              ref={file}
              id="resume-file"
              type="file"
              accept=".pdf,.txt,application/pdf,text/plain"
              disabled={reading}
              aria-describedby={
                error
                  ? "resume-file-help resume-matching-error"
                  : "resume-file-help"
              }
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) void choose(selected);
              }}
              className="block w-full rounded-lg border border-border bg-input-bg p-2 text-sm text-text-secondary file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-2 file:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            <p
              id="resume-file-help"
              role="status"
              className="mt-2 text-xs text-text-muted"
            >
              {reading
                ? "Reading the file on your device…"
                : filename
                  ? `${filename} · text extracted. Review it below.`
                  : "Scanned or password-protected PDF? Paste selectable text below instead."}
            </p>
          </div>
          <div>
            <label
              htmlFor="resume-text"
              className="block text-xs text-text-secondary"
            >
              Review your experience, projects and skills
            </label>
            <textarea
              ref={area}
              id="resume-text"
              autoComplete="off"
              spellCheck={false}
              data-gramm="false"
              data-gramm_editor="false"
              data-enable-grammarly="false"
              value={resume}
              maxLength={RESUME_LIMITS.characters}
              aria-invalid={!!error}
              aria-describedby={
                error ? "resume-matching-error" : "resume-text-help"
              }
              onChange={(event) => {
                setResume(event.target.value);
                setApplied(false);
                setError("");
              }}
              placeholder="Paste relevant experience here, or review the text extracted from your file."
              className="mt-2 min-h-36 w-full resize-none overflow-y-auto rounded-lg border border-border bg-input-bg p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <p id="resume-text-help" className="mt-1 text-xs text-text-muted">
              {resume.length.toLocaleString()} /{" "}
              {RESUME_LIMITS.characters.toLocaleString()} characters. Contact
              details and links are excluded from matching.
            </p>
          </div>
          <div>
            <label
              htmlFor="matching-goal"
              className="block text-xs text-text-secondary"
            >
              Who would you like to meet, and why?
            </label>
            <textarea
              ref={goalArea}
              id="matching-goal"
              autoComplete="off"
              spellCheck={false}
              data-gramm="false"
              data-gramm_editor="false"
              data-enable-grammarly="false"
              rows={2}
              maxLength={600}
              value={goal}
              onChange={(event) => {
                setGoal(event.target.value);
                setApplied(false);
              }}
              placeholder="For example: I want to learn about making GPU training faster, or meet people who design accessible healthcare tools."
              className="mt-2 min-h-24 w-full resize-none rounded-lg border border-border bg-input-bg p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <p className="mt-1 text-xs text-text-muted">
              Optional. Your goal steers matching beyond what you have already
              done. A directory search takes priority while it is filled in.
            </p>
          </div>
          {error && (
            <p
              id="resume-matching-error"
              role="alert"
              className="text-sm text-red-400"
            >
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={apply} disabled={reading}>
              Match this experience
            </Button>
            <Button size="sm" variant="ghost" onClick={forget}>
              Remove resume & goal
            </Button>
          </div>
        </div>
      </details>
    </section>
  );
}
