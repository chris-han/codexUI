import { Suspense, lazy, useCallback, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useCodexStore, subscribeCodexNotifications } from './stores';
import type { RpcNotification } from './types/codex';
import DesktopLayout from './components/layout/DesktopLayout';

const ThreadConversation = lazy(() => import('./components/content/ThreadConversation'));
const SkillsHub = lazy(() => import('./components/content/SkillsHub'));
const HomeScreen = lazy(() => import('./components/content/HomeScreen'));
const SettingsPane = lazy(() => import('./components/content/SettingsPane'));

function App() {
  const store = useCodexStore();
  const {
    loadThreads,
    loadWorkspaceRootsState,
    loadSkills,
    initializeModelConfig,
    handleNotification,
    syncAll,
  } = store;

  // Memoized callbacks
  const handleNotificationCallback = useCallback((notification: RpcNotification) => {
    if (notification.method === 'ready') {
      syncAll();
      return;
    }
    handleNotification(notification);
  }, [handleNotification, syncAll]);

  // Initial load
  useEffect(() => {
    loadThreads();
    loadWorkspaceRootsState();
    loadSkills();
    initializeModelConfig();
  }, [initializeModelConfig, loadThreads, loadSkills, loadWorkspaceRootsState]);

  // Subscribe to notifications
  useEffect(() => {
    const unsubscribe = subscribeCodexNotifications(handleNotificationCallback);
    return unsubscribe;
  }, [handleNotificationCallback]);

  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        syncAll();
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [syncAll]);

  return (
    <Routes>
      <Route path="/" element={<DesktopLayout />}>
        <Route
          index
          element={(
            <Suspense fallback={<div className="p-8 text-gray-500">Loading home…</div>}>
              <HomeScreen />
            </Suspense>
          )}
        />
        <Route
          path="thread/:threadId"
          element={(
            <Suspense fallback={<div className="p-8 text-gray-500">Loading thread…</div>}>
              <ThreadConversation />
            </Suspense>
          )}
        />
        <Route
          path="skills"
          element={(
            <Suspense fallback={<div className="p-8 text-gray-500">Loading skills…</div>}>
              <SkillsHub />
            </Suspense>
          )}
        />
        <Route
          path="settings"
          element={(
            <Suspense fallback={<div className="p-8 text-gray-500">Loading settings…</div>}>
              <SettingsPane />
            </Suspense>
          )}
        />
      </Route>
    </Routes>
  );
}

export default App;
