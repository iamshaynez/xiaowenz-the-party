import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ArrowRight, Check, Copy, LogOut, Play, QrCode, Users } from 'lucide-react';
import type { RoomView } from '@party/protocol';
import { Brand } from './Brand';
import { PlayerGrid } from './PlayerGrid';

interface LobbyProps {
  room: RoomView;
  playerId: string;
  onStart: (rounds: number) => void;
  onLeave: () => void;
  pending: boolean;
}

export function Lobby({ room, playerId, onStart, onLeave, pending }: LobbyProps) {
  const [rounds, setRounds] = useState(3);
  const [qrUrl, setQrUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const isOwner = room.ownerId === playerId;
  const playerCount = room.players.filter((player) => player.role === 'player').length;

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
          <div className="game-poster" aria-hidden="true">
            <span className="game-poster__sticker">首款游戏</span>
            <div className="game-poster__emoji">🗳️</div>
            <span className="game-poster__mini">VOTE · LAUGH · REPEAT</span>
          </div>
          <div className="game-setup-card__body">
            <span className="mini-label">WHO'S MOST LIKELY</span>
            <h2>谁最可能</h2>
            <p>一道题，一票默契。看看在朋友眼里，谁是那个“十有八九”的人。</p>
            <div className="game-rules">
              <span>3–12 人</span><span>不能投自己</span><span>平票都得分</span>
            </div>
            {isOwner ? (
              <>
                <div className="round-picker-label">玩几轮？</div>
                <div className="round-picker" aria-label="游戏轮数">
                  {[3, 5, 8].map((value) => (
                    <button key={value} type="button" className={rounds === value ? 'is-active' : ''} onClick={() => setRounds(value)}>{value} 轮</button>
                  ))}
                </div>
                <button className="primary-button start-button" type="button" disabled={playerCount < 3 || pending} onClick={() => onStart(rounds)}>
                  <Play size={19} fill="currentColor" />{pending ? '正在开局…' : '开始游戏'}<ArrowRight size={19} />
                </button>
                {playerCount < 3 && <p className="inline-hint">还差 {3 - playerCount} 位朋友就能开局</p>}
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
