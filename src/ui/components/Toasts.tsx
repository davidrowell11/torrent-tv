import { useStore } from '../store';
import { Icon } from './Icon';

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          <Icon name={t.tone === 'warn' ? 'alert' : t.tone === 'good' ? 'check' : 'bell'} size={16} />
          {t.text}
        </div>
      ))}
    </div>
  );
}
