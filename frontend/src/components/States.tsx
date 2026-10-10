import { AlertTriangle, Inbox } from "lucide-react";
import type { ReactNode } from "react";

interface StateProps {
  title: string;
  body?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, body, action, icon }: StateProps) {
  return (
    <div className="state">
      <span aria-hidden="true" style={{ color: "var(--text-faint)" }}>
        {icon ?? <Inbox size={34} />}
      </span>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title, body, onRetry }: { title: string; body?: string; onRetry?: () => void }) {
  return (
    <div className="state">
      <span aria-hidden="true" style={{ color: "#ff7a6b" }}>
        <AlertTriangle size={34} />
      </span>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div className="list" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="track-row">
          <div className="skeleton" style={{ width: 44, height: 44 }} />
          <div className="track-main">
            <div className="skeleton" style={{ height: 12, width: `${50 + ((index * 13) % 40)}%` }} />
            <div className="skeleton" style={{ height: 10, width: `${30 + ((index * 17) % 30)}%` }} />
          </div>
          <div className="skeleton" style={{ width: 34, height: 12 }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 6 }: { count?: number }) {
  return (
    <div className="h-scroll" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="card">
          <div className="skeleton card-art" />
          <div className="skeleton" style={{ height: 12, width: "80%" }} />
          <div className="skeleton" style={{ height: 10, width: "55%" }} />
        </div>
      ))}
    </div>
  );
}
