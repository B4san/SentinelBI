import type { ReactNode } from 'react';

export function HonestEmpty({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center py-8 px-4">
      {icon && <div className="mb-4 text-[var(--muted-foreground)]">{icon}</div>}
      <h3 className="text-base font-semibold text-[var(--foreground)]">{title}</h3>
      <p className="text-sm mt-2 max-w-md text-[var(--muted-foreground)]">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
