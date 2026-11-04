// SPDX-License-Identifier: Apache-2.0
// Mermaid flowchart subset parser.
//
// Supported (v1):
// - flowchart TB / flowchart LR
// - Node refs: A, node_1, etc
// - Node labels: A[Label]
// - Edges: A-->B, A---B
// - Edge labels: A -->|label| B  OR  A -- label --> B

function cleanId(s) {
  return String(s ?? "").trim();
}

function parseNodeToken(tok) {
  // Examples:
  //  A
  //  A[Hello]
  //  C{Decision}
  //  D(Rounded)
  //  E((Circle))
  const t = String(tok ?? "").trim();

  // id only
  {
    const m = /^([A-Za-z0-9_\-]+)$/.exec(t);
    // A bare reference like "C" should NOT imply a shape; otherwise it can
    // overwrite a previously declared shape like "C{Decision}".
    if (m) return { id: m[1], label: null, shape: null };
  }

  // id[Label]
  {
    const m = /^([A-Za-z0-9_\-]+)\[(.*)\]$/.exec(t);
    if (m) {
      const raw = String(m[2] ?? "");
      // Mermaid DB/cylinder shorthand uses: [(
      //   ("Label")
      // )]
      // e.g. ArtifactsBucket[("S3 Artifacts Bucket")]
      const db = /^\(\s*(["'])(.*)\1\s*\)$/.exec(raw.trim());
      if (db) return { id: m[1], label: String(db[2] ?? ""), shape: "db" };

      // Strip a single layer of surrounding quotes when present.
      const q = /^(["'])(.*)\1$/.exec(raw.trim());
      const label = q ? String(q[2] ?? "") : raw;
      return { id: m[1], label, shape: "rect" };
    }
  }

  // id{Label}  (decision)
  {
    const m = /^([A-Za-z0-9_\-]+)\{(.*)\}$/.exec(t);
    if (m) return { id: m[1], label: String(m[2]), shape: "diamond" };
  }

  // id((Label)) (circle)
  {
    const m = /^([A-Za-z0-9_\-]+)\(\((.*)\)\)$/.exec(t);
    if (m) return { id: m[1], label: String(m[2]), shape: "circle" };
  }

  // id(Label) (rounded)
  {
    const m = /^([A-Za-z0-9_\-]+)\((.*)\)$/.exec(t);
    if (m) return { id: m[1], label: String(m[2]), shape: "round" };
  }

  return null;
}

function splitByPipeLabel(s) {
  // A -->|label| B
  const m = /^(.*)\|([^|]+)\|(.*)$/.exec(s);
  if (!m) return null;
  return { left: m[1], label: m[2].trim(), right: m[3] };
}

function tryParseEdge(norm) {
  const s = String(norm ?? "");
  if (!s) return null;

  // Supported separators (subset)
  // - A --> B
  // - A --- B
  // - A -.-> B
  // - A <--> B
  const tokens = ["<-->", "-.->", "-->", "---"];
  let token = null;
  let idx = -1;
  for (const t of tokens) {
    const i = s.indexOf(t);
    if (i >= 0 && (idx < 0 || i < idx)) {
      idx = i;
      token = t;
    }
  }
  if (!token) return null;

  // Prefer explicit "A -->|label| B" parsing when present.
  const labeled = /^(.+?)(<-->|-\.->|-->|---)\s*\|([^|]+)\|\s*(.+)$/.exec(s);
  if (labeled) {
    return {
      leftPart: labeled[1].trim(),
      token: labeled[2],
      label: String(labeled[3] ?? "").trim(),
      rightPart: labeled[4].trim(),
    };
  }

  // Fallback to older pipe-split heuristic (kept for compatibility).
  const piped = splitByPipeLabel(s);
  if (piped) {
    // token must exist in the left side for this to be meaningful
    const ti = piped.left.indexOf(token);
    if (ti >= 0) {
      return {
        leftPart: piped.left.slice(0, ti).trim(),
        token,
        label: String(piped.label ?? "").trim(),
        rightPart: piped.right.trim(),
      };
    }
  }

  return {
    leftPart: s.slice(0, idx).trim(),
    token,
    label: null,
    rightPart: s.slice(idx + token.length).trim(),
  };
}

function parseEdgeChain(norm) {
  const s = String(norm ?? "").trim();
  if (!s) return [];

  // Fast path: if there is only one arrow-ish token, use tryParseEdge.
  {
    const first = tryParseEdge(s);
    if (first) {
      const rest = String(first.rightPart ?? "");
      // If the right side still contains an edge token, this is a chain.
      if (!/(<-->|-\.->|-->|---)/.test(rest)) {
        return [first];
      }
    }
  }

  // Chain parser (subset): splits into Node, Token, Node, Token, Node...
  // Example: Upload --> SnsIngest --> SqsIngest
  const tokens = ["<-->", "-.->", "-->", "---"];
  const parts = [];

  let i = 0;
  while (i < s.length) {
    // Find next token occurrence.
    let nextTok = null;
    let nextIdx = -1;
    for (const t of tokens) {
      const j = s.indexOf(t, i);
      if (j >= 0 && (nextIdx < 0 || j < nextIdx)) {
        nextIdx = j;
        nextTok = t;
      }
    }

    if (!nextTok) {
      const tail = s.slice(i).trim();
      if (tail) parts.push({ kind: "node", value: tail });
      break;
    }

    const nodeText = s.slice(i, nextIdx).trim();
    if (nodeText) parts.push({ kind: "node", value: nodeText });
    parts.push({ kind: "tok", value: nextTok });
    i = nextIdx + nextTok.length;
  }

  // Remove leading/trailing tokens if malformed.
  while (parts.length && parts[0].kind !== "node") parts.shift();
  while (parts.length && parts[parts.length - 1].kind !== "node") parts.pop();

  const edges = [];
  for (let k = 0; k + 2 < parts.length; k += 2) {
    const a = parts[k];
    const t = parts[k + 1];
    const b = parts[k + 2];
    if (!a || !t || !b) continue;
    if (a.kind !== "node" || t.kind !== "tok" || b.kind !== "node") continue;

    edges.push({ leftPart: a.value, token: t.value, label: null, rightPart: b.value });
  }

  return edges;
}

/**
 * Purpose: Parse the supported Mermaid flowchart subset into a normalized runtime graph model that the shared 3D renderer can lay out and display.
 * @param {string} source Mermaid source text containing a `flowchart TB`, `flowchart TD`, or `flowchart LR` header plus supported node and edge syntax.
 * @returns {{ direction: "TB" | "LR", nodes: Array<{ id: string, label: string, shape: string }>, edges: Array<{ from: string, to: string, label: string, style: string, layoutIgnore: boolean }> }} Parsed flowchart direction, normalized node records, and normalized edge records.
 * Side effects: none; pure parser. Throws when the source does not produce any nodes.
 */
export function parseMermaidFlowchart(source) {
  const src = String(source ?? "");
  const rawLines = src.split(/\r?\n/g);

  let direction = "TB";
  const nodes = new Map();
  const edges = [];

  function ensureNode(id, label = null) {
    const key = cleanId(id);
    if (!key) return null;
    if (!nodes.has(key)) nodes.set(key, { id: key, label: label ?? key, shape: "rect" });
    const n = nodes.get(key);
    if (label && (!n.label || n.label === n.id)) n.label = label;
    return n;
  }

  // Header parse
  for (const l of rawLines) {
    const t = l.trim();
    if (!t) continue;
    const m = /^flowchart\s+(TB|TD|LR)\b/i.exec(t);
    if (m) {
      direction = m[1].toUpperCase();
      if (direction === "TD") direction = "TB";
    }
    break;
  }

  for (const line0 of rawLines) {
    const line = line0.trim();
    if (!line) continue;
    if (line.startsWith("%%")) continue;
    if (/^flowchart\s+/i.test(line)) continue;

    // Remove leading indentation common in examples.
    const s = line.replace(/^\s+/, "");

    // Edge forms
    //  A --> B
    //  A --- B
    //  A -->|label| B
    //  A -- label --> B

    // First attempt: pipe label form
    // We'll locate an arrow token then parse left/right around it.
    let leftPart = null;
    let rightPart = null;
    let label = null;
    let style = null;

    // Normalize some spacing
    const norm = s.replace(/\s+/g, " ");

    const chain = parseEdgeChain(norm);
    if (chain && chain.length) {
      for (const parsedEdge of chain) {
        const { leftPart: lp0, rightPart: rp0, label: label0, token } = parsedEdge;

        // Support "A -- label --> B" on the normal arrow token only.
        let lp = lp0;
        let rp = rp0;
        label = label0;

        if (token === "-->") {
          const m2 = /^(.*?)(?:--\s*(.+))?$/.exec(lp);
          if (m2) {
            lp = m2[1].trim();
            if (!label && m2[2]) label = m2[2].trim();
          }
        }

        if (token === "---" || token === "<-->") style = "line";
        else if (token === "-.->") style = "dash";
        else style = "arrow";

        const a = parseNodeToken(lp);
        const b = parseNodeToken(rp);
        if (!a || !b) continue;

        const na = ensureNode(a.id, a.label);
        const nb = ensureNode(b.id, b.label);
        if (na && a.shape) na.shape = a.shape;
        if (nb && b.shape) nb.shape = b.shape;

        // Layout should be driven by the main flow arrows only.
        const layoutIgnore = style !== "arrow";

        edges.push({ from: a.id, to: b.id, label: label || "", style, layoutIgnore });

        // Bidirectional edge becomes two render edges but does NOT participate in layout.
        if (token === "<-->") {
          edges.push({ from: b.id, to: a.id, label: label || "", style, layoutIgnore: true });
        }
      }
      continue;
    }

    // Standalone node label line: A[Label]
    const n = parseNodeToken(norm);
    if (n) {
      const nn = ensureNode(n.id, n.label);
      if (nn && n.shape) nn.shape = n.shape;
    }
  }

  if (!nodes.size) {
    throw new Error("No nodes parsed (expected flowchart TB/LR with edges)");
  }

  return {
    direction,
    nodes: Array.from(nodes.values()),
    edges,
  };
}
