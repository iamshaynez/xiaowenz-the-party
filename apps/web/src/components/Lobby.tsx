import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ArrowRight, Check, Copy, LogOut, Play, QrCode, Users } from 'lucide-react';
import type { GameId, RoomView } from '@party/protocol';
import { GAMES } from '@party/games';
import { Brand } from './Brand';
import { PlayerGrid } from './PlayerGrid';
import { readRoomGamePreference } from '../gamePreference';

interface LobbyProps {
  room: RoomView;
  playerId: string;
  onStart: (gameId: GameId, rounds: number) => void;
  onLeave: () => void;
  pending: boolean;
}

export function Lobby({ room, playerId, onStart, onLeave, pending }: LobbyProps) {
  const [gameId, setGameId] = useState<GameId>(() => readRoomGamePreference(room.code));
  const [rounds, setRounds] = useState(() => GAMES.find((game) => game.id === readRoomGamePreference(room.code))?.roundsOptions[0] ?? 3);
  const [qrUrl, setQrUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const isOwner = room.ownerId === playerId;
  const playerCount = room.players.filter((player) => player.role === 'player').length;
  const selected = GAMES.find((game) => game.id === gameId) ?? GAMES[0]!;
  const selectedId = selected.id as GameId;
  // 在场人数能玩的游戏排前面，等的或超员的沉底，方便游戏变多后快速选中能开局的。
  const fitsPlayerCount = (game: (typeof GAMES)[number]) =>
    playerCount >= game.minPlayers && playerCount <= game.maxPlayers;
  const orderedGames = [...GAMES].sort((a, b) => Number(fitsPlayerCount(b)) - Number(fitsPlayerCount(a)));

  useEffect(() => {
    void QRCode.toDataURL(window.location.href, {
      width: 360,
      margin: 2,
      color: { dark: '#151a2d', light: '#efff72' },
      errorCorrectionLevel: 'M',
    }).then(setQrUrl);
  }, [room.code]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    } catch {
      // The visible code remains selectable when clipboard permission is unavailable.
    }
  };

  return (
    <main className="room-shell lobby">
      <header className="room-topbar">
        <Brand compact />
        <button className="icon-text-button" type="button" onClick={onLeave}><LogOut size={17} />离开房间</button>
      </header>

      <div className="lobby-layout">
        <section className="lobby-main">
          <div className="eyebrow"><span className="live-dot" />PARTY LOBBY</div>
          <h1>人都到齐了吗？</h1>
          <p className="section-intro">把房间码发给朋友，或者让大家扫一扫。</p>

          <div className="room-share-card">
            <div className="room-share-card__content">
              <span className="mini-label"><QrCode size={15} />房间码</span>
              <span className="room-code__value">{room.code}</span>
              <button className="copy-button" type="button" onClick={copyCode}>
                {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? '已复制' : '复制房间码'}
              </button>
            </div>
            <div className="qr-frame">
              {qrUrl && <img src={qrUrl} alt="房间二维码" />}
              <span>手机扫一扫，直接进房</span>
            </div>
          </div>

          <section className="players-section">
            <div className="section-heading">
              <h2><Users size={19} />{playerCount} / 12 位朋友</h2>
              <span>绿色表示在线</span>
            </div>
            <PlayerGrid players={room.players} ownerId={room.ownerId} />
          </section>
        </section>

        <aside className="game-setup-card">
          <div className="game-picker" role="radiogroup" aria-label="选择游戏">
            {orderedGames.map((game) => (
              <button
                key={game.id}
                type="button"
                role="radio"
                aria-checked={gameId === game.id}
                className={`game-option ${gameId === game.id ? 'is-active' : ''}`}
                onClick={() => {
                  setGameId(game.id as GameId);
                  setRounds(game.roundsOptions[0]!);
                }}
              >
                <span className="game-option__emoji">{game.emoji}</span>
                <strong>{game.name}</strong>
                <span className="game-option__meta">{game.minPlayers}–{game.maxPlayers} 人</span>
                {game.minPlayers > playerCount
                  ? <span className="game-option__badge">还差 {game.minPlayers - playerCount} 人</span>
                  : game.maxPlayers < playerCount
                    ? <span className="game-option__badge">限 {game.maxPlayers} 人</span>
                    : null}
                {gameId === game.id && <span className="game-option__check"><Check size={14} /></span>}
              </button>
            ))}
          </div>
          <div className="game-setup-card__body">
            <span className="mini-label">{selected.englishName}</span>
            <h2>{selected.name}</h2>
            <p>{selected.description}</p>
            <p className="game-duration">约 {rounds * selected.minutesPerRound} 分钟</p>
            <div className="game-tags">
              {selected.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
            <div className="game-rules">
              {selected.rules.map((rule) => <span key={rule}>{rule}</span>)}
            </div>
            {isOwner ? (
              <>
                {selected.roundsOptions.length > 1 && (
                  <>
                    <div className="round-picker-label">玩几轮？</div>
                    <div className="round-picker" aria-label="游戏轮数">
                      {selected.roundsOptions.map((value) => (
                        <button key={value} type="button" className={rounds === value ? 'is-active' : ''} onClick={() => setRounds(value)}>{value} 轮</button>
                      ))}
                    </div>
                  </>
                )}
                <button className="primary-button start-button" type="button" disabled={playerCount < selected.minPlayers || playerCount > selected.maxPlayers || pending} onClick={() => onStart(selectedId, rounds)}>
                  <Play size={19} fill="currentColor" />{pending ? '正在开局…' : '开始游戏'}<ArrowRight size={19} />
                </button>
                {playerCount < selected.minPlayers && <p className="inline-hint">还差 {selected.minPlayers - playerCount} 位朋友就能开局</p>}
                {playerCount > selected.maxPlayers && <p className="inline-hint">「{selected.name}」最多 {selected.maxPlayers} 位玩家，请选择其他游戏</p>}
              </>
            ) : (
              <div className="waiting-owner"><span className="waiting-owner__dots"><i /><i /><i /></span>等房主开局，可以先热个身。</div>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
