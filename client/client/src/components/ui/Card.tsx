import { ReactNode } from "react";
import { cn } from "../../lib/utils";

export function Card({ title, value, children, className }: { title?: string; value?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("bg-[#09090b] rounded-lg border border-[#27272a] p-6 flex flex-col", className)}>
      {title && <h3 className="text-xs font-semibold text-[#71717a] uppercase tracking-wider mb-2">{title}</h3>}
      {value !== undefined && <div className="text-2xl font-bold text-[#fafafa]">{value}</div>}
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}
