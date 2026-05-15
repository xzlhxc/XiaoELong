import Parser from "rss-parser";
import { env } from "../config/env.js";

const parser = new Parser({
  timeout: 8000
});

function normalizeHeadline(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export async function fetchNewsHeadlines(): Promise<string[]> {
  const feedUrls = env.QUESTION_RSS_FEEDS.split(",")
    .map((url) => url.trim())
    .filter((url) => url.length > 0);

  const results = await Promise.allSettled(
    feedUrls.map(async (url) => {
      const feed = await parser.parseURL(url);
      return (feed.items ?? [])
        .map((item) => normalizeHeadline(item.title ?? ""))
        .filter((title) => title.length > 0);
    })
  );

  const headlines: string[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      headlines.push(...result.value);
    }
  }

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const headline of headlines) {
    if (seen.has(headline)) {
      continue;
    }
    seen.add(headline);
    deduped.push(headline);
    if (deduped.length >= env.QUESTION_HEADLINE_LIMIT) {
      break;
    }
  }

  if (deduped.length === 0) {
    throw new Error("No RSS headlines available.");
  }
  return deduped;
}
