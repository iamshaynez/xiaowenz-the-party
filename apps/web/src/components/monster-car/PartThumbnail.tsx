import { useEffect, useState } from 'react';
import type { MonsterCarSlot } from '@party/protocol';
import { partThumbnailBaker } from './thumbnails/PartThumbnailBaker';

interface PartThumbnailProps {
  slot: MonsterCarSlot;
  partId: string;
  fallbackEmoji: string;
  enabled?: boolean;
}

export function PartThumbnail({ slot, partId, fallbackEmoji, enabled = true }: PartThumbnailProps) {
  const [url, setUrl] = useState<string | null>(() => partThumbnailBaker.cached(slot, partId));
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const cached = partThumbnailBaker.cached(slot, partId);
    setUrl(cached);
    setLoaded(false);
    setFailed(false);
    if (!enabled || cached) return () => { active = false; };
    partThumbnailBaker.request(slot, partId).then((result) => {
      if (active) setUrl(result);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => {
      active = false;
      partThumbnailBaker.release(slot, partId);
    };
  }, [enabled, partId, slot]);

  const showFallback = !enabled || failed || !url;
  return (
    <span
      className={`mc-part-thumbnail ${loaded ? 'is-loaded' : ''}`}
      data-testid={`part-thumbnail-${slot}-${partId}`}
      data-state={showFallback ? 'fallback' : loaded ? 'loaded' : 'loading'}
      aria-hidden="true"
    >
      {!showFallback && <img src={url} alt="" onLoad={() => setLoaded(true)} />}
      {showFallback && <span>{fallbackEmoji}</span>}
      {!showFallback && !loaded && <i className="mc-thumbnail-skeleton" />}
    </span>
  );
}
