import type { ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen, SquarePen } from 'lucide-react';

interface SidebarThreadControlsProps {
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onNewThread: () => void;
  showNewThreadButton?: boolean;
  children?: ReactNode;
  className?: string;
}

function SidebarThreadControls({
  isSidebarCollapsed,
  onToggleSidebar,
  onNewThread,
  showNewThreadButton = true,
  children,
  className = '',
}: SidebarThreadControlsProps) {
  return (
    <div className={`flex flex-nowrap items-center gap-2 ${className}`.trim()}>
      <button
        type="button"
        onClick={onToggleSidebar}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent bg-transparent text-gray-600 transition hover:border-gray-200 hover:bg-gray-50"
        aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isSidebarCollapsed ? (
          <PanelLeftOpen className="h-4 w-4" strokeWidth={1.8} />
        ) : (
          <PanelLeftClose className="h-4 w-4" strokeWidth={1.8} />
        )}
      </button>
      {children}
      {showNewThreadButton ? (
        <button
          type="button"
          onClick={onNewThread}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent bg-transparent text-gray-600 transition hover:border-gray-200 hover:bg-gray-50"
          aria-label="Start new thread"
          title="Start new thread"
        >
          <SquarePen className="h-4 w-4" strokeWidth={1.8} />
        </button>
      ) : null}
    </div>
  );
}

export function SidebarToolbarAction({
  children,
  label,
  onClick,
  isActive = false,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  isActive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-md border transition ${
        isActive
          ? 'border-gray-200 bg-white text-gray-900 shadow-sm'
          : 'border-transparent bg-transparent text-gray-600 hover:border-gray-200 hover:bg-gray-50'
      }`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

export default SidebarThreadControls;
