---
version: alpha
name: TSE Connect
description: A restrained dark directory for the Triton Software Engineering community.
colors:
  background: "#0A0A0B"
  foreground: "#FAFAF8"
  surface: "#111113"
  accent: "#6366F1"
  accent-light: "#818CF8"
  input: "#141416"
  muted: "rgba(250, 250, 248, 0.6)"
  secondary: "rgba(250, 250, 248, 0.75)"
  border: "rgba(250, 250, 248, 0.08)"
typography:
  heading:
    fontFamily: "Satoshi, system-ui, sans-serif"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
rounded:
  control: "0.5rem"
  card: "0.75rem"
  tag: "9999px"
spacing:
  profile-max: "42rem"
  directory-max: "80rem"
  page-inset: "1.5rem"
components:
  button: {}
  button-link: {}
  input: {}
  card: {}
  badge: {}
  keyword-tags: {}
  toast: {}
---

# TSE Connect Design System

## Overview

TSE Connect is a community address book: recognizable people and readable career histories lead; indigo marks useful actions and personal interests. The user requested matching the existing UI, not a rebrand. The audience is UC San Diego TSE members and alumni using phones and laptops for introductions, referrals and advice. English is the current UI language; no Japan-specific market scope is established. Authenticated product screens favor quiet utility; the existing landing page retains its own motion and branding.

Runtime ownership: `app/globals.css` is canonical for color and font tokens, exposed through Tailwind's inline theme. This document mirrors those values. `components/ui/buttonStyles.ts` owns shared action geometry; Input, Badge, Card and Toast own their respective states. No generated token layer exists.

## Colors

Near-black background, slightly raised surfaces, warm-white text and low-contrast borders preserve the existing site. Indigo controls and pale-indigo keyword pills are the signature. Errors use the existing red-400 text and an explicit message. Color never substitutes for labels or state announcements. Scrollbar tokens live in the global stylesheet, with system colors under forced-colors.

## Typography

Use Satoshi for headings and Inter for body and controls, with system fallbacks. Profile headings are 24–30px, settings sections 18px, form fields 14px, supporting copy and tags 12px. Keep keywords in their entered casing; do not uppercase member content. Wrap long keywords rather than widening the page.

## Layout

Keep profiles and Settings within 42rem; the directory uses 80rem and one column on phones, two at medium widths, three on large screens. Preserve document scrolling and the established 1.5rem horizontal inset. Existing forms use 2rem section gaps and 1rem field gaps. Optional keyword sections disappear when empty on read views. The editor retains a helper/count area for validation and wraps tag previews.

## Elevation & Depth

Static content uses surface color and hairline borders. Do not introduce gradients, new shadows or decorative panels for keywords. Toasts retain the existing elevated treatment.

## Shapes

Controls use 0.5rem corners, cards 0.75rem and metadata pills a full radius. Keep existing inline SVG icon strokes and sizes. Text labels remain required on primary actions.

## Components

Buttons and navigation links share `buttonStyles.ts`; navigation renders anchors, actions render buttons. Busy profile saves preserve button width. Fields use Input and a visible label; KeywordsField owns its helper, count, error and preview. Keywords are comma-separated text, not a custom combobox. Native graduation-year selects retain platform popup behavior. Badge supplies tag styling; KeywordTags renders noninteractive summaries inside directory card links and keyboard-focusable search links on detail pages. Toast acknowledges successful saves; inline alerts retain actionable failures and entered values. Use visible indigo focus rings. Reduced-motion preferences disable decorative animation.

## Do's and Don'ts

- Do preserve the existing palette, typography and page widths.
- Do distinguish editable interests from scraped company history.
- Do share tag styling and search behavior across cards and detail views.
- Keep bios as plain text. Do not add rich text, paid AI calls or new profile visibility rules.
- Don't manually overwrite LinkedIn company history through member profile saves.

Bio and matching extension: About You uses an auto-growing plain-text textarea and the existing keyword field. Profile biographies retain paragraph breaks. LinkedIn About, job descriptions and project descriptions live in a separate native disclosure with a source label. Directory cards show a two-line member bio excerpt.

Ranked discovery is the default directory view, with Browse directory retained as a sibling navigation link. The user requested ranking everyone rather than a positive-match-only preview. Its signature is the honest ordinal rank on the existing AlumniCard, with short evidence lines and exploratory labels for weak matches. No percentage scores or new decorative palette. Company-category chips use existing rounded tags and show their pool count. Filters retain native platform-owned selects, including long company options. Category membership is an explicitly approximate employer-name classification.

Production discovery starts with search, followed by filters and categories, optional personalization, then Your network. Keep copy brief and confident: no introductory hero, proxy disclaimer banner, shortlist, coverage diagnostics or repeated pagination prose. The quiet results count uses alumni (or picks after a shuffle); numbered pages retain navigation. Approximate company classification stays available in tag details without dominating the page. Editable message starters use the existing textarea geometry, auto-grow, an explicit copy action and inline status. Drafts stay in tab session storage. Nothing sends automatically. Opted-out profiles remain rankable under the existing directory policy but cannot receive generated starters. Existing contact-link visibility stays authoritative.

Recovery history uses an Unresolved column and native per-run disclosures; unresolved profiles appear first with a reason, provider, profile link and one explicit retry action. These views reuse the same Button, border, focus, scrollbar and type tokens. Verified graduation corrections use past explicit UCSD education dates only, preserve numeric member years and never replace uncertain school labels with guesses.

Resume matching extends ranked discovery with one restrained surface, native disclosure and native PDF/TXT file picker. The default closed view is labeled Personalize your matches, below the filters, with Deeper matching and an Add a resume or goal disclosure. The resume editor reuses the plain-text profile form geometry, visible labels, indigo focus and auto-growing textareas. The first model download is explicit and optional; its progress has a cancel-to-word-matching action. Errors retain drafted text. Model failure falls back to private word matching with an explicit status. No percentage score implies accuracy. Evidence quotes carry their actual member/LinkedIn source. Removing the resume resets private matching and restores the standard ranking.

The matching fallback action persists after download/model failures. Slow index loading reports percentage progress instead of leaving an unexplained blank region; private word matching has its own smaller download and never displays a missing-vector coverage warning as if text were absent.
