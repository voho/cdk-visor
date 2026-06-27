import { highlightJson } from "@/lib/highlight";

export function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre
      className="code"
      dangerouslySetInnerHTML={{ __html: highlightJson(value) }}
    />
  );
}
