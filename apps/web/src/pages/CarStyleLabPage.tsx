import { ArrowLeft, MousePointer2, Play, Shapes } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CarStyleScene } from '../lab/carStyleScene';
import { CAR_STYLE_PRESETS, isCarStyleId } from '../lab/carStylePresets';
import type { CarStyleId } from '../lab/carStylePresets';
import './CarStyleLabPage.css';

export function CarStyleLabPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CarStyleScene | null>(null);
  const [style, setStyle] = useState<CarStyleId>(() => {
    const hash = window.location.hash.slice(1);
    return isCarStyleId(hash) ? hash : 'clay';
  });
  const [error, setError] = useState<string | null>(null);
  const preset = CAR_STYLE_PRESETS.find((item) => item.id === style)!;

  useEffect(() => {
    if (!mountRef.current) return;
    try {
      sceneRef.current = new CarStyleScene(mountRef.current);
    } catch {
      setError('当前浏览器没有成功启动 WebGL。请开启硬件加速，或换用最新版浏览器。');
    }
    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setStyle(style);
    window.history.replaceState(null, '', `#${style}`);
  }, [style]);

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (isCarStyleId(hash)) setStyle(hash);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const next = CAR_STYLE_PRESETS[Number(event.key) - 1];
      if (next) setStyle(next.id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <main className="style-lab" data-style={style}>
      <header className="style-lab__header">
        <Link to="/" className="style-lab__back"><ArrowLeft size={17} />返回碰头</Link>
        <div className="style-lab__brand"><Shapes size={19} /><strong>PARTY LAB</strong><span>/</span><span>这车能开？</span></div>
        <span className="style-lab__edition">STYLE TEST 01</span>
      </header>

      <section className="style-lab__intro">
        <div>
          <span className="style-lab__eyebrow">CALIBRATION CAR #001</span>
          <h1>同一辆怪车，<span>三种画风。</span></h1>
        </div>
        <p>方轮、枕头、火箭、雨伞和小猫司机。模型、机位与动作完全相同，只切换成熟的视觉配方。</p>
      </section>

      <div className="style-lab__grid">
        <section className="style-lab__viewport" aria-label="三维标定车预览">
          <div className="style-lab__canvas" ref={mountRef} />
          <div className="style-lab__viewport-top">
            <span className="style-lab__live"><i />实时 Three.js</span>
            <span className="style-lab__drag"><MousePointer2 size={14} />拖动旋转</span>
          </div>
          <div className="style-lab__part-list" aria-label="标定车零件">
            <span>小猫司机</span><span>方形轮</span><span>枕头车头</span><span>火箭</span><span>雨伞</span>
          </div>
          <button className="style-lab__replay" type="button" onClick={() => sceneRef.current?.replay()}>
            <Play size={17} fill="currentColor" />再演一次
          </button>
          {error && <div className="style-lab__error" role="alert">{error}</div>}
        </section>

        <aside className="style-lab__controls">
          <div className="style-lab__control-heading">
            <span>选择视觉预设</span>
            <small>键盘 1 / 2 / 3</small>
          </div>
          <div className="style-lab__options">
            {CAR_STYLE_PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`style-lab__option ${style === item.id ? 'is-selected' : ''}`}
                aria-pressed={style === item.id}
                onClick={() => setStyle(item.id)}
              >
                <span className="style-lab__swatches" aria-hidden="true">
                  <i style={{ background: item.body }} /><i style={{ background: item.accent }} /><i style={{ background: item.background }} />
                </span>
                <span className="style-lab__option-copy">
                  <small>{item.number} · {item.englishName}</small>
                  <strong>{item.name}</strong>
                </span>
                <span className="style-lab__radio" aria-hidden="true"><i /></span>
              </button>
            ))}
          </div>

          <div className="style-lab__preset-note" key={preset.id}>
            <span className="style-lab__note-label">当前配方</span>
            <h2>{preset.name}</h2>
            <p>{preset.description}</p>
            <div className="style-lab__traits">{preset.traits.map((trait) => <span key={trait}>{trait}</span>)}</div>
            <div className="style-lab__reference"><span>参考套路</span><strong>{preset.reference}</strong></div>
          </div>

          <div className="style-lab__fair-test">
            <span>控制变量</span>
            <p>同一几何结构 · 同一安装点<br />同一镜头 · 同一七秒动作</p>
          </div>
        </aside>
      </div>

      <footer className="style-lab__footer">
        <span>原型只使用本地程序化几何体，不依赖外部模型或贴图。</span>
        <span>画风参考：Claybook / WHAT THE CAR? / Three.js Toon Example</span>
      </footer>
    </main>
  );
}
