import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { createRecorderSession } from '../lib/api-client';

export function RecorderPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('https://example.com');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onStart(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const created = await createRecorderSession({
        url,
        ...(name.trim() ? { name: name.trim() } : {}),
      });
      navigate(`/dashboard/recorder/${created.session.id}`);
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : String(sessionError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="fc-stack">
      <h1 className="fc-h1" style={{ margin: 0, fontSize: 38 }}>
        Recorder
      </h1>

      <article className="fc-card">
        <form className="fc-stack" onSubmit={onStart}>
          <label htmlFor="recorder-name">Session Name (optional)</label>
          <input
            id="recorder-name"
            className="fc-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />

          <label htmlFor="recorder-url">Start URL</label>
          <input
            id="recorder-url"
            className="fc-input"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />

          <div>
            <button className="fc-btn-primary" type="submit" disabled={loading}>
              {loading ? 'Starting...' : 'Start Recording Session'}
            </button>
          </div>
        </form>
      </article>

      {error && <p>{error}</p>}
    </section>
  );
}
