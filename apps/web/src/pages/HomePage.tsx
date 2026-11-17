import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, PartyPopper, Plus, ScanLine, Sparkles, Users, X, Zap } from 'lucide-react';
import type { GameId } from '@party/protocol';
import { GAMES } from '@party/games';
import { Brand } from '../components/Brand';
import { ProfileForm } from '../components/ProfileForm';
import { saveSession } from '../hooks/usePartyRoom';
import { readSelectedGame, writeRoomGamePreference, writeSelectedGame } from '../gamePreference';
import type { PartyServices, ProfileInput } from '../services/types';

export function HomePage({ services }: { services: PartyServices }) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [code, setCode] = useState('');
  const [profile, setProfile] = useState<ProfileInput>({ nickname: '', avatar: '🦊' });
  const [error, setError] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameId>(readSelectedGame);

  const selectGame = (gameId: GameId) => {
    setSelectedGame(gameId);
    writeSelectedGame(gameId);
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile.nickname.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const session = await services.createRoom({ ...profile, nickname: profile.nickname.trim() });
      saveSession(session);
      writeRoomGamePreference(session.roomCode, selectedGame);
      navigate(`/r/${session.roomCode}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败，请稍后再重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="home-page">
      <div className="ambient-shape ambient-shape--one" /><div className="ambient-shape ambient-shape--two" />
      <header className="home-header"><Brand /><span className="home-header__tag">无需下载 · 开局即玩</span></header>

      <div className="home-layout">
        <section className="hero">
          <div className="hero__pill"><Sparkles size={15} />你的口袋聚会基地</div>
          <h1>把朋友凑在一起，<br /><span>快乐即刻开场。</span></h1>
          <p>一个房间码，一群合拍的人。手机就是手柄，<br className="desktop-only" />不用注册，也不用等人下载 App。</p>
          <div className="hero__proof">
            <span><Zap size={16} />实时联机</span><span><Users size={16} />2–12 人</span><span><PartyPopper size={16} />欢乐破冰</span>
          </div>
          <div className="hero-doodle" aria-hidden="true">
            <span className="hero-doodle__emoji hero-doodle__emoji--one">🦊</span>
            <span className="hero-doodle__emoji hero-doodle__emoji--two">🐼</span>
            <span className="hero-doodle__emoji hero-doodle__emoji--three">🐸</span>
            <div className="hero-doodle__card"><span>谁最可能</span><strong>半夜突然<br />想吃火锅？</strong><i>🗳️</i></div>
          </div>
        </section>

        <section className="entry-panel" aria-label="创建或加入派对">
          <div className="entry-panel__heading"><span>READY TO PLAY?</span><h2>今晚，玩点什么？</h2></div>
          <button className="primary-button create-party-button" type="button" aria-label="创建派对" onClick={() => setCreating(true)}>
            <span className="button-icon"><Plus size={21} /></span><span><strong>创建派对</strong><small>我来当房主，喊朋友加入</small></span><ArrowRight size={21} />
          </button>
          <div className="entry-divider"><span>或者加入朋友</span></div>
          <form onSubmit={(event) => { event.preventDefault(); if (code.length === 6) navigate(`/r/${code}`); }}>
            <label className="field-label" htmlFor="room-code">六位房间码</label>
            <div className="join-code-row">
              <input
                id="room-code"
                className="text-input code-input"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g, '').slice(0, 6))}
                placeholder="ABC234"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
              />
              <button className="secondary-button join-party-button" type="submit" disabled={code.length !== 6} aria-label="加入派对"><ScanLine size={20} /><span>加入派对</span></button>
            </div>
          </form>
          <p className="entry-panel__footnote">房间码在朋友的派对大厅里</p>
        </section>
      </div>

      <section className="home-games" aria-labelledby="game-shelf-title">
        <div className="home-games__heading">
          <div>
            <div className="eyebrow"><Sparkles size={15} />GAME SHELF</div>
            <h2 id="game-shelf-title">今晚的游戏货架</h2>
          </div>
          <span className="home-games__hint">选一个开局游戏，进房后还能在大厅换</span>
        </div>
        <div className="home-games__grid" role="radiogroup" aria-label="开局游戏">
          {GAMES.map((game) => {
            const active = selectedGame === game.id;
            return (
              <button
                key={game.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`home-game-card ${active ? 'is-active' : ''}`}
                onClick={() => selectGame(game.id as GameId)}
              >
                <span className="home-game-card__emoji">{game.emoji}</span>
                <div className="home-game-card__main">
                  <strong>{game.name}</strong>
                  <p>{game.description}</p>
                  <div className="home-game-card__tags">
                    {game.tags.map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                </div>
                <div className="home-game-card__foot">
                  <span className="home-game-card__meta"><Users size={13} />{game.minPlayers}–{game.maxPlayers} 人</span>
                  {active && <span className="home-game-card__check"><Check size={14} />开局游戏</span>}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <footer className="home-footer"><span>碰头 PARTY · v0.1</span><span>为每一个“下次一定”的今晚而做</span></footer>

      {creating && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreating(false); }}>
          <section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="create-profile-title">
            <button className="modal-close" type="button" aria-label="关闭" onClick={() => setCreating(false)}><X size={20} /></button>
            <span className="modal-eyebrow">你的派对，由你开场</span>
            <h2 id="create-profile-title">先认识一下你</h2>
            <p>昵称和头像只会出现在这场派对里。</p>
            <form onSubmit={create}>
              <ProfileForm value={profile} onChange={setProfile} idPrefix="create" />
              {error && <div className="form-error" role="alert">{error}</div>}
              <button className="primary-button modal-submit" type="submit" disabled={!profile.nickname.trim() || submitting}>
                {submitting ? '正在准备房间…' : '创建并进入房间'}<ArrowRight size={19} />
              </button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
