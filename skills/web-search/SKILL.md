---
name: web-search
description: Web search workflows — Brave (current/general/news), Wikipedia (encyclopedic / stable knowledge), and fetch (read a specific URL). Activate this skill BEFORE any search-the-web call when the user asks to look something up, find information, get news, or check what something is.
---

# Web Search

Three namespaces, picked by intent:

| Need | Namespace |
|---|---|
| General web / current info / "who is X" / "what is Y" | `gateway.brave.webSearch` |
| News / headlines / recent events | `gateway.brave.newsSearch` |
| Encyclopedic / stable knowledge (definitions, history, science) | `gateway.wikipedia.search` then `gateway.wikipedia.getSummary` |
| Read a known URL (already in hand from search results, user, or memory) | `gateway.fetch.fetch` |

## The one rule that breaks every call

**The query parameter is named `q`, not `query`.** Both Brave and Wikipedia
will reject `{ query: "..." }` (HTTP 422 from Brave, 400 / empty from
Wikipedia). Always:

```javascript
gateway.brave.webSearch({ q: "your query", count: 5 })
gateway.brave.newsSearch({ q: "your query", count: 5 })
gateway.wikipedia.search({ q: "your query", limit: 10 })
```

## Brave

```javascript
const r = await gateway.brave.webSearch({ q: "claude opus 4.7 release notes", count: 5 });
for (const hit of r.web.results) {
  console.log("-", hit.title, hit.url, "—", hit.description);
}
```

Optional args: `count` (max 20), `offset` (0-based page), `country` (2-letter
code, e.g. `"US"`), `freshness` (`pd` past day, `pw` past week, `pm` past
month, `py` past year). Use `freshness` whenever the user says "latest" /
"recent" / "today" — otherwise stale results dominate.

`newsSearch` has the same shape but returns `r.results` (a bare array)
instead of `r.web.results`.

## Wikipedia

Two-step: search returns hits, getSummary reads one.

```javascript
const hits = await gateway.wikipedia.search({ q: "Oldsmobile Toronado", limit: 5 });
for (const p of hits.pages) console.log(`- ${p.title}: ${p.description}`);

const page = await gateway.wikipedia.getSummary({ title: "Oldsmobile Toronado" });
console.log(page.extract);
console.log("URL:", page.content_urls?.desktop?.page);
```

Pass the exact `title` (or `key`) from a search hit to `getSummary` — don't
guess title casing.

## Pattern: search → fetch

Brave snippets are short. If the user wants depth, fetch the URL:

```javascript
const r = await gateway.brave.webSearch({ q: "embabel agent framework", count: 3 });
const top = r.web.results[0];
const body = await gateway.fetch.fetch({ url: top.url });
// body is markdown-converted page text
```

## Citing

Every fact you surface from a search MUST be citable. Render results as
markdown links — title and URL come straight from the response:

```
- [Title from result](https://example.com/url)
```

For Wikipedia, cite the `content_urls.desktop.page` URL, not the title alone.

## Pitfalls

- **`q` not `query`.** This is the #1 mistake — see the rule above.
- **Brave web vs news shape**: web is `r.web.results[]`, news is `r.results[]`.
- **No `freshness` ⇒ stale-friendly results.** For "latest" / "today" queries always set it.
- **Don't loop searches.** If the first search misses, broaden once or switch tool — never retry the same query verbatim.
- **Wikipedia title case matters for `getSummary`.** Use the title returned by `search`, not what the user typed.
