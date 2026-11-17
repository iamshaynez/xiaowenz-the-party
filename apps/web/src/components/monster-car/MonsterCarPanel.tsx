import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Check, Maximize2, RotateCcw, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { MONSTER_CAR_PART_IDS, MONSTER_CAR_SLOTS } from '@party/protocol';
import type { MonsterCarBuild, MonsterCarSlot } from '@party/protocol';
import { MONSTER_CAR_PART_CATALOG, RACE_DURATION_MS, sampleMonsterCarFrame } from '@party/games';
import type { MonsterCarRaceFrame, MonsterCarView } from '@party/games';
import { Brand } from '../Brand';
import { playerAvatarOf, playerNameOf } from '../playerDisplay';
import type { GamePanelProps } from '../gamePanelTypes';
import { MonsterCarCanvas } from './MonsterCarCanvas';
import { PartThumbnail } from './PartThumbnail';
import { Soundscape } from './rendering/Soundscape';
import { surpriseCarBuild } from './garage';
import { createCarIdentity } from './rendering/presentation/CarIdentity';
import { createMonsterCarShowPlan } from './rendering/presentation/ShowPlan';
import { sampleSocialMoment } from './rendering/presentation/SocialMoments';

const SLOT_LABELS: Record<MonsterCarSlot, { label: string; emoji: string }> = {
  wheels: { label: '轮子', emoji: '🛞' },
  front: { label: '车头', emoji: '🚗' },
  rear: { label: '车尾', emoji: '🧳' },
  roof: { label: '车顶', emoji: '☂️' },
  driver: { label: '司机', emoji: '🐸' },
};

const FALLBACK_BUILD: MonsterCarBuild = {
  wheels: 'classic', front: 'smile', rear: 'trunk', roof: 'mushroom', driver: 'bear',
};

const ENVIRONMENT_EMOJI = { puddle: '💦', log: '🪵', gust: '🍃', hill: '⛰️' } as const;
const PART_PAGE_SIZE = 4;

