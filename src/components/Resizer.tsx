/** A thin vertical drag handle used to resize the side panels. */
export function Resizer({
  onDragStart,
}: {
  onDragStart: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="resizer"
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onDragStart}
    />
  );
}
