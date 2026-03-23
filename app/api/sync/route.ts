import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.SYNC_SECRET_KEY}`;

  if (!authHeader || authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

  if (!SPREADSHEET_ID || !GOOGLE_API_KEY) {
    return NextResponse.json(
      { error: "Missing Google Sheets configuration" },
      { status: 500 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Fetch both sheets from the NEW spreadsheet in parallel
    const [resultsRes, everyoneRes] = await Promise.all([
      fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Results?key=${GOOGLE_API_KEY}`
      ),
      fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Everyone?key=${GOOGLE_API_KEY}`
      ),
    ]);

    if (!resultsRes.ok || !everyoneRes.ok) {
      const errDetails = !resultsRes.ok
        ? await resultsRes.text()
        : await everyoneRes.text();
      return NextResponse.json(
        { error: "Failed to fetch Google Sheets data", details: errDetails },
        { status: 502 }
      );
    }

    const resultsSheet = await resultsRes.json();
    const everyoneSheet = await everyoneRes.json();

    // Parse "Results" sheet: Full Name | Graduation Year | Current Role | Current Company | Past Company 1-20
    const careerMap = new Map<
      string,
      {
        graduation_year: string | null;
        current_role: string | null;
        current_company: string | null;
        past_companies: string[];
      }
    >();

    if (resultsSheet.values) {
      for (const row of resultsSheet.values.slice(1)) {
        const [name, gradYear, role, company, ...pastCos] = row;
        if (!name?.trim()) continue;

        const trimmedName = name.trim();
        // Skip excessively long names
        if (trimmedName.length > 255) {
          console.warn(`Sync: skipping long name (${trimmedName.length} chars)`);
          continue;
        }

        careerMap.set(trimmedName, {
          graduation_year: gradYear?.trim() || null,
          current_role: role?.trim() || null,
          current_company: company?.trim() || null,
          past_companies: pastCos
            .filter((c: unknown) => typeof c === "string" && c.trim())
            .map((c: string) => c.trim())
            .slice(0, 20), // Cap at 20 past companies
        });
      }
    }

    // Parse "Everyone" sheet: Status/Year | Full Name | LinkedIn URL
    // This is the master list of ALL TSE members
    const alumni: Array<{
      full_name: string;
      graduation_year: string | null;
      current_role: string | null;
      current_company: string | null;
      past_companies: string[];
      linkedin_url: string | null;
      opt_status: string;
    }> = [];

    const seenNames = new Set<string>();

    if (everyoneSheet.values) {
      for (const row of everyoneSheet.values.slice(1)) {
        const [yearOrStatus, name, linkedin] = row;
        if (!name?.trim()) continue;

        const trimmedName = name.trim();
        if (trimmedName.length > 255) continue;
        if (seenNames.has(trimmedName)) {
          console.warn(`Sync: duplicate name in sheet: "${trimmedName}"`);
          continue;
        }
        seenNames.add(trimmedName);

        const career = careerMap.get(trimmedName);

        alumni.push({
          full_name: trimmedName,
          graduation_year: career?.graduation_year || yearOrStatus?.trim() || null,
          current_role: career?.current_role || null,
          current_company: career?.current_company || null,
          past_companies: career?.past_companies || [],
          linkedin_url: linkedin?.trim() || null,
          opt_status: "not_confirmed",
        });

        // Remove from careerMap so we can add Results-only entries
        careerMap.delete(trimmedName);
      }
    }

    // Add entries that exist in Results but not in Everyone
    for (const [name, career] of careerMap) {
      if (seenNames.has(name)) continue;
      alumni.push({
        full_name: name,
        graduation_year: career.graduation_year,
        current_role: career.current_role,
        current_company: career.current_company,
        past_companies: career.past_companies,
        linkedin_url: null,
        opt_status: "not_confirmed",
      });
    }

    // Fetch claimed profiles to split sync strategy
    const { data: claimed } = await supabase
      .from("alumni")
      .select("full_name")
      .not("auth_id", "is", null);

    const claimedNames = new Set(claimed?.map((c) => c.full_name) ?? []);

    let synced = 0;
    let updated = 0;
    let errors = 0;

    for (const person of alumni) {
      if (claimedNames.has(person.full_name)) {
        // Claimed profile: update ONLY career data (don't touch opt_status, contact info, etc.)
        const { error } = await supabase
          .from("alumni")
          .update({
            graduation_year: person.graduation_year,
            current_role: person.current_role,
            current_company: person.current_company,
            past_companies: person.past_companies,
          })
          .eq("full_name", person.full_name);

        if (!error) {
          updated++;
        } else {
          errors++;
          if (errors <= 3) {
            console.error(`Failed to update ${person.full_name}:`, error.message);
          }
        }
      } else {
        // Unclaimed profile: full upsert
        const record: Record<string, unknown> = {
          full_name: person.full_name,
          graduation_year: person.graduation_year,
          current_role: person.current_role,
          current_company: person.current_company,
          past_companies: person.past_companies,
          linkedin_url: person.linkedin_url,
          opt_status: person.opt_status,
        };

        const { error } = await supabase.from("alumni").upsert(record, {
          onConflict: "full_name",
        });
        if (!error) {
          synced++;
        } else {
          errors++;
          if (errors <= 3) {
            console.error(`Failed to upsert ${person.full_name}:`, error.message);
          }
        }
      }
    }

    return NextResponse.json({
      synced,
      updated,
      errors,
      claimed: claimedNames.size,
      total: alumni.length,
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
