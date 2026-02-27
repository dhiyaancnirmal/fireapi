import { NavLink, Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom';

import { DiscoverPage } from '../pages/discover-page';
import { OverviewPage } from '../pages/overview-page';
import { RecorderPage } from '../pages/recorder-page';
import { RecorderSessionPage } from '../pages/recorder-session-page';
import { RunDetailPage } from '../pages/run-detail-page';
import { RunsPage } from '../pages/runs-page';
import { WorkflowDetailPage } from '../pages/workflow-detail-page';
import { WorkflowsPage } from '../pages/workflows-page';

function Shell() {
  return (
    <div className="fc-shell">
      <aside className="fc-sidebar">
        <h2 className="fc-h2" style={{ marginTop: 0, marginBottom: 20, fontSize: 28 }}>
          FireAPI
        </h2>
        <nav>
          <NavLink to="/dashboard" end>
            Overview
          </NavLink>
          <NavLink to="/dashboard/workflows">Workflows</NavLink>
          <NavLink to="/dashboard/runs">Runs</NavLink>
          <NavLink to="/dashboard/discover">Discover</NavLink>
          <NavLink to="/dashboard/recorder">Recorder</NavLink>
        </nav>
      </aside>
      <main className="fc-content">
        <Outlet />
      </main>
    </div>
  );
}

function WorkflowDetailRoute() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return <Navigate to="/dashboard/workflows" replace />;
  }
  return <WorkflowDetailPage workflowId={id} />;
}

function RunDetailRoute() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return <Navigate to="/dashboard/runs" replace />;
  }
  return <RunDetailPage runId={id} />;
}

function RecorderSessionRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  if (!sessionId) {
    return <Navigate to="/dashboard/recorder" replace />;
  }
  return <RecorderSessionPage sessionId={sessionId} />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Shell />}>
        <Route index element={<OverviewPage />} />
        <Route path="workflows" element={<WorkflowsPage />} />
        <Route path="workflows/:id" element={<WorkflowDetailRoute />} />
        <Route path="runs" element={<RunsPage />} />
        <Route path="runs/:id" element={<RunDetailRoute />} />
        <Route path="discover" element={<DiscoverPage />} />
        <Route path="recorder" element={<RecorderPage />} />
        <Route path="recorder/:sessionId" element={<RecorderSessionRoute />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
