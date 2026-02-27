import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { fetchRuns } from '../lib/api-client';

export function RunsPage() {
  const runs = useQuery({
    queryKey: ['runs'],
    queryFn: fetchRuns,
    refetchInterval: 3000,
  });

  return (
    <section className="fc-stack">
      <h1 className="fc-h1" style={{ margin: 0, fontSize: 38 }}>
        Runs
      </h1>

      {runs.isLoading && <p>Loading runs...</p>}
      {runs.isError && <p>Failed to load runs: {runs.error.message}</p>}
      {runs.data && (
        <article className="fc-card">
          {runs.data.items.length === 0 ? (
            <p>No runs yet.</p>
          ) : (
            <ul>
              {runs.data.items.map((run) => (
                <li key={run.runId}>
                  <Link to={`/dashboard/runs/${run.runId}`}>{run.runId}</Link> · {run.status}
                </li>
              ))}
            </ul>
          )}
        </article>
      )}
    </section>
  );
}
