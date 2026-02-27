import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';

import {
  addRecorderAction,
  fetchRecorderSession,
  finalizeRecorderSession,
  listRecorderActions,
  stopRecorderSession,
} from '../lib/api-client';

export interface RecorderSessionPageProps {
  sessionId: string;
}

function selectorFromCss(selector: string) {
  return [{ type: 'css' as const, value: selector, confidence: 0.6 }];
}

export function RecorderSessionPage(props: RecorderSessionPageProps) {
  const [selector, setSelector] = useState('button[type=submit]');
  const [fillValue, setFillValue] = useState('');
  const [fillParamRef, setFillParamRef] = useState('');
  const [navigateUrl, setNavigateUrl] = useState('');
  const [finalizeRegister, setFinalizeRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [finalizedWorkflow, setFinalizedWorkflow] = useState<Record<string, unknown> | null>(null);

  const session = useQuery({
    queryKey: ['recorder-session', props.sessionId],
    queryFn: () => fetchRecorderSession(props.sessionId),
    refetchInterval: 3000,
  });

  const actions = useQuery({
    queryKey: ['recorder-actions', props.sessionId],
    queryFn: () => listRecorderActions(props.sessionId),
    refetchInterval: 3000,
  });

  async function submitAction(action: Parameters<typeof addRecorderAction>[1]): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await addRecorderAction(props.sessionId, action);
      await Promise.all([session.refetch(), actions.refetch()]);
      setMessage(`Action recorded: ${action.type}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function onFill(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await submitAction({
      type: 'fill',
      selectors: selectorFromCss(selector),
      value: fillValue,
      ...(fillParamRef.trim() ? { parameterRef: fillParamRef.trim() } : {}),
    });
  }

  async function onNavigate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await submitAction({
      type: 'navigate',
      url: navigateUrl,
    });
  }

  async function onClick(): Promise<void> {
    await submitAction({
      type: 'click',
      selectors: selectorFromCss(selector),
    });
  }

  async function onWait(): Promise<void> {
    await submitAction({
      type: 'wait',
      condition: 'timeout',
      value: 1000,
    });
  }

  async function onFinalize(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const finalized = await finalizeRecorderSession({
        sessionId: props.sessionId,
        register: finalizeRegister,
      });
      setFinalizedWorkflow(finalized);
      await session.refetch();
      setMessage('Session finalized');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function onStop(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await stopRecorderSession(props.sessionId);
      await session.refetch();
      setMessage('Session stopped');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="fc-stack">
      <h1 className="fc-h1" style={{ margin: 0, fontSize: 38 }}>
        Recorder Session {props.sessionId}
      </h1>

      {session.isLoading && <p>Loading session...</p>}
      {session.isError && <p>Failed to load session: {session.error.message}</p>}
      {session.data && (
        <>
          <article className="fc-card">
            <p>
              <strong>Status:</strong> {session.data.session.status}
            </p>
            <p>
              <strong>Live View:</strong>{' '}
              <a href={session.data.session.liveViewUrl} target="_blank" rel="noreferrer">
                open
              </a>
            </p>
            <p>
              <strong>Current URL:</strong> {session.data.session.currentUrl}
            </p>
          </article>

          <article className="fc-card fc-stack">
            <h3 style={{ margin: 0 }}>Guided Actions</h3>

            <form className="fc-row" onSubmit={onNavigate}>
              <input
                className="fc-input"
                value={navigateUrl}
                onChange={(event) => setNavigateUrl(event.target.value)}
                placeholder="https://target-url"
              />
              <button
                className="fc-btn-primary"
                type="submit"
                disabled={busy || !navigateUrl.trim()}
              >
                Navigate
              </button>
            </form>

            <form className="fc-row" onSubmit={onFill}>
              <input
                className="fc-input"
                value={selector}
                onChange={(event) => setSelector(event.target.value)}
                placeholder="CSS selector"
              />
              <input
                className="fc-input"
                value={fillValue}
                onChange={(event) => setFillValue(event.target.value)}
                placeholder="Fill value"
              />
              <input
                className="fc-input"
                value={fillParamRef}
                onChange={(event) => setFillParamRef(event.target.value)}
                placeholder="parameterRef (optional)"
              />
              <button className="fc-btn-primary" type="submit" disabled={busy}>
                Fill
              </button>
            </form>

            <div className="fc-row">
              <button className="fc-btn-secondary" type="button" onClick={onClick} disabled={busy}>
                Click Selector
              </button>
              <button className="fc-btn-secondary" type="button" onClick={onWait} disabled={busy}>
                Wait 1s
              </button>
            </div>
          </article>

          <article className="fc-card fc-stack">
            <h3 style={{ margin: 0 }}>Finalize / Stop</h3>
            <label>
              <input
                type="checkbox"
                checked={finalizeRegister}
                onChange={(event) => setFinalizeRegister(event.target.checked)}
              />{' '}
              Register workflow while finalizing
            </label>
            <div className="fc-row">
              <button className="fc-btn-primary" type="button" onClick={onFinalize} disabled={busy}>
                Finalize
              </button>
              <button className="fc-btn-secondary" type="button" onClick={onStop} disabled={busy}>
                Stop
              </button>
            </div>
          </article>
        </>
      )}

      {message && <p>{message}</p>}

      <article className="fc-card">
        <h3 style={{ marginTop: 0 }}>Actions</h3>
        {actions.isLoading && <p>Loading actions...</p>}
        {actions.isError && <p>Failed to load actions: {actions.error.message}</p>}
        {actions.data && (
          <pre className="fc-json">{JSON.stringify(actions.data.items, null, 2)}</pre>
        )}
      </article>

      {finalizedWorkflow && (
        <article className="fc-card">
          <h3 style={{ marginTop: 0 }}>Finalized Workflow</h3>
          <pre className="fc-json">{JSON.stringify(finalizedWorkflow, null, 2)}</pre>
        </article>
      )}
    </section>
  );
}
