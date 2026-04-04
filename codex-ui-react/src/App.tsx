import { useEffect, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useCodexStore, subscribeCodexNotifications } from './stores';
import type { RpcNotification } from './types/codex';
import DesktopLayout from './components/layout/DesktopLayout';
import ThreadConversation from './components/content/ThreadConversation';
import SkillsHub from './components/content/SkillsHub';

function App() {
  const store = useCodexStore();
  const {
    loadThreads,
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
    loadSkills();
    initializeModelConfig();
  }, [initializeModelConfig, loadThreads, loadSkills]);

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
        <Route index element={<div className="p-8 text-gray-500">Select a thread to start</div>} />
        <Route path="thread/:threadId" element={<ThreadConversation />} />
        <Route path="skills" element={<SkillsHub />} />
      </Route>
    </Routes>
  );
}

export default App;
