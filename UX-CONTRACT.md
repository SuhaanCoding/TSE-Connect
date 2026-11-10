# TSE Connect interaction contract

Scope: member bios and keywords, LinkedIn background, profile display, directory search and personal recommendations. Existing authentication, opt-in and contact visibility remain authoritative in the existing server routes and Supabase policies.

| Capability     | Canonical owner                      | Source of truth              | Allowed variants                   | Verification                          |
| -------------- | ------------------------------------ | ---------------------------- | ---------------------------------- | ------------------------------------- |
| Form           | Input, KeywordsField; lib/profile.ts | Member profile API           | Settings edit; onboarding review   | Validation tests, browser save/reload |
| Select/Listbox | Native graduation-year select        | Existing Settings/StepVerify | Platform-owned popup               | Keyboard and open popup inspection    |
| Scrollbar      | app/globals.css                      | DESIGN.md mirrored tokens    | Global baseline                    | Computed style                        |
| Toast          | components/ui/Toast.tsx              | Existing profile save flow   | Success; inline persistent failure | Browser success/failure               |
| CRUD           | /api/alumni PUT                      | Authenticated user and RLS   | Update own editable profile fields | Tests and DB transaction checks       |

Keywords are optional, limited to 10 entries of 40 characters each, trimmed and deduplicated without case sensitivity. Commas separate values. They are plain text, visible and searchable to signed-in members under the existing profile access policy. Clearing all values saves an empty list. Omitted keywords preserve stored values, including older onboarding clients.

Members update keywords in Settings, remain on Settings after save and receive the existing success toast. Validation focuses the Keywords input; network/server failures keep entered values and show a persistent retry instruction. Duplicate saves are prevented. Directory summaries show three keywords and an overflow count; full profiles show every keyword as a link to the directory query. Empty profiles gain no placeholder section.

Company history is scraper-owned. Member edit and onboarding views show the current company read-only with a LinkedIn refresh explanation. The member API omits current_company and past_companies regardless of input; a database trigger also rejects direct member changes. Service-role scraping remains able to refresh company history. Keyword edits never modify scraped career history or account ownership.

Directory search includes keywords alongside names, roles and current/past companies. Committed search/filter/page state stays in the URL. Search debounces at 300ms, suppresses IME composition and aborts stale requests. Clearing search resets page, cancels pending work and returns focus to the input. Search errors show an explicit retry action, not a false empty result.

Desktop and narrow-screen verification must cover save/reload, keyword links, no-results/clear, keyboard focus, failed save recovery, validation limits and read-only company fields. API tests cover malformed data, preservation of omitted fields and attempts to overwrite scraper-owned fields.

Member bios are optional plain text, limited to 1,000 characters. Blank values clear the bio; omitted values preserve it. LinkedIn About is capped at 6,000 characters, and combined job/project descriptions at 18,000. Scraping only writes visible, nonempty background text and never overwrites member-authored bio or keywords. All scraped background fields are read-only for member accounts.

Search ranks the authenticated roster using TF-IDF cosine similarity across names, roles, company history, member bio, keywords and LinkedIn background. Exact name/company lookup receives priority. Personal recommendations compare the viewer's own bio and keywords against other opted-in alumni's bios, keywords and LinkedIn background, exclude self, return up to three positive matches and explain shared terms. Empty or common-word-only input does not manufacture matches. No profile text is sent to an AI provider. Contact permissions are preserved and login metadata is sanitized in directory and recommendation responses.
