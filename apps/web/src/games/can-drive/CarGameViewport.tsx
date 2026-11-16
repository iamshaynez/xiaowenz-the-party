import { useEffect, useRef, useState } from 'react';
import type { CanDriveBuild, CanDriveFinalCarView, PublicCarShowPlan } from '../../types';
import { CarGameRenderer } from './rendering/CarGameRenderer';

interface CarGameViewportProps {
  mode: 'garage' | 'show' | 'award' | 'group';
  build: CanDriveBuild | null;
  show: PublicCarShowPlan | null;
  startedAt: number | null;
  cars: CanDriveFinalCarView[];
}

export function CarGameViewport({ mode, build, show, startedAt, cars }: CarGameViewportProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CarGameRenderer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    try {
      rendererRef.current = new CarGameRenderer(mountRef.current, setError);
      setError(null);
    } catch {
      setError('当前浏览器无法打开三维舞台，已切换为文字展示。');
    }
    return () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (mode === 'garage' && build) renderer.setGarage(build);
    if ((mode === 'show' || mode === 'award') && show && startedAt !== null) {
      renderer.setShow(show, startedAt, mode === 'award');
    }
    if (mode === 'group') renderer.setGroup(cars);
  }, [mode, build, show, startedAt, cars]);

  const fallbackTitle = mode === 'garage' ? '你的怪车已经准备好了' : mode === 'group' ? '怪车车队合影' : '三维舞台正在恢复';
  return (
    <div className="cd-viewport" data-mode={mode}>
      <div className="cd-viewport-canvas" ref={mountRef} style={{ width: '100%', height: '100%' }} />
      {error && (
        <div className="cd-viewport-fallback" role="status" style={{ position: 'absolute', inset: 0 }}>
          <div><strong>{fallbackTitle}</strong><span>{error}</span></div>
        </div>
      )}
    </div>
  );
}
