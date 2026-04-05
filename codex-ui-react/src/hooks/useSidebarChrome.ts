import { useCallback } from 'react';
import { useCodexStore } from '../stores';
import { useIsMobile } from './useIsMobile';

export function useSidebarChrome() {
  const isMobile = useIsMobile();
  const isSidebarCollapsed = useCodexStore((state) => state.isSidebarCollapsed);
  const isSidebarSearchVisible = useCodexStore((state) => state.isSidebarSearchVisible);
  const setSidebarCollapsed = useCodexStore((state) => state.setSidebarCollapsed);
  const toggleSidebarSearch = useCodexStore((state) => state.toggleSidebarSearch);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(!isSidebarCollapsed);
  }, [isSidebarCollapsed, setSidebarCollapsed]);

  const openSidebarSearch = useCallback(() => {
    if (isSidebarCollapsed || isMobile) {
      setSidebarCollapsed(false);
    }
    if (!isSidebarSearchVisible) {
      toggleSidebarSearch();
    }
  }, [isMobile, isSidebarCollapsed, isSidebarSearchVisible, setSidebarCollapsed, toggleSidebarSearch]);

  const closeSidebarOnMobile = useCallback(() => {
    if (isMobile) {
      setSidebarCollapsed(true);
    }
  }, [isMobile, setSidebarCollapsed]);

  return {
    isMobile,
    isSidebarCollapsed,
    isSidebarSearchVisible,
    showHeaderControls: isSidebarCollapsed || isMobile,
    setSidebarCollapsed,
    toggleSidebar,
    openSidebarSearch,
    closeSidebarOnMobile,
  };
}
