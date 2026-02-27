import { useQuery } from '@tanstack/react-query';

import { fetchOverview } from '../lib/api-client';

export function OverviewPage() {
  const overview = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: fetchOverview,
    refetchInterval: 5000,
  });

  if (overview.isLoading) {
    return <p>Loading dashboard overview...</p>;
  }

  if (overview.isError) {
    return <p>Failed to load overview: {overview.error.message}</p>;
  }

  if (!overview.data) {
    return <p>No overview data available.</p>;
  }

  return (
    <section className="fc-stack">
      <h1 className="fc-h1" style={{ margin: 0, fontSize: 42 }}>
        Dashboard
      </h1>

      <div className="fc-grid">
        <article className="fc-card">
          <h3 style={{ marginTop: 0 }}>Workflows</h3>
          <p style={{ marginBottom: 0, fontSize: 26, fontWeight: 700 }}>
            {overview.data.workflowsTotal}
          </p>
        </article>
        <article className="fc-card">
          <h3 style={{ marginTop: 0 }}>Active Recorder Sessions</h3>
          <p style={{ marginBottom: 0, fontSize: 26, fontWeight: 700 }}>
            {overview.data.activeRecorderSessions}
          </p>
        </article>
        <article className="fc-card">
          <h3 style={{ marginTop: 0 }}>Running Jobs</h3>
          <p style={{ marginBottom: 0, fontSize: 26, fontWeight: 700 }}>
            {overview.data.runsByStatus.running}
          </p>
        </article>
      </div>

      <article className="fc-card">
        <h3 style={{ marginTop: 0 }}>Run Statuses</h3>
        <div className="fc-row">
          {Object.entries(overview.data.runsByStatus).map(([status, count]) => (
            <span key={status}>
              <strong>{status}</strong>: {count}
            </span>
          ))}
        </div>
      </article>

      <article className="fc-card">
        <h3 style={{ marginTop: 0 }}>Recent Runs</h3>
        {overview.data.recentRuns.length === 0 ? (
          <p>No runs yet.</p>
        ) : (
          <ul>
            {overview.data.recentRuns.map((run) => (
              <li key={run.runId}>
                {run.runId} · {run.status} · {new Date(run.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
