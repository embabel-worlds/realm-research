---
name: web-search
description: 'Web search workflows — you CAN search the live public web: Brave (current/general/news), Wikipedia (encyclopedic / stable knowledge), and fetch (read a specific URL). NEVER tell the user you cannot search the web. ACTIVATE this skill whenever the user asks to search the web or look something up online, and for any external current information the user''s own knowledge graph does not cover — it returns the gateway methods and rules; you MUST then RUN the search with execute and answer from its results. One exception: "who is X" / "tell me about X" about someone the user may know is a graph question — the knowledge graph comes first (find_entity) and a graph hit IS the answer; search the web only if the graph has no match or the topic is explicitly external.'
---

# Web Search

You can search the live public web. Never tell the user you can't — an
explicit "search the web for X" always means run a search with the tools
below and answer from the results.

Three namespaces, picked by intent:

> **First check the knowledge graph.** "Who is X" / "tell me about X" about a
> person or org is a graph question (`find_entity`) — the user means *their*
> contact, not a public namesake. Only use the web below when the graph has NO
> match, or for an explicitly external topic.

| Need | Namespace |
|---|---|
| External / public web info NOT in the user's graph; "what is &lt;public thing&gt;" | `gateway.brave.webSearch` |
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
// body is markdown-converted page text, ending with a "## Links on this page" section
```

## Pattern: thin page → crawl the site

When a landing page is a shell ("click to explore", a nav menu and no
content), the substance is BEHIND its links. Don't report the shell — crawl
in ONE call:

```javascript
const site = await gateway.fetch.crawl({
  url: "https://example.org/",
  hint: "history opening hours visiting",  // steers which links are followed
  max_pages: 5,
});
// site is the text of the landing page plus its most relevant same-site
// pages, separated by ---. Answer from it; cite each page you used.
```

For a single known URL use `fetch` — its result still ends with a
"## Links on this page" section if you need one specific follow-up.

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
