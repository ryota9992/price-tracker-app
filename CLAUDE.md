# CLAUDE.md

This file provides guidance for AI assistants working on the price-tracker-app codebase.

## Project Overview

A lightweight Next.js web application that analyzes product pricing screenshots using the Anthropic Claude vision API. Users upload screenshots of Japanese retail listings; the app extracts pricing data, displays a comparison table, and exports results as CSV.

**Target audience:** Japanese users, primarily on iPhone (installable as PWA via Safari).

## Repository Structure

```
price-tracker-app/
├── pages/
│   ├── _document.js      # HTML template: sets lang="ja", loads Tailwind CSS from CDN
│   ├── index.js          # Main UI component (upload, preview, table, CSV export)
│   └── api/
│       └── analyze.js    # POST /api/analyze — sends image to Claude API, returns JSON
├── next.config.js        # Minimal Next.js config (React Strict Mode enabled)
├── package.json          # Dependencies and npm scripts
└── README.md             # Japanese deployment/usage guide
```

## Tech Stack

- **Framework:** Next.js 14.0.4 (React 18)
- **Styling:** Tailwind CSS loaded via CDN in `_document.js` (no local install)
- **AI/Vision:** Anthropic Claude API (`claude-sonnet-4-20250514` model)
- **Deployment:** Vercel

## Development Commands

```bash
npm install           # Install dependencies
npm run dev           # Start dev server at http://localhost:3000
npm run build         # Production build
npm start             # Serve production build
```

## Environment Variables

| Variable            | Required | Description                          |
|---------------------|----------|--------------------------------------|
| `ANTHROPIC_API_KEY` | Yes      | Anthropic API key for Claude vision  |

For local development, create `.env.local`:
```bash
echo "ANTHROPIC_API_KEY=your_api_key_here" > .env.local
```

**Never commit `.env.local` or any file containing the API key.**

## API Endpoint

### `POST /api/analyze`

Accepts a single base64-encoded image and returns structured pricing data extracted by Claude.

**Request body:**
```json
{ "imageData": "<base64-encoded image string>" }
```

**Response (200):**
```json
{
  "productName": "string",
  "productCode": "string",
  "quantity": "string",
  "purchasePrice": "string",
  "shops": [
    {
      "name": "string",
      "buyPrice": 1500,
      "profit": 200,
      "timeAgo": "3日前"
    }
  ]
}
```

**Error responses:** 400 (missing image), 405 (non-POST), 500 (API/parse errors).

## Frontend Conventions (`pages/index.js`)

- **Image preprocessing:** Client-side canvas resize to max 1200px, JPEG at 70% quality before upload.
- **Rate limiting:** 1-second delay between sequential API calls when processing multiple images.
- **Shop database:** Hardcoded array in `index.js` listing shops with `idRequired` and `cashOnDelivery` flags. To add/remove shops, edit this array directly.
- **UI language:** All labels, prompts, and user-facing strings are in Japanese.
- **Tailwind:** Used via CDN only — do not install as a local package. Add utility classes directly in JSX.

## Key Conventions

- **No TypeScript.** The project uses plain JavaScript throughout.
- **No linter/formatter config.** There is no ESLint or Prettier setup; follow the existing code style.
- **No tests.** There is no test infrastructure. Do not add test files unless explicitly requested.
- **No database.** The app is entirely stateless. All data lives in React state during a session.
- **Stateless API.** `analyze.js` is a pure function: receives image → calls Claude → returns JSON. No side effects.
- **Single API route.** Keep backend logic in `pages/api/analyze.js`. Do not split into multiple routes unless the scope genuinely requires it.
- **Claude model:** The model is hardcoded as `claude-sonnet-4-20250514` in `analyze.js`. Update here when upgrading.
- **Prompt in Japanese:** The Claude prompt in `analyze.js` is written in Japanese to match the target data format. Keep prompts in Japanese.

## Deployment (Vercel)

1. Push code to the GitHub repository.
2. Connect the repository to Vercel.
3. Set `ANTHROPIC_API_KEY` in Vercel → Settings → Environment Variables.
4. Vercel auto-builds and deploys on every push to `main`.

No `vercel.json` is needed; Next.js defaults work correctly.

## Common Tasks

### Update the shop list
Edit the shop info array in `pages/index.js`. Each entry has:
```js
{ name: "店舗名", idRequired: true, cashOnDelivery: false }
```

### Change the Claude model
Update the `model` field in `pages/api/analyze.js`:
```js
model: "claude-sonnet-4-20250514",
```

### Adjust image compression
In `pages/index.js`, find the canvas resize logic. Change `1200` (max dimension) or `0.7` (JPEG quality) as needed.

### Modify extracted fields
Update the JSON schema described in the Claude prompt inside `pages/api/analyze.js`, then update the frontend table rendering in `pages/index.js` to display the new fields.
