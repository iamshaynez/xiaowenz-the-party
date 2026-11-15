import { Crown } from 'lucide-react';
import type { PlayerView } from '@party/protocol';

export function PlayerGrid({ players, ownerId }: { players: PlayerView[]; ownerId: string | null }) {
  return (
    <div className="player-grid">
      {players.map((player, index) => (
        <div className={`player-card ${!player.connected ? 'is-offline' : ''}`} key={player.id} style={{ '--player-index': index } as React.CSSProperties}>
          <div className="player-card__avatar">
            <span>{player.avatar}</span>
            <i className={`presence-dot ${player.connected ? 'is-online' : ''}`} />
          </div>
          <div className="player-card__meta">
            <strong>{player.nickname}</strong>
            <span>{!player.connected ? '暂时离线' : player.role === 'spectator' ? '围观中' : player.id === ownerId ? '房主' : '已就位'}</span>
          </div>
          {player.id === ownerId && <Crown className="player-card__crown" size={17} aria-label="房主" />}
        </div>
      ))}
    </div>
  );
}
