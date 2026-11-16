import { Check, Clock3, Paintbrush, PartyPopper, Play, RotateCcw, Users, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CAR_PARTS, CAN_DRIVE_SLOTS } from '@party/games';
import type { CanDriveSlot, CanDriveView } from '@party/games';
import { Brand } from '../../components/Brand';
import type { GamePanelProps } from '../../components/MostLikelyPanel';
import { playerNameOf } from '../../components/playerDisplay';
import { CarGameViewport } from './CarGameViewport';
import './CanDrivePanel.css';

const SLOT_LABELS: Record<CanDriveSlot, string> = {
  driver: '司机', motion: '运动件', front: '车头', rear: '车尾', roof: '车顶',
};

export function CanDrivePanel({ room, playerId, onAction, pending }: GamePanelProps) {
  const game = room.game as CanDriveView;
  const [slot, setSlot] = useState<CanDriveSlot>('driver');
  const playerName = (id: string) => playerNameOf(room.players, id);
  const isOwner = room.ownerId === playerId;

  return (
    <main className="cd-panel">
      <header className="room-topbar cd-topbar">
        <Brand compact />
        <div className="cd-round"><Wrench size={15} />第 {game.round} 次改装</div>
        <div className="cd-count"><Users size={15} />{game.totalCars} 辆怪车</div>
      </header>

      {game.phase === 'building' && (
        <div className="cd-builder">
          <section className="cd-garage">
            <div className="cd-section-label"><Paintbrush size={15} />你的怪车改装台</div>
            {game.ownBuild ? (
              <CarGameViewport mode="garage" build={game.ownBuild} show={null} startedAt={null} cars={[]} />
            ) : (
              <div className="cd-spectator">你正在围观，下一局就能来改装。</div>
            )}
            <div className="cd-garage-caption">
              <span>{game.ownReady ? <><Check size={16} />已经准备好了</> : '每个部位都能换，没有装错这回事'}</span>
              {game.buildDeadlineAt !== null && <Countdown endsAt={game.buildDeadlineAt} />}
            </div>
          </section>

          {game.ownBuild && (
            <section className="cd-parts" aria-label="零件选择">
              <div className="cd-slot-tabs" role="tablist" aria-label="车辆部位">
                {CAN_DRIVE_SLOTS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="tab"
                    aria-selected={slot === item}
                    className={slot === item ? 'is-active' : ''}
                    onClick={() => setSlot(item)}
                  >{SLOT_LABELS[item]}</button>
                ))}
              </div>
              <div className="cd-part-grid" role="tabpanel" aria-label={SLOT_LABELS[slot]}>
                {CAR_PARTS[slot].map((part) => {
                  const selected = game.ownBuild?.[slot] === part.id;
                  return (
                    <button
                      key={part.id}
                      type="button"
                      className={`cd-part ${selected ? 'is-selected' : ''}`}
                      aria-pressed={selected}
                      aria-label={`${SLOT_LABELS[slot]}：${part.name}`}
                      disabled={pending}
                      onClick={() => onAction({ type: 'select-car-part', slot, partId: part.id })}
                    >
                      <span className="cd-part__icon" aria-hidden="true">{part.icon}</span>
                      <strong>{part.name}</strong>
                      {selected && <Check size={15} />}
                    </button>
                  );
                })}
              </div>
              <div className="cd-ready-row">
                <span>{game.readyPlayerIds.length} / {game.totalCars} 已准备好</span>
                <button
                  className="primary-button"
                  type="button"
                  disabled={pending || game.ownReady}
                  onClick={() => onAction({ type: 'submit-car' })}
                >
                  <Play size={18} fill="currentColor" />{game.ownReady ? '等待其他朋友' : '准备好了'}
                </button>
              </div>
              {game.ownReady && <p className="cd-ready-hint">想再改也可以，改装会重新取消准备。</p>}
            </section>
          )}
        </div>
      )}

      {game.phase === 'presenting' && game.current && (
        <div className="cd-show-layout">
          <section className="cd-show-stage">
            <div className="cd-show-heading">
              <div>
                <span className="cd-section-label">{game.current.kind === 'test' ? `第 ${game.current.index + 1} 辆 · 怪车测试` : '高光颁奖'}</span>
                <h1>{playerName(game.current.playerId)}的车</h1>
              </div>
              <Countdown endsAt={game.current.endsAt} />
            </div>
            <CarGameViewport
              mode={game.current.kind === 'award' ? 'award' : 'show'}
              build={game.current.show.build}
              show={game.current.show}
              startedAt={game.current.startedAt}
              cars={[]}
            />
            {game.current.kind === 'award' && game.current.award && (
              <div className="cd-award-reveal" role="status">
                <span>{game.current.award.icon}</span>
                <div><small>获得</small><h2>{game.current.award.name}</h2><p>{game.current.award.description}</p></div>
              </div>
            )}
          </section>
          <CarQueue game={game} playerName={playerName} />
        </div>
      )}

      {game.phase === 'finished' && (
        <div className="cd-finale">
          <section className="cd-group-stage">
            <span className="cd-section-label"><PartyPopper size={16} />怪车合影</span>
            <h1>每辆车，都有自己的节目。</h1>
            <CarGameViewport mode="group" build={null} show={null} startedAt={null} cars={game.finalCars} />
          </section>
          <section className="cd-final-awards" aria-label="全部奖项">
            {game.finalCars.map((car) => (
              <article key={car.playerId} className="cd-final-award">
                <span>{car.icon}</span>
                <div><strong>{playerName(car.playerId)}</strong><h2>{car.name}</h2><p>{car.description}</p></div>
              </article>
            ))}
          </section>
          {isOwner ? (
            <button className="primary-button cd-again" type="button" disabled={pending} onClick={() => onAction({ type: 'play-again' })}>
              <RotateCcw size={18} />保留车辆，再改一局
            </button>
          ) : <p className="cd-waiting">想再玩一次？催催房主。</p>}
        </div>
      )}
    </main>
  );
}

function CarQueue({ game, playerName }: { game: CanDriveView; playerName: (id: string) => string }) {
  const current = game.current;
  if (!current) return null;
  return (
    <aside className="cd-queue" aria-label="车辆展示顺序">
      <span className="cd-section-label">出场顺序</span>
      {game.orderPlayerIds.map((playerId, index) => {
        const award = game.awards.find((item) => item.playerId === playerId);
        const done = current.kind === 'award' || index < current.index;
        const active = index === current.index;
        return (
          <div key={playerId} className={`cd-queue-item ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}>
            <span className="cd-queue-number">{String(index + 1).padStart(2, '0')}</span>
            <div><strong>{playerName(playerId)}</strong><span>{active ? '正在出场' : done ? '测试完成' : '等待出场'}</span></div>
            {award && <span title={award.name}>{award.icon}</span>}
          </div>
        );
      })}
    </aside>
  );
}

function Countdown({ endsAt }: { endsAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [endsAt]);
  const seconds = Math.max(0, Math.ceil((endsAt - now) / 1_000));
  return <span className="cd-countdown"><Clock3 size={15} />{seconds} 秒</span>;
}
