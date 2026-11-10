import React, { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { TodayDashboard } from './features/dashboard/TodayDashboard';
import { TaskListScreen } from './features/tasks/TaskListScreen';
import { AnalyticsScreen } from './features/analytics/AnalyticsScreen';
import { RulesScreen } from './features/rules/RulesScreen';
import { DiagnosticsScreen } from './features/diagnostics/DiagnosticsScreen';
import { StartSessionModal } from './features/sessions/StartSessionModal';
import { OutcomeVerificationModal } from './features/sessions/OutcomeVerificationModal';
import { ActiveSessionBar } from './features/sessions/ActiveSessionBar';
import { AlwaysOnTopWidgetView } from './features/widget/AlwaysOnTopWidgetView';
import { useDashboardStore } from './stores/useDashboardStore';
import { useSessionStore } from './stores/useSessionStore';
import { dbService } from './services/db';

export function App() {
  const isWidgetWindow =
    window.location.hash === '#/widget' ||
    (typeof window !== 'undefined' &&
      '__TAURI_INTERNALS__' in window &&
      window.location.href.includes('#/widget'));

  if (isWidgetWindow) {
    return <AlwaysOnTopWidgetView />;
  }

  const [currentTab, setCurrentTab] = useState<'dashboard' | 'tasks' | 'analytics' | 'rules' | 'diagnostics'>('dashboard');
  const { refreshDashboard } = useDashboardStore();
  const { loadActiveSession, tickTimer, activeSession, pollBridge } = useSessionStore();

  useEffect(() => {
    // Initialize Database and Load Session
    dbService.init().then(async () => {
      await loadActiveSession();
    });

    // Initial Dashboard Fetch
    refreshDashboard();

    // Auto-refresh ActivityWatch data every 10 seconds
    const interval = setInterval(() => {
      refreshDashboard();
    }, 10000);

    return () => clearInterval(interval);
  }, [refreshDashboard, loadActiveSession]);

  useEffect(() => {
    // Keep this window and the bridge in agreement: picks up results submitted from the
    // extension, and adopts a session started elsewhere. Runs for the life of the app.
    const poll = setInterval(() => {
      pollBridge();
    }, 3000);
    return () => clearInterval(poll);
  }, [pollBridge]);

  useEffect(() => {
    // Timer tick every 1 second when session is active
    if (!activeSession) return;
    tickTimer(); // Call immediately on active session change
    const timer = setInterval(() => {
      tickTimer();
    }, 1000);

    const handleFocus = () => {
      tickTimer();
      refreshDashboard();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [activeSession, tickTimer, refreshDashboard]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header currentTab={currentTab} setTab={setCurrentTab} />
      <ActiveSessionBar />

      <main className="flex-1 p-6">
        {currentTab === 'dashboard' && <TodayDashboard />}
        {currentTab === 'tasks' && <TaskListScreen />}
        {currentTab === 'analytics' && <AnalyticsScreen />}
        {currentTab === 'rules' && <RulesScreen />}
        {currentTab === 'diagnostics' && <DiagnosticsScreen />}
      </main>

      <StartSessionModal />
      <OutcomeVerificationModal />
    </div>
  );
}

export default App;
