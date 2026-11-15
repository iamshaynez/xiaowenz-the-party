import { CloudOff, LoaderCircle } from 'lucide-react';

export function ConnectionNotice({ reconnecting }: { reconnecting: boolean }) {
  if (!reconnecting) return null;
  return (
    <div className="connection-notice" role="status">
      <CloudOff size={17} />
      <span>网络开了个小差，正在找回你的座位</span>
      <LoaderCircle className="spin" size={17} />
    </div>
  );
}
