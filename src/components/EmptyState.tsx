import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
      <Icon className="h-8 w-8" />
      <p className="text-sm">{title}</p>
    </div>
  );
}
