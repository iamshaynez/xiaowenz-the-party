import { useEffect, useRef, useState } from 'react';
import { DEFAULT_CAR_BUILD, createCarShowPlan } from '@party/games';
import { CarGameRenderer } from '../games/can-drive/rendering/CarGameRenderer';

export function CarFrameLabPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const seed = Number(params.get('seed') ?? 123_456);
    const atMs = Number(params.get('time') ?? 32_000);
    const live = params.get('live') === '1';
    const plan = createCarShowPlan(DEFAULT_CAR_BUILD, Number.isFinite(seed) ? seed : 123_456);
    let renderer: CarGameRenderer | null = null;
    try {
      renderer = new CarGameRenderer(mountRef.current, setError);
      renderer.setShow(plan, live ? Date.now() : 0, false);
      if (!live) renderer.renderAt(Number.isFinite(atMs) ? atMs : 32_000);
    } catch {
      setError('当前浏览器无法打开固定帧舞台。');
    }
    return () => renderer?.dispose();
  }, []);

  return (
    <main style={{ width: '100vw', height: '100svh', background: '#e8dfd0' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
