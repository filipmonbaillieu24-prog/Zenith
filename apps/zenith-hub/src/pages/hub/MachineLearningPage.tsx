import React, { useEffect, useMemo, useState } from 'react';
import { Brain, ArrowRight, CircleCheck, CircleDashed, Wrench } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import { BRAIN_REGISTRY, statusFor, BrainStatus, countAllTrainingData, TrainingDataCount, DATA_SOURCES } from '@zenith/shared';
import { ModelFlowDiagram, modelState, STATE_LABEL, STATE_COLOUR } from './ModelFlowDiagram';
import './MachineLearningPage.css';

/**
 * What every model in Zenith is, what feeds it, and whether it has learned anything.
 *
 * The audit that led to this page found six models pinned at an extreme, two trained
 * on one representation and served with another, and one retrained on every login
 * whose answer was read by nothing. None of those were hard to diagnose. What was hard
 * was finding out they existed - nowhere said what the models were, what fed them, or
 * where their answers came out.
 *
 * So the page answers exactly that, from the same registry the code uses, and it is
 * blunt about the state of things: a model that has learned nothing yet says so.
 */
export const MachineLearningPage: React.FC<{ userId: string }> = ({ userId }) => {
  const [weightRows, setWeightRows] = useState<Record<string, string>>({});
  const [dataCounts, setDataCounts] = useState<Record<string, TrainingDataCount>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('ml_weights')
          .select('model_name, updated_at')
          .eq('user_id', userId);
        if (cancelled) return;
        if (err) {
          setError(err.message);
        } else {
          const rows: Record<string, string> = {};
          for (const row of data ?? []) rows[String(row.model_name)] = String(row.updated_at);
          setWeightRows(rows);
        }
        // How much of the right data this athlete actually has. "Has not learned
        // anything yet" and "has nothing to learn from" look identical without it.
        const counts = await countAllTrainingData(supabase, userId);
        if (!cancelled) setDataCounts(counts);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Could not read model status');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const statuses = useMemo(
    () => BRAIN_REGISTRY.map(entry => statusFor(entry, weightRows, dataCounts)),
    [weightRows, dataCounts]
  );

  const models = statuses.filter(s => s.entry.kind !== 'rule' && s.entry.kind !== 'feedback');
  const feedback = statuses.filter(s => s.entry.kind === 'feedback');
  const rules = statuses.filter(s => s.entry.kind === 'rule');
  const trained = models.filter(s => s.hasStoredWeights).length;
  const learning = models.filter(s => (s.learnedShift ?? 0) > 0.01).length;

  const relativeDate = (iso: string | null): string => {
    if (!iso) return 'never';
    const days = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days} days ago`;
    return new Date(iso).toLocaleDateString();
  };

  return (
    <div className="zh-ml-page">
      <header className="zh-ml-head">
        <div className="zh-ml-title">
          <Brain size={20} />
          <h2>Machine learning</h2>
        </div>
        <p>
          Every model in Zenith, what feeds it, where its answer comes out, and whether it
          has learned anything from you yet.
        </p>
      </header>

      {error && <div className="zh-ml-error">Could not read model status: {error}</div>}

      <section className="zh-ml-map">
        <h3>How it all connects</h3>
        <p>
          Every model, what it reads on the left, and where its answer comes out on the
          right. The colour is its state.
        </p>
        <ModelFlowDiagram statuses={statuses} />
      </section>

      <div className="zh-ml-tally">
        <div>
          <strong>{models.length}</strong>
          <span>models</span>
        </div>
        <div>
          <strong>{loading ? '–' : trained}</strong>
          <span>{trained === 1 ? 'has stored weights' : 'have stored weights'}</span>
        </div>
        <div>
          <strong>{loading ? '–' : learning}</strong>
          <span>{learning === 1 ? 'has moved off its starting point' : 'have moved off their starting point'}</span>
        </div>
        <div>
          <strong>{feedback.length}</strong>
          <span>{feedback.length === 1 ? 'learns when you correct it' : 'learn when you correct them'}</span>
        </div>
        <div>
          <strong>{rules.length}</strong>
          <span>are rules, not models</span>
        </div>
      </div>

      <div className="zh-ml-cards">
        {models.map(status => (
          <ModelCard key={status.entry.id} status={status} relativeDate={relativeDate} loading={loading} />
        ))}
      </div>

      <h3 className="zh-ml-section">Learn when you correct them</h3>
      <p className="zh-ml-section-note">
        These adjust the moment you disagree with them &mdash; relabel a ride, pick a different
        session than the one suggested, fix what it read in your notes. There is no training
        set to count, because the correction is applied to the weights and never written down
        as a row. So the only honest status is whether they have been corrected at all.
      </p>
      <div className="zh-ml-cards">
        {feedback.map(status => (
          <ModelCard key={status.entry.id} status={status} relativeDate={relativeDate} loading={loading} />
        ))}
      </div>

      <h3 className="zh-ml-section">Deliberately not models</h3>
      <p className="zh-ml-section-note">
        These answer their question with arithmetic anyone can read. Two of them used to be
        networks and were worse for it.
      </p>
      <div className="zh-ml-cards">
        {rules.map(status => (
          <RuleCard key={status.entry.id} status={status} />
        ))}
      </div>
    </div>
  );
};

const Flow: React.FC<{ reads: BrainStatus['entry']['reads']; surfaces: string[] }> = ({ reads, surfaces }) => (
  <div className="zh-ml-flow">
    <div className="zh-ml-flow-col">
      <span className="zh-ml-flow-label">Reads</span>
      {reads.map(r => {
        const src = DATA_SOURCES[r.source];
        return (
          <span key={r.source} className="zh-ml-read">
            <strong>{src.label}</strong>
            <em>{src.table}</em>
            {/* What exactly is taken from it - the difference between "reads sleep"
                and "reads the deep and REM share of it". */}
            <span>{r.fields}</span>
          </span>
        );
      })}
    </div>
    <ArrowRight size={16} className="zh-ml-arrow" />
    <div className="zh-ml-flow-col">
      <span className="zh-ml-flow-label">Shows up in</span>
      {surfaces.map(s => <span key={s} className="zh-ml-pill zh-ml-pill-out">{s}</span>)}
    </div>
  </div>
);

const ModelCard: React.FC<{
  status: BrainStatus;
  relativeDate: (iso: string | null) => string;
  loading: boolean;
}> = ({ status, relativeDate, loading }) => {
  const { entry, learnedShift, fitError, examples, lastTrainedAt, data } = status;
  const hasLearned = (learnedShift ?? 0) > 0.01;
  const state = modelState(status);
  const training = entry.training;

  return (
    <section className="zh-ml-card">
      <div className="zh-ml-card-head">
        <div>
          <h3>{entry.name}</h3>
          <p className="zh-ml-answers">{entry.answers}</p>
        </div>
        <span
          className="zh-ml-state"
          style={{ color: STATE_COLOUR[state], background: `${STATE_COLOUR[state]}1f` }}
        >
          {hasLearned ? <CircleCheck size={13} /> : <CircleDashed size={13} />}
          {STATE_LABEL[state]}
        </span>
      </div>

      <Flow reads={entry.reads} surfaces={entry.surfaces} />

      <div className="zh-ml-metrics">
        <div>
          <span className="zh-ml-metric-label">Last trained</span>
          <strong>{loading ? '–' : relativeDate(lastTrainedAt)}</strong>
        </div>
        {fitError !== null && (
          <div>
            <span className="zh-ml-metric-label">
              Starting point matches its rule
              <span className="zh-ml-hint">
                Untrained, the model answers what a written-down formula says. Anything above
                a few percent here is a bug, and the model refuses to build.
              </span>
            </span>
            <strong>{(100 - fitError * 100).toFixed(1)}%</strong>
          </div>
        )}
        {learnedShift !== null && (
          <div>
            <span className="zh-ml-metric-label">
              Moved from that starting point
              <span className="zh-ml-hint">
                How far its answers now differ from the formula it started at. Zero means it
                has seen nothing worth changing its mind about yet.
              </span>
            </span>
            <strong>{(learnedShift * 100).toFixed(1)}%</strong>
          </div>
        )}
        {entry.kind === 'legacy-model' && (
          <div>
            <span className="zh-ml-metric-label">Format</span>
            <strong className="zh-ml-legacy">Hand-weighted</strong>
          </div>
        )}
      </div>

      {training && (
        <div className="zh-ml-training">
          <div className="zh-ml-training-head">
            <span className="zh-ml-flow-label">Trained on</span>
            <span>{training.sample}</span>
          </div>

          {training.minimumUseful === 0 ? (
            <p className="zh-ml-training-note">
              Nothing about you moves this one. It answers a formula that was checked
              against real rides, and there is no pipeline feeding it your history &mdash;
              which is a deliberate state, not a queue it is waiting in.
            </p>
          ) : data === null ? (
            <p className="zh-ml-training-note">Counting&hellip;</p>
          ) : data.usable < 0 ? (
            <p className="zh-ml-training-note">Could not read the training data.</p>
          ) : (
            <>
              <div className="zh-ml-progress">
                <div
                  style={{
                    width: `${Math.min(100, (data.usable / training.minimumUseful) * 100)}%`,
                    background: STATE_COLOUR[state]
                  }}
                />
              </div>
              <p className="zh-ml-training-note">
                <strong>{data.usable}</strong> usable of {data.considered} looked at
                {' '}&middot; needs about {training.minimumUseful}
                {data.oldest && data.newest && (
                  <> &middot; {String(data.oldest).slice(0, 10)} to {String(data.newest).slice(0, 10)}</>
                )}
                {training.tables.length > 0 && (
                  <>
                    {' '}&middot; from{' '}
                    {/* JSX escapes strings, so joining on a tag printed the tag. */}
                    {training.tables.map((table, i) => (
                      <React.Fragment key={table}>
                        {i > 0 && ', '}
                        <code>{table}</code>
                      </React.Fragment>
                    ))}
                  </>
                )}
              </p>
              {data.note && <p className="zh-ml-training-note warn">{data.note}</p>}
            </>
          )}
        </div>
      )}

      {examples.length > 0 && (
        <details className="zh-ml-examples">
          <summary>What it answers right now</summary>
          <table>
            <thead>
              <tr><th>Given</th><th>Its rule says</th><th>It says</th></tr>
            </thead>
            <tbody>
              {examples.map((ex, i) => (
                <tr key={i}>
                  <td>{ex.inputs}</td>
                  <td className="num">{ex.reference}</td>
                  <td className="num">{ex.current}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {entry.declared && (
        <p className="zh-ml-key">
          Stored as <code>{entry.storageKey}</code> · inputs:{' '}
          {entry.declared.declaration.inputs.map(i => i.name).join(', ')}
        </p>
      )}
    </section>
  );
};

const RuleCard: React.FC<{ status: BrainStatus }> = ({ status }) => (
  <section className="zh-ml-card zh-ml-rule">
    <div className="zh-ml-card-head">
      <div>
        <h3>{status.entry.name}</h3>
        <p className="zh-ml-answers">{status.entry.answers}</p>
      </div>
      <span className="zh-ml-state rule"><Wrench size={13} /> Rule</span>
    </div>
    <Flow reads={status.entry.reads} surfaces={status.entry.surfaces} />
    {status.entry.whyNotAModel && (
      <p className="zh-ml-why">{status.entry.whyNotAModel}</p>
    )}
  </section>
);
