import { Sparkles } from 'lucide-react';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`} aria-label="碰头 Party">
      <span className="brand__mark"><Sparkles size={20} strokeWidth={2.6} /></span>
      <span className="brand__name">碰头</span>
      <span className="brand__dot">·</span>
      <span className="brand__english">PARTY</span>
    </div>
  );
}
