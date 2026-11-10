import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "../supabase/server";
type IndexableProfile = Parameters<typeof profileDocuments>[0];
import { ENCODER } from "./config";
import { profileDocuments } from "./documents";
import {
  packVector,
  type MatchCacheRecord,
  type PackedDocument,
} from "./vectors";
export const MATCH_BUCKET = "matching-vectors";
const prefix = ENCODER.version;
interface StoredIndex {
  modelVersion: string;
  records: MatchCacheRecord[];
  generatedAt: string;
}
let cachedIndex: { at: number; data: StoredIndex } | null = null;
const individual = new Map<string, MatchCacheRecord>();
export function profileSourceHash(profile: IndexableProfile): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        model: ENCODER.version,
        documents: profileDocuments(profile),
      }),
    )
    .digest("hex");
}
function validRecord(
  record: MatchCacheRecord,
  profile: IndexableProfile,
  hash: string,
): boolean {
  return (
    record?.modelVersion === ENCODER.version &&
    record.profileId === profile.id &&
    record.sourceHash === hash &&
    Array.isArray(record.documents) &&
    record.documents.length <= 128 &&
    record.documents.every(
      (doc) =>
        doc.profileId === profile.id &&
        typeof doc.text === "string" &&
        doc.text.length <= 10000 &&
        typeof doc.vector === "string" &&
        doc.vector.length === 2048,
    )
  );
}
async function loadIndex(db: SupabaseClient): Promise<StoredIndex> {
  if (cachedIndex && Date.now() - cachedIndex.at < 60000)
    return cachedIndex.data;
  const { data, error } = await db.storage
    .from(MATCH_BUCKET)
    .download(`${prefix}/index.json`);
  let index: StoredIndex = {
    modelVersion: ENCODER.version,
    records: [],
    generatedAt: "",
  };
  if (!error && data) {
    const parsed = JSON.parse(await data.text());
    if (
      parsed.modelVersion === ENCODER.version &&
      Array.isArray(parsed.records)
    )
      index = parsed;
  }
  cachedIndex = { at: Date.now(), data: index };
  return index;
}
/** Only call after authentication and loading the current RLS-visible roster. */
export async function indexForVisibleProfiles(
  profiles: IndexableProfile[],
  db?: SupabaseClient,
) {
  const service = db || (await createServiceClient()),
    index = await loadIndex(service);
  const byHash = new Map(
    index.records.map((record) => [record.sourceHash, record]),
  );
  const documents: PackedDocument[] = [];
  let ready = 0;
  for (let offset = 0; offset < profiles.length; offset += 20) {
    await Promise.all(
      profiles.slice(offset, offset + 20).map(async (profile) => {
        const hash = profileSourceHash(profile);
        let record = individual.get(hash) || byHash.get(hash);
        if (!record) {
          const { data } = await service.storage
            .from(MATCH_BUCKET)
            .download(`${prefix}/${hash}.json`);
          if (data) {
            const parsed = JSON.parse(await data.text());
            if (validRecord(parsed, profile, hash)) {
              record = parsed;
              if (individual.size > 1500) individual.clear();
              individual.set(hash, record!);
            }
          }
        }
        if (record && validRecord(record, profile, hash)) {
          documents.push(...record.documents);
          if (record.documents.length) ready++;
        } else
          documents.push(
            ...profileDocuments(profile).map((doc) => ({ ...doc, vector: "" })),
          );
      }),
    );
  }
  return {
    documents,
    ready,
    modelVersion: ENCODER.version,
    indexUpdatedAt: index.generatedAt || null,
  };
}
/** Immutable per-content objects make concurrent refreshes safe. The aggregate is only a fast manifest. */
export async function refreshMatchingProfiles(
  ids?: string[],
  db?: SupabaseClient,
) {
  const service = db || (await createServiceClient());
  const { data: bucket, error: bucketError } =
    await service.storage.getBucket(MATCH_BUCKET);
  if (bucket?.public) throw new Error("Matching cache must be private");
  if (bucketError) {
    const { error } = await service.storage.createBucket(MATCH_BUCKET, {
      public: false,
      allowedMimeTypes: ["application/json"],
      fileSizeLimit: 20 * 1024 * 1024,
    });
    if (error && !/already exists/i.test(error.message)) throw error;
  }
  const profiles: IndexableProfile[] = [];
  for (let offset = 0; ; offset += 500) {
    let request = service
      .from("alumni")
      .select(
        "id,bio,keywords,current_role,current_company,past_companies,linkedin_about,linkedin_background",
      )
      .order("id")
      .range(offset, offset + 499);
    if (ids) request = request.in("id", [...new Set(ids)]);
    const { data, error } = await request;
    if (error) throw error;
    profiles.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  const index = await loadIndex(service),
    records = new Map(
      index.records.map((record) => [record.profileId, record]),
    );
  const missing = (profiles || []).filter((profile) => {
    const hash = profileSourceHash(profile);
    const saved = records.get(profile.id);
    return !saved || !validRecord(saved, profile, hash);
  });
  const { encodeDocuments } = await import("./encoder.server");
  let updated = 0;
  for (let offset = 0; offset < missing.length; offset += 20) {
    const group = missing.slice(offset, offset + 20);
    const encoded = await encodeDocuments(group.flatMap(profileDocuments));
    for (const profile of group) {
      const hash = profileSourceHash(profile);
      const record: MatchCacheRecord = {
        modelVersion: ENCODER.version,
        sourceHash: hash,
        profileId: profile.id,
        documents: encoded
          .filter((doc) => doc.profileId === profile.id)
          .map((doc) => ({ ...doc, vector: packVector(doc.vector) })),
      };
      const { error: writeError } = await service.storage
        .from(MATCH_BUCKET)
        .upload(`${prefix}/${hash}.json`, JSON.stringify(record), {
          contentType: "application/json",
          upsert: false,
        });
      if (writeError && !/already exists|duplicate/i.test(writeError.message))
        throw writeError;
      records.set(profile.id, record);
      individual.set(hash, record);
      updated++;
    }
  }
  // Remove deleted profiles from a full manifest refresh. RLS/source hashes also guard every read.
  if (!ids) {
    const current = new Set((profiles || []).map((profile) => profile.id));
    for (const id of records.keys()) if (!current.has(id)) records.delete(id);
  }
  const result: StoredIndex = {
    modelVersion: ENCODER.version,
    generatedAt: new Date().toISOString(),
    records: [...records.values()],
  };
  const { error: saveError } = await service.storage
    .from(MATCH_BUCKET)
    .upload(`${prefix}/index.json`, JSON.stringify(result), {
      contentType: "application/json",
      upsert: true,
    });
  if (saveError) throw saveError;
  cachedIndex = { at: Date.now(), data: result };
  return {
    profiles: profiles?.length || 0,
    updated,
    documents: result.records.reduce((n, r) => n + r.documents.length, 0),
    generatedAt: result.generatedAt,
  };
}
