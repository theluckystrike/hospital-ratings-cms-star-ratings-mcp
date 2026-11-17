# hospital-ratings-cms-star-ratings-mcp

Hospital ratings for AI assistants: the CMS overall hospital star rating, patient survey (HCAHPS) stars, ER wait times and quality measures for every US hospital in Medicare Care Compare. Ask for the best rated hospitals in your city, how a hospital scores before surgery, or which of two hospitals has the shorter ER wait.

This is a Model Context Protocol (MCP) server. It reads the Medicare Care Compare hospital datasets that CMS publishes in the Provider Data Catalog on data.cms.gov at call time. It needs no API key.

## Tools

| Tool | What it returns |
| --- | --- |
| `hospital_search` | Hospitals in a state, city, county or ZIP code (or by name) with the CMS overall star rating, patient survey summary stars, type, ownership and ER availability, best rated first, with the count at each star level. Filters: hospital type, minimum stars, emergency services. |
| `hospital_ratings` | One hospital in full: overall star rating (or why it has none), mortality, safety and readmission measures better or worse than the national rate, patient survey stars overall and by topic, share rating it 9 or 10 and who would definitely recommend it against national, ER median time, left without being seen, sepsis care and staff flu vaccination against the state and national average. |
| `hospital_compare` | 2 to 5 hospitals side by side on overall stars, patient stars, 9-10 ratings, ER median time, sepsis care and measure groups, with the leader on each. |

Every result has structured JSON, a plain-text summary, `as_of`, `source` and `more` (a page on [mcpstamp.com](https://www.mcpstamp.com/servers/?utm_source=mcp&utm_medium=hospital-ratings-cms-star-ratings-mcp)). Every tool is marked read-only.

## What it knows that your model does not

- The current CMS overall hospital star rating for each of the 5,435 hospitals in the October 2026 Care Compare data and the reason when a hospital is not rated, from the latest Care Compare refresh rather than a training-time snapshot.
- Patient survey (HCAHPS) star ratings by topic and the share of patients who rated the hospital 9 or 10, compared with the national average.
- Each hospital's ER median time from arrival to leaving and its rate of patients who left before being seen, against the state and national averages.

## Install

### Hosted (custom connector, ChatGPT developer mode, any remote MCP client)

Paste this URL. No token, no sign-up.

```
https://hospital-ratings-cms-star-ratings-mcp.lipmichal.workers.dev/mcp
```

### Cursor

Add to `~/.cursor/mcp.json`.

```json
{
  "mcpServers": {
    "hospital-ratings": { "url": "https://hospital-ratings-cms-star-ratings-mcp.lipmichal.workers.dev/mcp" }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`.

```json
{
  "servers": {
    "hospital-ratings": { "type": "http", "url": "https://hospital-ratings-cms-star-ratings-mcp.lipmichal.workers.dev/mcp" }
  }
}
```

### Local stdio

The npm package is not published. Build it from this repository with Node 20 or newer, then point your MCP client at `node /path/to/hospital-ratings-cms-star-ratings-mcp/dist/stdio.js`.

```
git clone https://github.com/theluckystrike/hospital-ratings-cms-star-ratings-mcp && cd hospital-ratings-cms-star-ratings-mcp
npm install && npm run build
node dist/stdio.js
```

## Example prompts

- "What are the best rated hospitals in Boston?"
- "How good is Mass General? What is its CMS star rating and ER wait time?"
- "Compare Brigham and Women's and Massachusetts General Hospital for patient satisfaction."
- "Which hospitals in Vermont with an emergency room have 4 or 5 stars?"

## Data sources

Full list in [DATA_SOURCES.md](DATA_SOURCES.md).

- CMS Provider Data Catalog (Medicare Care Compare), hospital datasets: https://data.cms.gov/provider-data/topics/hospitals

## Limitations

- US hospitals that report to Medicare only. Critical access, psychiatric, children's, cancer and DoD hospitals often have no overall star rating; the answer says why, using the CMS footnote.
- Star ratings and measures cover past periods (patient survey and ER times for 2025 in the October 2026 refresh); CMS refreshes them quarterly.
- Search is by state, city, county, ZIP code or ZIP prefix and name, not by distance.
- Ratings are one input to choosing a hospital. Check the hospital on medicare.gov/care-compare and with a doctor.

## More

More MCP servers that answer questions your assistant cannot answer alone are on [mcpstamp.com](https://www.mcpstamp.com/servers/?utm_source=mcp&utm_medium=hospital-ratings-cms-star-ratings-mcp).

Part of the Zovo MCP collection at https://mcp.zovo.one

Built by [theluckystrike](https://github.com/theluckystrike).

## Development

```
npm install
npm test                              # builds, then runs the fixture tests and an offline stdio test
node scripts/stdio-transcript.mjs     # live stdio round trip, writes .live/stdio-transcript.jsonl
```

CI (`.github/workflows/bundle.yml`) runs the tests, the type check and `wrangler deploy --dry-run --outdir out`, and uploads the Worker bundle as an artifact.

## License

MIT
