import type { Alumni } from "../types";
import { INDEX_LIMITS } from "./config";
export type DocumentSource =
  | "bio"
  | "keywords"
  | "role"
  | "about"
  | "experience"
  | "project"
  | "background"
  | "resume"
  | "goal";
export interface MatchDocument {
  id: string;
  profileId: string;
  source: DocumentSource;
  label: string;
  text: string;
}
export function cleanMatchText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, " ")
    .replace(/(?:\+?\d[\d(). -]{7,}\d)/g, " ")
    .replace(/\b(?:email|e-mail|phone|mobile|contact|address)\s*:[^\n]*/gi, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export function splitPassages(
  text: string,
  maxWords = INDEX_LIMITS.wordsPerChunk,
): string[] {
  const words = cleanMatchText(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const chunks: string[] = [];
  const step = Math.max(1, maxWords - INDEX_LIMITS.overlapWords);
  for (let i = 0; i < words.length; i += step) {
    chunks.push(words.slice(i, i + maxWords).join(" "));
    if (i + maxWords >= words.length) break;
  }
  return chunks;
}
export function profileDocuments(
  profile: Pick<
    Alumni,
    | "id"
    | "bio"
    | "keywords"
    | "current_role"
    | "current_company"
    | "past_companies"
    | "linkedin_about"
    | "linkedin_background"
  >,
): MatchDocument[] {
  const docs: MatchDocument[] = [];
  const add = (source: DocumentSource, label: string, value: string) => {
    for (const text of splitPassages(value)) {
      if (text.length < 8) continue;
      docs.push({
        id: `${profile.id}:${source}:${docs.length}`,
        profileId: profile.id,
        source,
        label: label.slice(0, 160),
        text,
      });
    }
  };
  if (profile.bio) add("bio", "Member bio", profile.bio);
  if (profile.keywords?.length)
    add("keywords", "Member interests", profile.keywords.join(", "));
  if (
    profile.current_role ||
    profile.current_company ||
    profile.past_companies?.length
  )
    add(
      "role",
      "Career overview",
      [
        profile.current_role && `Current role: ${profile.current_role}`,
        profile.current_company &&
          `Current organization: ${profile.current_company}`,
        profile.past_companies?.length &&
          `Past organizations: ${profile.past_companies.join(", ")}`,
      ]
        .filter(Boolean)
        .join(". "),
    );
  if (profile.linkedin_about)
    add("about", "LinkedIn About", profile.linkedin_about);
  let source: DocumentSource = "background";
  let context = "LinkedIn work & projects";
  const metadata: string[] = [];
  for (const block of cleanMatchText(profile.linkedin_background || "").split(
    /\n\s*\n/,
  )) {
    if (!block.trim()) continue;
    if (/^LinkedIn experience\b/i.test(block)) {
      source = "experience";
      metadata.length = 0;
      context = "LinkedIn experience";
      const rest = block.replace(/^LinkedIn experience\s*/i, "");
      if (rest) metadata.push(rest);
      continue;
    }
    if (/^LinkedIn projects\b/i.test(block)) {
      source = "project";
      metadata.length = 0;
      context = "LinkedIn project";
      continue;
    }
    if (
      /^(?:[A-Z][a-z]{2} \d{4}|\d+ (?:yr|mo)|Associated with |[\w +/#.-]+ and \+\d+ skills)/.test(
        block,
      )
    )
      continue;
    const lines = block.split("\n").filter(Boolean);
    const first = lines[0] || "";
    if (
      lines.length === 1 &&
      block.length < 110 &&
      !/[.!?]$/.test(block) &&
      !/^[-•●]/.test(block)
    ) {
      if (source === "experience") {
        metadata.push(block);
        if (metadata.length > 3) metadata.shift();
        context = metadata.join(" · ");
      } else context = block;
      // Brief descriptions and titles can both carry useful evidence.
      add(source, context, block);
      continue;
    }
    if (
      lines.length > 1 &&
      first.length < 110 &&
      !/^[-•●]/.test(first) &&
      !/[.!?]$/.test(first)
    ) {
      context = first;
    }
    add(source, context, `${context}\n${block}`);
  }
  // Spread the budget across the whole history, rather than truncating to the first projects.
  if (docs.length <= INDEX_LIMITS.documentsPerProfile) return docs;
  const authored = docs.filter((doc) =>
    ["bio", "keywords", "role", "about"].includes(doc.source),
  );
  const background = docs.filter((doc) => !authored.includes(doc));
  const slots = Math.max(0, INDEX_LIMITS.documentsPerProfile - authored.length);
  return [
    ...authored.slice(0, INDEX_LIMITS.documentsPerProfile),
    ...Array.from(
      { length: slots },
      (_, i) => background[Math.floor((i * background.length) / slots)],
    ),
  ];
}
export function queryDocuments(text: string, goal = ""): MatchDocument[] {
  const passages = splitPassages(text);
  const selected =
    passages.length > 32
      ? Array.from(
          { length: 32 },
          (_, i) => passages[Math.floor((i * (passages.length - 1)) / 31)],
        )
      : passages;
  const docs = selected.map((value, i) => ({
    id: `query:${i}`,
    profileId: "query",
    source: "resume" as DocumentSource,
    label: "Your experience",
    text: value,
  }));
  if (goal.trim())
    docs.unshift(
      ...splitPassages(goal)
        .slice(0, 3)
        .map((value, i) => ({
          id: `goal:${i}`,
          profileId: "query",
          source: "goal" as DocumentSource,
          label: "Your goal",
          text: value,
        })),
    );
  return docs;
}

/** Use the pinned tokenizer to guarantee complete passages, without silent model truncation. */
export function fitTokenBudget(
  documents: MatchDocument[],
  countTokens: (text: string) => number,
  maxTokens: number,
): MatchDocument[] {
  const expanded: MatchDocument[] = [];
  for (const doc of documents) {
    const queue = [doc];
    while (queue.length) {
      const item = queue.shift()!;
      if (countTokens(item.text) <= maxTokens || item.text.length < 2) {
        expanded.push(item);
        continue;
      }
      const words = item.text.split(/\s+/);
      if (words.length > 1) {
        const mid = Math.floor(words.length / 2);
        queue.unshift(
          { ...item, id: item.id + ":a", text: words.slice(0, mid).join(" ") },
          { ...item, id: item.id + ":b", text: words.slice(mid).join(" ") },
        );
      } else {
        const mid = Math.floor(item.text.length / 2);
        queue.unshift(
          { ...item, id: item.id + ":a", text: item.text.slice(0, mid) },
          { ...item, id: item.id + ":b", text: item.text.slice(mid) },
        );
      }
    }
  }
  return expanded;
}
