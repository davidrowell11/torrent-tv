import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface Choice<T extends string> {
  value: T;
  label: string;
  tone?: 'danger' | 'primary' | 'ghost';
}
interface Ask {
  title: string;
  body?: string;
  choices: Choice<string>[];
  resolve(v: string | null): void;
}

const Ctx = createContext<(<T extends string>(title: string, body: string | undefined, choices: Choice<T>[]) => Promise<T | null>) | null>(null);

/** Promise-based confirmation sheet: `const v = await confirm('Delete?', 'This can't be undone', [...])`. */
export function useConfirm() {
  const c = useContext(Ctx);
  if (!c) throw new Error('ConfirmProvider missing');
  return c;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const confirm = useCallback(
    <T extends string>(title: string, body: string | undefined, choices: Choice<T>[]) =>
      new Promise<T | null>((resolve) => setAsk({ title, body, choices, resolve: resolve as (v: string | null) => void })),
    [],
  );
  const close = (v: string | null) => {
    ask?.resolve(v);
    setAsk(null);
  };
  return (
    <Ctx.Provider value={confirm}>
      {children}
      {ask && (
        <div className="modal-backdrop confirm-backdrop" onClick={() => close(null)}>
          <div className="confirm" role="alertdialog" aria-modal="true" aria-label={ask.title} onClick={(e) => e.stopPropagation()}>
            <h3>{ask.title}</h3>
            {ask.body && <p className="muted">{ask.body}</p>}
            <div className="confirm-actions">
              {ask.choices.map((c) => (
                <button key={c.value} className={`btn ${c.tone === 'danger' ? 'danger' : c.tone === 'primary' ? 'primary' : 'ghost'}`} onClick={() => close(c.value)}>
                  {c.label}
                </button>
              ))}
              <button className="btn subtle" onClick={() => close(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
