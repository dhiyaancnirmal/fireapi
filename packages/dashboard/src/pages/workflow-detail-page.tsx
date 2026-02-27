import { useQuery } from '@tanstack/react-query';

import { fetchWorkflow } from '../lib/api-client';

export interface WorkflowDetailPageProps {
  workflowId: string;
}

export function WorkflowDetailPage(props: WorkflowDetailPageProps) {
  const workflow = useQuery({
    queryKey: ['workflow', props.workflowId],
    queryFn: () => fetchWorkflow(props.workflowId),
  });

  return (
    <section className="fc-stack">
      <h1 className="fc-h1" style={{ margin: 0, fontSize: 38 }}>
        Workflow {props.workflowId}
      </h1>

      {workflow.isLoading && <p>Loading workflow...</p>}
      {workflow.isError && <p>Failed to load workflow: {workflow.error.message}</p>}
      {workflow.data && (
        <article className="fc-card">
          <pre className="fc-json">{JSON.stringify(workflow.data, null, 2)}</pre>
        </article>
      )}
    </section>
  );
}
