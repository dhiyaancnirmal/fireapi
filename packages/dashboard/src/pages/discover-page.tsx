import { type FormEvent, useState } from 'react';

import type { DiscoveryResult } from '@fireapi/browser';
import { runDiscovery } from '../lib/api-client';

export function DiscoverPage() {
  const [url, setUrl] = useState('https://example.com');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiscoveryResult | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const discovered = await runDiscovery(url);
      setResult(discovered.discovery);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error ? submissionError.message : String(submissionError),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="fc-stack">
      <h1 className="fc-h1" style={{ margin: 0, fontSize: 38 }}>
        Discovery
      </h1>

      <article className="fc-card">
        <form className="fc-stack" onSubmit={onSubmit}>
          <label htmlFor="discover-url">Target URL</label>
          <input
            id="discover-url"
            className="fc-input"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <div>
            <button className="fc-btn-primary" type="submit" disabled={loading}>
              {loading ? 'Running Discovery...' : 'Run Discovery'}
            </button>
          </div>
        </form>
      </article>

      {error && <p>{error}</p>}
      {result && (
        <article className="fc-card">
          <pre className="fc-json">{JSON.stringify(result, null, 2)}</pre>
        </article>
      )}
    </section>
  );
}
