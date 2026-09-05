import { useEffect } from 'react';
import type { UsageBucket, UsageSummary } from '@smart-learning/shared';

interface Props {
  open: boolean;
  onClose: () => void;
  usage: UsageSummary | null;
}

function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Sub-cent amounts are the norm here, so never round them away to "0.00". */
function money(v: number, symbol: string): string {
  if (v === 0) return `${symbol}0`;
  if (v < 0.01) return `${symbol}${v.toFixed(4)}`;
  return `${symbol}${v.toFixed(2)}`;
}

function Row({ label, b, rate }: { label: string; b: UsageBucket; rate: number }) {
  return (
    <tr>
      <td className="u__label">{label}</td>
      <td>{b.requests}</td>
      <td>{tokens(b.inputTokens)}</td>
      <td>{tokens(b.outputTokens)}</td>
      <td className={b.thoughtTokens > 0 ? 'u__think' : undefined}>{tokens(b.thoughtTokens)}</td>
      <td>{money(b.costUsd, '$')}</td>
      <td className="u__brl">
        {money(b.costUsd * rate, 'R$')}
        {b.partialCost && <span title="Some requests used a model with no known price"> *</span>}
      </td>
    </tr>
  );
}

export function Usage({ open, onClose, usage }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const rate = usage?.usdBrl ?? 5.1;
  const per = usage?.perTurn ?? null;

  return (
    <div className="scrim" onClick={onClose}>
      <div
        className="library"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Token usage"
      >
        <div className="panel__head">
          <span className="panel__title">token.ledger</span>
          <span className="panel__spacer" />
          <span className="chip chip--dim">esc to close</span>
        </div>

        <div className="library__body">
          {!usage && <div className="library__hint">loading ledger…</div>}

          {usage && usage.allTime.requests === 0 && (
            <div className="library__hint">
              No requests recorded yet. Token usage is logged from your next tutor turn onward.
            </div>
          )}

          {usage && usage.allTime.requests > 0 && (
            <>
              <table className="u">
                <thead>
                  <tr>
                    <th />
                    <th>reqs</th>
                    <th>in</th>
                    <th>out</th>
                    <th>think</th>
                    <th>usd</th>
                    <th>brl</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.session && <Row label="this session" b={usage.session} rate={rate} />}
                  <Row label="today" b={usage.today} rate={rate} />
                  <Row label="last 30 days" b={usage.last30Days} rate={rate} />
                  <Row label="all time" b={usage.allTime} rate={rate} />
                </tbody>
              </table>

              {per && (
                <div className="u__panel">
                  <div className="u__panelhead">average per tutor turn</div>
                  <div className="readouts">
                    <div className="readout readout--cyan">
                      <div className="readout__k">input</div>
                      <div className="readout__v">{tokens(per.inputTokens)}</div>
                    </div>
                    <div className="readout readout--magenta">
                      <div className="readout__k">output</div>
                      <div className="readout__v">{tokens(per.outputTokens)}</div>
                    </div>
                    <div className="readout readout--violet">
                      <div className="readout__k">thinking</div>
                      <div className="readout__v">{tokens(per.thoughtTokens)}</div>
                    </div>
                    <div className="readout readout--lime">
                      <div className="readout__k">cost</div>
                      <div className="readout__v">{money(per.costUsd * rate, 'R$')}</div>
                    </div>
                  </div>

                  <div className="u__panelhead" style={{ marginTop: 14 }}>
                    projected at this rate
                  </div>
                  <table className="u">
                    <tbody>
                      {[100, 500, 1000].map((n) => (
                        <tr key={n}>
                          <td className="u__label">{n} turns</td>
                          <td>{tokens((per.inputTokens + per.outputTokens) * n)} tokens</td>
                          <td>{money(per.costUsd * n, '$')}</td>
                          <td className="u__brl">{money(per.costUsd * n * rate, 'R$')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="u__panel">
                <div className="u__panelhead">by model</div>
                <table className="u">
                  <tbody>
                    {usage.byModel.map((m) => (
                      <tr key={m.key}>
                        <td className="u__label">{m.key}</td>
                        <td>{m.requests} reqs</td>
                        <td>{tokens(m.totalTokens)}</td>
                        <td className="u__brl">{money(m.costUsd * rate, 'R$')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {usage.byDay.length > 1 && (
                <div className="u__panel">
                  <div className="u__panelhead">recent days</div>
                  <table className="u">
                    <tbody>
                      {usage.byDay.slice(0, 7).map((d) => (
                        <tr key={d.key}>
                          <td className="u__label">{d.key}</td>
                          <td>{d.requests} reqs</td>
                          <td>{tokens(d.totalTokens)}</td>
                          <td className="u__brl">{money(d.costUsd * rate, 'R$')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="u__note">
                Thinking tokens are billed at the output rate, so they are counted in cost.
                Prices transcribed {usage.pricesAsOf}; USD→BRL fixed at {rate.toFixed(2)} (set{' '}
                <code>USD_BRL</code> in <code>.env</code>).
                {usage.unpricedModels.length > 0 && (
                  <>
                    {' '}
                    <b>*</b> no price on record for {usage.unpricedModels.join(', ')}, so those
                    requests count tokens but not cost.
                  </>
                )}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
