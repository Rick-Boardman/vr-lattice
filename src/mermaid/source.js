// SPDX-License-Identifier: Apache-2.0
const DEFAULT_FETCH_CACHE_MODE = "no-store";
const MERMAID_FENCE = "```";
const MERMAID_LANGUAGE = "mermaid";

/**
 * Purpose: Fetch Mermaid source text from a URL using the shared runtime cache policy for the Mermaid 3D tooling.
 * @param {string} url URL to fetch. Must resolve to a text response.
 * @param {object} [options] Fetch options.
 * @param {RequestCache} [options.cache="no-store"] Request cache mode forwarded to `fetch`.
 * @returns {Promise<string>} Resolved Mermaid source text.
 * Side effects: performs a network request. Throws when the URL is missing or when the HTTP response is not successful.
 */
export async function fetchMermaidSourceText(
  url,
  { cache = DEFAULT_FETCH_CACHE_MODE } = {}
) {
  if (!url) {
    throw new Error("fetchMermaidSourceText: missing url");
  }

  const res = await fetch(url, { cache });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return await res.text();
}

/**
 * Purpose: Extract the first fenced Mermaid code block from a Markdown document so the shared Mermaid runtime can parse only the flowchart source.
 * @param {string} markdownText Markdown text that may contain fenced code blocks.
 * @returns {string | null} The contents of the first fenced `mermaid` block, or `null` when none is present.
 * Side effects: none; pure string-parsing helper.
 */
export function extractFirstMermaidBlock(markdownText) {
  const source = String(markdownText ?? "");
  let searchStart = 0;

  while (searchStart < source.length) {
    const fenceStart = source.indexOf(MERMAID_FENCE, searchStart);
    if (fenceStart < 0) {
      break;
    }

    const languageLineEnd = source.indexOf("\n", fenceStart + MERMAID_FENCE.length);
    if (languageLineEnd < 0) {
      break;
    }

    const language = source
      .slice(fenceStart + MERMAID_FENCE.length, languageLineEnd)
      .trim()
      .toLowerCase();
    const fenceEnd = source.indexOf(MERMAID_FENCE, languageLineEnd + 1);
    if (fenceEnd < 0) {
      break;
    }

    if (language === MERMAID_LANGUAGE) {
      return source.slice(languageLineEnd + 1, fenceEnd);
    }

    searchStart = fenceEnd + MERMAID_FENCE.length;
  }

  return null;
}
