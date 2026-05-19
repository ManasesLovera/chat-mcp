import type { SearchResultItem, SearchResultPayload } from "@/server/types";

export type SearchProvider = {
  search(query: string): Promise<SearchResultPayload>;
};

type DuckDuckGoTopic = {
  Text?: string;
  FirstURL?: string;
  Result?: string;
  Name?: string;
  Topics?: DuckDuckGoTopic[];
};

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, "").trim();
}

function collectTopics(topics: DuckDuckGoTopic[], results: SearchResultItem[] = []) {
  for (const topic of topics) {
    if (topic.Topics?.length) {
      collectTopics(topic.Topics, results);
      continue;
    }

    if (!topic.FirstURL || !topic.Text) {
      continue;
    }

    const cleanText = stripHtml(topic.Text);
    const [title, ...rest] = cleanText.split(" - ");
    results.push({
      title: title || cleanText,
      url: topic.FirstURL,
      snippet: rest.join(" - ") || cleanText,
    });
  }

  return results;
}

export const duckDuckGoProvider: SearchProvider = {
  async search(query: string) {
    const url = new URL("https://api.duckduckgo.com/");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("no_html", "1");
    url.searchParams.set("skip_disambig", "1");

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("DuckDuckGo search request failed.");
    }

    const data = (await response.json()) as {
      AbstractText?: string;
      AbstractURL?: string;
      Heading?: string;
      RelatedTopics?: DuckDuckGoTopic[];
    };

    const results: SearchResultItem[] = [];
    if (data.AbstractText && data.AbstractURL) {
      results.push({
        title: data.Heading || query,
        url: data.AbstractURL,
        snippet: data.AbstractText,
      });
    }

    if (data.RelatedTopics?.length) {
      collectTopics(data.RelatedTopics, results);
    }

    const limited = results.slice(0, 6);
    const summary =
      limited.length > 0
        ? `Top matches: ${limited.map((item) => item.title).join(", ")}`
        : "DuckDuckGo Instant Answer returned no structured results for that query.";

    return {
      query,
      results: limited,
      summary,
    };
  },
};
