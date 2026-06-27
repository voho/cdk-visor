import { badgeFor } from "@/lib/icons";
import type { NodeKind } from "@/lib/model";

export function Badge({
  kind,
  cfnType,
  large,
}: {
  kind: NodeKind;
  cfnType?: string;
  large?: boolean;
}) {
  const badge = badgeFor(kind, cfnType);
  return (
    <span
      className={large ? "badge lg" : "badge"}
      style={{ background: badge.color }}
      title={cfnType ?? kind}
    >
      {badge.label}
    </span>
  );
}
