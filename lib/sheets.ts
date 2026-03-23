import { GoogleAuth } from "google-auth-library";

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID!;
const RESULTS_SHEET = "Results";

function getAuth() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson || keyJson === "{}") {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY not configured");
  }
  const credentials = JSON.parse(keyJson);
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error("Invalid service account key: missing client_email or private_key");
  }
  return new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function getAccessToken(): Promise<string> {
  const auth = getAuth();
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token || "";
}

async function findRowByName(
  name: string,
  accessToken: string
): Promise<number | null> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RESULTS_SHEET}!A:A`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) return null;
  const data = await res.json();
  const rows: string[][] = data.values || [];

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]?.trim().toLowerCase() === name.trim().toLowerCase()) {
      return i + 1; // 1-indexed for Sheets API
    }
  }
  return null;
}

export async function writeBackToSheets(alumni: {
  full_name: string;
  graduation_year?: string | null;
  current_role?: string | null;
  current_company?: string | null;
  past_companies?: string[];
}): Promise<boolean> {
  try {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      console.log("Sheets write-back skipped: no service account configured");
      return false;
    }

    const accessToken = await getAccessToken();
    const rowNum = await findRowByName(alumni.full_name, accessToken);

    if (!rowNum) {
      // Name not found — append a new row
      const newRow = [
        alumni.full_name,
        alumni.graduation_year || "",
        alumni.current_role || "",
        alumni.current_company || "",
        ...(alumni.past_companies || []),
      ];

      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RESULTS_SHEET}:append?valueInputOption=RAW`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ values: [newRow] }),
        }
      );
      return res.ok;
    }

    // Update existing row (columns A-D + past companies)
    const values = [
      alumni.full_name,
      alumni.graduation_year || "",
      alumni.current_role || "",
      alumni.current_company || "",
      ...(alumni.past_companies || []),
    ];

    const endCol = String.fromCharCode(64 + Math.max(values.length, 4)); // D minimum
    const range = `${RESULTS_SHEET}!A${rowNum}:${endCol}${rowNum}`;

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: [values] }),
      }
    );

    return res.ok;
  } catch (error) {
    console.error("Sheets write-back failed:", error);
    return false;
  }
}
