import { Link } from 'react-router-dom';

export function WorkflowsPage() {
  return (
    <section className="fc-stack">
      <h1 className="fc-h1" style={{ margin: 0, fontSize: 38 }}>
        Workflows
      </h1>
      <article className="fc-card">
        <p style={{ marginTop: 0 }}>
          Workflow list endpoint is not part of the current API contract. Open a workflow by ID
          using the detail route.
        </p>
        <p style={{ marginBottom: 0 }}>
          Example: <Link to="/dashboard/workflows/wf-demo">/dashboard/workflows/wf-demo</Link>
        </p>
      </article>
    </section>
  );
}
