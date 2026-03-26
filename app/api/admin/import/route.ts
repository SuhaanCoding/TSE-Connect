import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import Papa from "papaparse";

const VALID_OPT_STATUS = ["opted_in", "opted_out", "not_confirmed"];
const VALID_CONTACT = ["linkedin", "email", "both"];

// Fields that are safe to import — auth_id and login_email are NEVER imported
const IMPORTABLE_FIELDS = [
  "full_name",
  "graduation_year",
  "current_role",
  "current_company",
  "linkedin_url",
  "contact_email",
  "preferred_contact",
  "opt_status",
  "tse_role",
  "past_companies",
];

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;
  const admin = await isAdmin(user.email);
  if (!admin) return null;
  return user;
}

/**
 * POST /api/admin/import — Import alumni from a CSV file.
 * Accepts multipart form data with a "file" field.
 * Upserts on full_name conflict.
 */
export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data with a CSV file" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "No file provided. Upload a CSV file with field name 'file'" },
      { status: 400 }
    );
  }

  const csvText = await file.text();
  if (!csvText.trim()) {
    return NextResponse.json({ error: "CSV file is empty" }, { status: 400 });
  }

  // Parse CSV
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  if (parsed.errors.length > 0 && (!parsed.data || parsed.data.length === 0)) {
    return NextResponse.json(
      { error: "Failed to parse CSV", details: parsed.errors.slice(0, 5) },
      { status: 400 }
    );
  }

  // Validate that full_name column exists
  const headers = parsed.meta.fields || [];
  if (!headers.includes("full_name")) {
    return NextResponse.json(
      {
        error:
          'CSV must have a "full_name" column. Found columns: ' +
          headers.join(", "),
      },
      { status: 400 }
    );
  }

  const serviceClient = await createServiceClient();
  const importErrors: string[] = [];
  const validRecords: Record<string, unknown>[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const rowNum = i + 2; // +2 for 1-indexed + header row

    const fullName = row.full_name?.trim();
    if (!fullName) {
      importErrors.push(`Row ${rowNum}: missing full_name, skipped`);
      continue;
    }
    if (fullName.length > 255) {
      importErrors.push(`Row ${rowNum}: full_name too long (>255), skipped`);
      continue;
    }

    const record: Record<string, unknown> = { full_name: fullName };

    // Process each importable field
    for (const field of IMPORTABLE_FIELDS) {
      if (field === "full_name") continue; // already handled
      const value = row[field]?.trim();
      if (value === undefined || value === "") continue;

      if (field === "opt_status") {
        if (!VALID_OPT_STATUS.includes(value)) {
          importErrors.push(
            `Row ${rowNum}: invalid opt_status "${value}", using default`
          );
          continue;
        }
        record.opt_status = value;
      } else if (field === "preferred_contact") {
        if (!VALID_CONTACT.includes(value)) {
          importErrors.push(
            `Row ${rowNum}: invalid preferred_contact "${value}", using default`
          );
          continue;
        }
        record.preferred_contact = value;
      } else if (field === "past_companies") {
        // Expect semicolon-delimited string (matches CSV export format)
        const companies = value
          .split(";")
          .map((c: string) => c.trim())
          .filter((c: string) => c.length > 0 && c.length <= 100)
          .slice(0, 20);
        if (companies.length > 0) {
          record.past_companies = companies;
        }
      } else {
        record[field] = value;
      }
    }

    validRecords.push(record);
  }

  // Batch upsert in groups of 50
  const BATCH_SIZE = 50;
  let imported = 0;
  let upsertErrors = 0;

  for (let i = 0; i < validRecords.length; i += BATCH_SIZE) {
    const batch = validRecords.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((record) =>
        serviceClient
          .from("alumni")
          .upsert(record, { onConflict: "full_name" })
      )
    );
    for (let j = 0; j < results.length; j++) {
      if (results[j].error) {
        upsertErrors++;
        const name = batch[j].full_name as string;
        if (upsertErrors <= 5) {
          importErrors.push(
            `Failed to upsert "${name}": ${results[j].error!.message}`
          );
        }
      } else {
        imported++;
      }
    }
  }

  return NextResponse.json({
    imported,
    skipped: parsed.data.length - validRecords.length,
    errors: importErrors,
    total: parsed.data.length,
  });
}
