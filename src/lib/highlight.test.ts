import { describe, expect, it } from "vitest";
import { escapeHtml, highlightJson, highlightTsLine } from "@/lib/highlight";

/** Strip span markup, leaving just the (escaped) text content. */
const stripTags = (html: string) => html.replace(/<\/?span[^>]*>/g, "");

describe("highlightJson", () => {
  it("tags keys, strings, numbers, booleans and null", () => {
    const html = highlightJson({ a: 1, b: "x", c: true, d: null });
    expect(html).toContain('<span class="tok-key">"a":</span>');
    expect(html).toContain('<span class="tok-num">1</span>');
    expect(html).toContain('<span class="tok-str">"x"</span>');
    expect(html).toContain('<span class="tok-bool">true</span>');
    expect(html).toContain('<span class="tok-null">null</span>');
  });
});

describe("highlightTsLine", () => {
  const line = "const x = new Table(this, 'id'); // make a table";

  it("does not corrupt the source text (regression for nested markup)", () => {
    // Removing the markup must yield exactly the escaped original — proving no
    // tag attributes (like class="...") leaked into the rendered output.
    expect(stripTags(highlightTsLine(line))).toBe(escapeHtml(line));
  });

  it("tags keywords, types, strings and comments", () => {
    const html = highlightTsLine(line);
    expect(html).toContain('<span class="tok-key">const</span>');
    expect(html).toContain('<span class="tok-key">new</span>');
    expect(html).toContain('<span class="tok-type">Table</span>');
    expect(html).toContain("<span class=\"tok-str\">'id'</span>");
    expect(html).toContain('<span class="tok-comment">// make a table</span>');
  });

  it("escapes HTML in the source", () => {
    expect(stripTags(highlightTsLine("a < b && c > d"))).toBe("a &lt; b &amp;&amp; c &gt; d");
  });
});
