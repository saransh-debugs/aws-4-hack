import type { ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';

/**
 * A collapsible dashboard section (Alerts, Event feed) below the map. Collapsed, it keeps its
 * header with an icon and a count badge, so nothing important disappears. The header is a
 * native button with aria-expanded.
 */
export function SidePanel({
  label,
  icon: Icon,
  count,
  alarm = false,
  collapsed,
  onToggle,
  className = '',
  children,
}: {
  /** Accessible name of the section, e.g. "Event feed". */
  label: string;
  icon: LucideIcon;
  count?: number;
  /** Highlight the badge (e.g. a pending alert). */
  alarm?: boolean;
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
  children: ReactNode;
}) {
  const bodyId = `panel-${label.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <aside
      aria-label={label}
      className={`panel ${collapsed ? 'panel--collapsed' : ''} ${className}`}
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        aria-label={`${collapsed ? 'Show' : 'Hide'} ${label.toLowerCase()}`}
        onClick={onToggle}
        className="panel__head"
      >
        <span className="panel__title">
          <Icon aria-hidden="true" size={14} />
          {label}
          {count !== undefined && (
            <span className={`panel__badge${alarm ? ' panel__badge--alarm' : ''}`}>{count}</span>
          )}
        </span>
        <ChevronDown
          aria-hidden="true"
          size={16}
          className={`panel__chevron ${collapsed ? '' : 'rotate-180'}`}
        />
      </button>
      {!collapsed && (
        <div id={bodyId} className="panel__body">
          {children}
        </div>
      )}
    </aside>
  );
}
