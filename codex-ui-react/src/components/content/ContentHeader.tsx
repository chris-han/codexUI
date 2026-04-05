import type { ReactNode } from 'react';

interface ContentHeaderProps {
  title: string;
  leading?: ReactNode;
  actions?: ReactNode;
}

function ContentHeader({ title, leading, actions }: ContentHeaderProps) {
  return (
    <header className="relative z-10 flex min-h-12 w-full items-center gap-2 bg-white px-2 pb-2 pt-3 sm:min-h-14 sm:gap-3 sm:px-3 sm:pt-4">
      <div className="flex items-center gap-1">
        {leading}
      </div>
      <h1 className="m-0 min-w-0 flex-1 truncate text-sm font-medium leading-6 text-gray-900 max-sm:text-xs">
        {title}
      </h1>
      <div className="flex items-center justify-end gap-1">
        {actions}
      </div>
    </header>
  );
}

export default ContentHeader;