export function MonsterCarPanel({ room, playerId, onAction, onEndGame, pending, serverClockOffsetMs = 0 }: GamePanelProps) {
  const game = room.game as MonsterCarView;
  const isOwner = room.ownerId === playerId;
  const isParticipant = game.participantIds.includes(playerId);
  const paint = Math.max(0, game.participantIds.indexOf(playerId));
  const serverBuild = game.builds[playerId] ?? game.builds[game.participantIds[0] ?? ''] ?? FALLBACK_BUILD;
  const serverBuildSignature = JSON.stringify(serverBuild);
  const [draft, setDraft] = useState<MonsterCarBuild>(() => ({ ...serverBuild }));
  const [activeSlot, setActiveSlot] = useState<MonsterCarSlot>('wheels');
  const [partPage, setPartPage] = useState(0);
  const [frame, setFrame] = useState<MonsterCarRaceFrame | null>(null);
  const [now, setNow] = useState(Date.now());
  const [webglFailed, setWebglFailed] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(true);
  const [muted, setMuted] = useState(true);
  const [sound] = useState(() => new Soundscape());
  const shellRef = useRef<HTMLElement>(null);
  const lastCueRef = useRef('');
  const celebratedRaceRef = useRef('');
  const resultsTimerRef = useRef<number | null>(null);
  const pendingPartFocusRef = useRef<string | null>(null);
  const onFrame = useCallback((next: MonsterCarRaceFrame) => setFrame(next), []);
  const onRenderFailure = useCallback(() => setWebglFailed(true), []);
  const previewPlayerId = isParticipant ? playerId : game.participantIds[0] ?? playerId;
  const previewPlayerIndex = Math.max(0, game.participantIds.indexOf(previewPlayerId));
  const previewAvatar = playerAvatarOf(room.players, previewPlayerId);
  const garageIdentity = useMemo(
    () => createCarIdentity(previewPlayerId, previewPlayerIndex, previewAvatar),
    [previewAvatar, previewPlayerId, previewPlayerIndex],
  );
  const showPlan = useMemo(
    () => game.plan ? createMonsterCarShowPlan(game.plan, room.players.map((player) => ({ id: player.id, avatar: player.avatar }))) : null,
    [game.plan, room.players],
  );
  const activePartId = draft[activeSlot];

  useEffect(() => {
    const selectedIndex = (MONSTER_CAR_PART_IDS[activeSlot] as readonly string[]).indexOf(activePartId);
    setPartPage(Math.max(0, Math.floor(selectedIndex / PART_PAGE_SIZE)));
  }, [activePartId, activeSlot]);

  useEffect(() => {
    const pending = pendingPartFocusRef.current;
    if (!pending) return;
    const target = document.getElementById(`mc-part-${activeSlot}-${pending}`);
    target?.focus();
    pendingPartFocusRef.current = null;
  }, [activePartId, activeSlot, partPage]);

  useEffect(() => {
    if (game.phase !== 'building') return;
    setDraft({ ...serverBuild });
    setFrame(null);
    setWebglFailed(false);
    // buildingDeadlineAt 在每局改变；组装过程中的其他快照不打断孩子正在做的选择。
  }, [game.buildingDeadlineAt, game.phase]);

  useEffect(() => {
    if (game.phase === 'building' && !isParticipant) setDraft({ ...serverBuild });
    // 旁观者没有本地草稿，应持续跟随公开车辆；参与者的改装不被其他快照打断。
  }, [game.phase, isParticipant, serverBuildSignature]);

  useEffect(() => {
    if (game.phase !== 'countdown') return;
    const timer = window.setInterval(() => setNow(Date.now() + serverClockOffsetMs), 120);
    setNow(Date.now() + serverClockOffsetMs);
    return () => window.clearInterval(timer);
  }, [game.phase, serverClockOffsetMs]);

  useEffect(() => () => sound.dispose(), [sound]);

  useEffect(() => {
    if (!webglFailed || !game.plan || game.raceStartsAt === null) return;
    const sample = () => {
      const elapsed = Date.now() + serverClockOffsetMs - game.raceStartsAt!;
      setFrame(sampleMonsterCarFrame(game.plan!, elapsed));
    };
    sample();
    if (game.phase === 'finished') return;
    const timer = window.setInterval(sample, 125);
    return () => window.clearInterval(timer);
  }, [game.phase, game.plan, game.raceStartsAt, serverClockOffsetMs, webglFailed]);

  const ownFrame = frame?.cars.find((car) => car.playerId === playerId) ?? null;
  const ownCue = ownFrame?.activeCue ?? null;
  const socialMoment = game.phase === 'racing' && showPlan && frame
    ? sampleSocialMoment(showPlan, frame.atMs)
    : null;
  useEffect(() => {
    if (!ownCue || !game.plan) return;
    const key = `${game.plan.id}:${ownCue.eventId}`;
    if (lastCueRef.current === key) return;
    lastCueRef.current = key;
    sound.cue(ownCue.stimulus);
  }, [game.plan, ownCue, sound]);

  useEffect(() => {
    if (game.phase !== 'finished' || !game.plan || celebratedRaceRef.current === game.plan.id) return;
    celebratedRaceRef.current = game.plan.id;
    sound.celebrate();
  }, [game.phase, game.plan, sound]);

  useEffect(() => {
    if (game.phase !== 'finished') return;
    setResultsOpen(true);
    if (resultsTimerRef.current !== null) window.clearTimeout(resultsTimerRef.current);
    resultsTimerRef.current = window.setTimeout(() => {
      resultsTimerRef.current = null;
      closeResults();
    }, 5_000);
    return () => {
      if (resultsTimerRef.current !== null) window.clearTimeout(resultsTimerRef.current);
      resultsTimerRef.current = null;
    };
  }, [game.phase, game.plan?.id]);

  const closeResults = () => {
    if (resultsTimerRef.current !== null) window.clearTimeout(resultsTimerRef.current);
    resultsTimerRef.current = null;
    const card = document.getElementById('mc-results-card');
    const shouldMoveFocus = card?.contains(document.activeElement) ?? false;
    setResultsOpen(false);
    if (shouldMoveFocus) {
      requestAnimationFrame(() => document.getElementById('mc-show-results')?.focus());
    }
  };

  const revealResults = () => {
    if (resultsTimerRef.current !== null) window.clearTimeout(resultsTimerRef.current);
    resultsTimerRef.current = null;
    setResultsOpen(true);
  };

  const selectPart = (partId: string) => {
    setDraft((current) => ({ ...current, [activeSlot]: partId }) as MonsterCarBuild);
    void sound.unlock();
  };

  const navigateSlots = (event: KeyboardEvent<HTMLButtonElement>, slot: MonsterCarSlot) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const current = MONSTER_CAR_SLOTS.indexOf(slot);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? MONSTER_CAR_SLOTS.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + MONSTER_CAR_SLOTS.length) % MONSTER_CAR_SLOTS.length;
    const nextSlot = MONSTER_CAR_SLOTS[next]!;
    setActiveSlot(nextSlot);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  const navigateParts = (event: KeyboardEvent<HTMLButtonElement>, partId: string) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const parts: readonly string[] = MONSTER_CAR_PART_IDS[activeSlot];
    const current = parts.indexOf(partId);
    const delta = event.key === 'ArrowUp' ? -4 : event.key === 'ArrowDown' ? 4
      : event.key === 'ArrowRight' ? 1 : -1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? parts.length - 1
      : (current + delta + parts.length) % parts.length;
    const nextPart = parts[next]!;
    selectPart(nextPart);
    pendingPartFocusRef.current = nextPart;
    setPartPage(Math.floor(next / PART_PAGE_SIZE));
  };

  const submit = () => {
    void sound.unlock();
    onAction({ type: 'build-car', build: draft });
  };

  const toggleSound = () => {
    const next = !muted;
    setMuted(next);
    sound.setMuted(next);
    if (!next) void sound.unlock();
  };

  const toggleFullscreen = () => {
    if (!shellRef.current) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void shellRef.current.requestFullscreen().catch(() => undefined);
  };

  const countdown = game.raceStartsAt === null ? 3 : Math.min(3, Math.max(1, Math.ceil((game.raceStartsAt - now) / 1_000)));
  const secondsLeft = Math.max(0, Math.ceil((RACE_DURATION_MS - (frame?.atMs ?? 0)) / 1_000));
  const ownReady = game.readyPlayerIds.includes(playerId);
  const partIds: readonly string[] = MONSTER_CAR_PART_IDS[activeSlot];
  const partPageCount = Math.ceil(partIds.length / PART_PAGE_SIZE);
  const visiblePartIds = partIds.slice(partPage * PART_PAGE_SIZE, (partPage + 1) * PART_PAGE_SIZE);
  const photoMode = game.phase === 'finished' && !resultsOpen;

  return (
    <main className={`mc-shell mc-phase-${game.phase}`} ref={shellRef}>
      <header className="mc-topbar">
        <Brand compact />
        <div className="mc-event-name"><span>FOREST MOTOR CLUB</span><strong>{showPlan?.story.title ?? '萤火森林'} → 云朵大操场</strong></div>
        <div className="mc-top-actions">
          <button className="mc-icon-button" type="button" onClick={toggleSound} aria-label={muted ? '打开声音' : '静音'}>
            {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
          </button>
          {document.fullscreenEnabled && <button className="mc-icon-button" type="button" onClick={toggleFullscreen} aria-label="全屏"><Maximize2 size={18} /></button>}
        </div>
      </header>

      {game.phase === 'building' ? (
        <section className="mc-garage-layout">
          <div className="mc-garage-heading">
            <span className="mc-kicker"><Sparkles size={14} />怪兽车库 · 现在开业</span>
            <h1 aria-label="造一辆奇怪的车，去森林聚会！">造一辆<br />奇怪的车，<br /><em>去森林<br />聚会！</em></h1>
            <p>点一点下面的零件，汽车马上变样。</p>
          </div>

          <div className="mc-preview-frame">
            {!webglFailed ? (
              <MonsterCarCanvas game={game} previewBuild={draft} paint={paint} clockOffsetMs={serverClockOffsetMs} identity={garageIdentity} avatar={previewAvatar} isOwn={isParticipant} viewerId={playerId} showPlan={showPlan} photoMode={photoMode} onFrame={onFrame} onFailure={onRenderFailure} />
            ) : (
              <div className="mc-dom-car" aria-label="你的汽车预览">
                <span>{MONSTER_CAR_PART_CATALOG.roof[draft.roof]?.emoji}</span>
                <span>{MONSTER_CAR_PART_CATALOG.driver[draft.driver]?.emoji}</span>
                <strong>{MONSTER_CAR_PART_CATALOG.front[draft.front]?.emoji} 🚙 {MONSTER_CAR_PART_CATALOG.rear[draft.rear]?.emoji}</strong>
                <span>{MONSTER_CAR_PART_CATALOG.wheels[draft.wheels]?.emoji} {MONSTER_CAR_PART_CATALOG.wheels[draft.wheels]?.emoji}</span>
              </div>
            )}
            <div className="mc-preview-badge"><span className={`mc-paint-dot mc-paint-${paint}`} />{isParticipant ? '我的怪兽汽车' : '观战车辆'}</div>
            <div className="mc-ready-parade" aria-label="玩家准备状态">
              {game.participantIds.map((id) => (
                <span key={id} className={game.readyPlayerIds.includes(id) ? 'is-ready' : ''} title={playerNameOf(room.players, id)}>
                  {playerAvatarOf(room.players, id)}{game.readyPlayerIds.includes(id) && <Check size={11} />}
                </span>
              ))}
            </div>
            <div className="mc-drag-hint">↔ 拖动车车转一转</div>
          </div>

          {isParticipant ? (
            <div className="mc-workbench">
              <div className="mc-slot-tabs" role="tablist" aria-label="汽车部位">
                {MONSTER_CAR_SLOTS.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    role="tab"
                    id={`mc-tab-${slot}`}
                    aria-controls="mc-part-panel"
                    aria-selected={activeSlot === slot}
                    tabIndex={activeSlot === slot ? 0 : -1}
                    className={activeSlot === slot ? 'is-active' : ''}
                    onClick={() => setActiveSlot(slot)}
                    onKeyDown={(event) => navigateSlots(event, slot)}
                  >
                    <PartThumbnail slot={slot} partId={draft[slot]} fallbackEmoji={SLOT_LABELS[slot].emoji} enabled={!webglFailed} />
                    <strong>{SLOT_LABELS[slot].label}</strong>
                  </button>
                ))}
              </div>
              <div className="mc-part-panel" role="tabpanel" id="mc-part-panel" aria-labelledby={`mc-tab-${activeSlot}`}>
                <div className="mc-part-options" role="radiogroup" aria-label={`选择${SLOT_LABELS[activeSlot].label}`}>
                {visiblePartIds.map((partId) => {
                  const part = MONSTER_CAR_PART_CATALOG[activeSlot][partId];
                  if (!part) return null;
                  const selected = draft[activeSlot] === partId;
                  const isTabStop = selected || (!visiblePartIds.includes(activePartId) && visiblePartIds[0] === partId);
                  return (
                    <button id={`mc-part-${activeSlot}-${partId}`} key={partId} type="button" role="radio" aria-checked={selected} tabIndex={isTabStop ? 0 : -1} className={selected ? 'is-selected' : ''} onClick={() => selectPart(partId)} onKeyDown={(event) => navigateParts(event, partId)}>
                      <PartThumbnail slot={activeSlot} partId={partId} fallbackEmoji={part.emoji} enabled={!webglFailed} />
                      <strong>{part.label}</strong>
                      {selected && <span className="mc-selected-dot"><Check size={12} /></span>}
                    </button>
                  );
                })}
                </div>
              </div>
              <div className="mc-part-pager" aria-label="零件翻页">
                <button type="button" aria-label="上一页零件" disabled={partPage === 0} onClick={() => setPartPage((page) => Math.max(0, page - 1))}>←</button>
                <span>{partPage + 1} / {partPageCount}</span>
                <button type="button" aria-label="下一页零件" disabled={partPage >= partPageCount - 1} onClick={() => setPartPage((page) => Math.min(partPageCount - 1, page + 1))}>→</button>
              </div>
              <div className="mc-departure-actions">
                <button className="mc-surprise-button" type="button" onClick={() => setDraft((current) => surpriseCarBuild(current))}><span>🎲</span><strong>惊喜一下</strong></button>
                <button className="mc-go-button" type="button" onClick={submit} disabled={pending} aria-label={ownReady ? '改装完成，再确认一次，出发' : '我的车好了！出发'}>
                  <span>{ownReady ? '改装完成，再确认一次' : '我的车好了！'}</span><strong>出发</strong><span className="mc-go-arrow">→</span>
                </button>
              </div>
              <p className="mc-waiting-copy">{ownReady ? '还可以继续换零件；朋友都准备好，就一起出发。' : '不用赶时间，每一辆车都可以很特别。'}</p>
            </div>
          ) : <p className="mc-spectator-copy">你正在观战。坐好，看看大家造出了什么车！</p>}
        </section>
      ) : (
        <section className={`mc-journey-stage ${game.phase === 'finished' && !resultsOpen ? 'is-photo' : ''}`}>
          {!webglFailed ? (
            <MonsterCarCanvas game={game} previewBuild={draft} paint={paint} clockOffsetMs={serverClockOffsetMs} identity={garageIdentity} avatar={previewAvatar} isOwn={isParticipant} viewerId={playerId} showPlan={showPlan} photoMode={photoMode} onFrame={onFrame} onFailure={onRenderFailure} />
          ) : (
            <div className="mc-dom-journey"><span>🌲</span><span>🌳</span><strong>🚙</strong><span>🌲</span><span>🎡</span></div>
          )}

          <div className="mc-race-hud">
            <div className="mc-race-meta">
              <span>{game.phase === 'finished' ? '全员抵达' : game.phase === 'countdown' ? '准备出发' : `森林旅行 · ${secondsLeft} 秒`}</span>
              <strong>{ownFrame ? `我的车在第 ${ownFrame.place} 位` : '2–4 辆车 · 同一条森林道路'}</strong>
            </div>
            <div className="mc-route" aria-label="森林道路进度">
              <div className="mc-route-line" />
              {game.plan?.events.map((event) => <span key={event.id} className="mc-route-event" style={{ left: `${event.progress * 100}%` }}>{ENVIRONMENT_EMOJI[event.kind]}</span>)}
              {frame?.cars.map((car) => (
                <span
                  key={car.playerId}
                  className={`mc-route-car ${car.playerId === playerId ? 'is-own' : ''}`}
                  style={{ left: `${Math.min(100, car.progress * 100)}%`, top: `${3 + car.lane * 3}px` }}
                  title={playerNameOf(room.players, car.playerId)}
                >{playerAvatarOf(room.players, car.playerId)}</span>
              ))}
              <span className="mc-route-finish">🎡</span>
            </div>
          </div>

          {game.phase === 'countdown' && (
            <div className="mc-countdown" role="status"><span>握紧方向盘</span><strong>{countdown}</strong><small>怪兽汽车，准备出发！</small></div>
          )}

          {game.phase === 'racing' && ownCue && (
            <div className="mc-reaction-card" role="status">
              <span>{ENVIRONMENT_EMOJI[ownCue.environment]}</span>
              <div><small>{MONSTER_CAR_PART_CATALOG[ownCue.primary.slot === 'chassis' ? 'wheels' : ownCue.primary.slot][ownCue.primary.partId]?.label ?? '整辆汽车'}</small><strong>{ownCue.primary.highlight}</strong></div>
            </div>
          )}

          {game.phase === 'racing' && socialMoment && !ownCue && (
            <div className="mc-social-card" role="status"><span>👋</span><strong>{socialMoment.caption}</strong></div>
          )}

          {game.phase === 'racing' && !ownCue && !socialMoment && <div className="mc-road-caption">看！我的车正在穿过萤火森林</div>}

          {game.phase === 'finished' && resultsOpen && (
            <section id="mc-results-card" className="mc-results-card" aria-labelledby="mc-results-title">
              <span className="mc-kicker"><Sparkles size={14} />CLOUD PLAYGROUND</span>
              <h1 id="mc-results-title">抵达云朵大操场！</h1>
              <p>名次完全随机，每辆车都有自己的森林高光。</p>
              <div className="mc-standings">
                {game.standings.map((entry) => (
                  <div key={entry.playerId} className={entry.playerId === playerId ? 'is-own' : ''}>
                    <span className="mc-place">{entry.place}</span>
                    <span className="mc-standing-avatar">{playerAvatarOf(room.players, entry.playerId)}</span>
                    <span><strong>{playerNameOf(room.players, entry.playerId)}</strong><small>{entry.highlight}</small></span>
                    <span className="mc-medal">{entry.place === 1 ? '🏆' : entry.place === 2 ? '🥈' : entry.place === 3 ? '🥉' : '🎈'}</span>
                  </div>
                ))}
              </div>
              <div className="mc-results-actions">
                <button className="mc-continue-button" type="button" aria-expanded="true" aria-controls="mc-results-card" onClick={closeResults}>看车车和礼花</button>
                {isOwner ? (
                  <>
                    <button className="mc-again-button" type="button" disabled={pending} onClick={() => onAction({ type: 'play-again' })}><RotateCcw size={18} />再造一辆，重新出发</button>
                    <button className="mc-continue-button" type="button" disabled={pending} onClick={onEndGame}>换个游戏</button>
                  </>
                ) : <p className="mc-waiting-owner">等房主再开一场森林旅行</p>}
              </div>
            </section>
          )}
          {game.phase === 'finished' && !resultsOpen && (
            <div className="mc-celebration-dock">
              <span><Sparkles size={16} />欢乐车阵 · 礼花庆典</span>
              <button id="mc-show-results" type="button" aria-expanded="false" aria-controls="mc-results-card" onClick={revealResults}>查看名次</button>
              {isOwner && <button type="button" disabled={pending} onClick={() => onAction({ type: 'play-again' })}>再玩一场</button>}
              {isOwner && <button type="button" disabled={pending} onClick={onEndGame}>换个游戏</button>}
            </div>
          )}
        </section>
      )}
      <div className="sr-only" role="status">{game.phase === 'building' ? '正在组装汽车' : game.phase === 'finished' ? '所有汽车已经抵达终点' : '怪兽汽车正在森林道路上前进'}</div>
    </main>
  );
}
