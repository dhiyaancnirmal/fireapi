import { useQuery } from '@tanstack/react-query';

import { fetchRun } from '../lib/api-client';

export interface RunDetailPageProps {
  runId: string;
}

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

export function RunDetailPage(props: RunDetailPageProps) {
  const run = useQuery({
    queryKey: ['run', props.runId],
    queryFn: () => fetchRun(props.runId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && TERMINAL.has(status) ? false : 2000;
    },
  });

  return (
    <section className="fc-stack">
      <h1 className="fc-h1" style={{ margin: 0, fontSize: 38 }}>
        Run {props.runId}
      </h1>

      {run.isLoading && <p>Loading run...</p>}
      {run.isError && <p>Failed to load run: {run.error.message}</p>}
      {run.data && (
        <article className="fc-card">
          <p>
            <strong>Status:</strong> {run.data.status}
          </p>
          <pre className="fc-json">{JSON.stringify(run.data, null, 2)}</pre>
        </article>
      )}
    </section>
  );
}
