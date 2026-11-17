import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, LoaderCircle } from 'lucide-react';
import { Brand } from '../components/Brand';
import { ConnectionNotice } from '../components/ConnectionNotice';
import { GamePanel } from '../components/GamePanel';
import { Lobby } from '../components/Lobby';
import { ProfileForm } from '../components/ProfileForm';
import { usePartyRoom } from '../hooks/usePartyRoom';
import type { PartyServices, ProfileInput } from '../services/types';

export function RoomPage({ services }: { services: PartyServices }) {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const normalizedCode = code.toUpperCase();
  const party = usePartyRoom(normalizedCode, services);
  const [profile, setProfile] = useState<ProfileInput>({ nickname: '', avatar: '🦊' });

  if (!party.session) {
    return (
      <main className="join-page">
        <header className="join-page__header"><button className="icon-button" type="button" aria-label="返回首页" onClick={() => navigate('/')}><ArrowLeft size={20} /></button><Brand compact /><span /></header>
        <section className="join-card">
          <span className="join-card__icon">👋</span>
          <div className="eyebrow">YOU'RE INVITED</div>
          <h1>加入这场派对</h1>
          <p>房间 <strong>{normalizedCode}</strong> 正在等你，<br />留个昵称就能和大家碰头。</p>
          <form onSubmit={(event) => { event.preventDefault(); if (profile.nickname.trim()) void party.join({ ...profile, nickname: profile.nickname.trim() }); }}>
            <ProfileForm value={profile} onChange={setProfile} idPrefix="join" />
            {party.error && <div className="form-error" role="alert">{party.error}</div>}
            <button className="primary-button modal-submit" type="submit" disabled={!profile.nickname.trim() || party.joining}>
              {party.joining ? '正在加入…' : '加入房间'}<ArrowRight size={19} />
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (!party.room) {
    return <main className="loading-page"><Brand /><LoaderCircle className="spin" size={30} /><p>正在找回派对现场…</p></main>;
  }

  return (
    <>
      <ConnectionNotice reconnecting={party.status === 'reconnecting'} />
      {party.error && <div className="toast" role="alert">{party.error}</div>}
      {party.room.game ? (
        <GamePanel room={party.room} playerId={party.playerId} onAction={party.act} onEndGame={party.endGame} pending={party.pending} serverClockOffsetMs={party.serverClockOffsetMs} />
      ) : (
        <Lobby room={party.room} playerId={party.playerId} onStart={party.start} onLeave={() => { party.leave(); navigate('/'); }} pending={party.pending} />
      )}
    </>
  );
}
