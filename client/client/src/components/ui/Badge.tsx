import { cn } from "../../lib/utils";

export function Badge({ children, variant = 'default', className }: { children: React.ReactNode, variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'running', className?: string }) {
  const variants = {
    default: 'bg-[#27272a] text-[#a1a1aa]',
    success: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    danger: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
    info: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    running: 'bg-blue-500/10 text-blue-400 border border-blue-500/30 animate-pulse',
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider", variants[variant], className)}>
      {children}
    </span>
  );
}
