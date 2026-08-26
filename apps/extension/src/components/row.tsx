import type { ReactNode } from "react";

export interface TableItem {
  label: string;
  value: ReactNode;
  mono?: boolean;
}

export function DataTable({ items }: { items: TableItem[] }) {
  return (
    <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-x-2 gap-y-1 text-sm">
      {items.map((item, i) => (
        <Row key={i} label={item.label} value={item.value} mono={item.mono} />
      ))}
    </div>
  );
}

export function Row({ label, value, mono }: TableItem) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <div className={`min-w-0 break-all ${mono ? "font-mono" : ""}`}>{value}</div>
    </>
  );
}
