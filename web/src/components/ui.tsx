import clsx from "clsx";
import { Loader2, RotateCw } from "lucide-react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
};

/** Button styling, also for links that should look like buttons (e.g. a file download). */
export function buttonClass(variant: ButtonProps["variant"] = "secondary", className?: string) {
  return clsx(
    "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-55",
    variant === "primary" && "bg-accent text-accent-ink hover:bg-[#1a43b3]",
    variant === "secondary" && "border border-line-strong bg-surface text-ink hover:bg-paper",
    variant === "ghost" && "text-ink-2 hover:bg-info-soft hover:text-ink",
    className,
  );
}

export function Button({
  variant = "secondary",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button {...rest} disabled={disabled || loading} className={buttonClass(variant, className)}>
      {loading && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-16 text-center">
      <p className="text-[15px] font-medium text-conflict">Couldn&apos;t load this</p>
      <p className="mt-1 max-w-sm text-muted">{message}</p>
      {onRetry && (
        <Button className="mt-5" onClick={onRetry}>
          <RotateCw aria-hidden className="size-4" /> Try again
        </Button>
      )}
    </div>
  );
}
