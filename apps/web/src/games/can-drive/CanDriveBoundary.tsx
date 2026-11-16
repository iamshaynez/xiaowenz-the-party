import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { failed: boolean }

export class CanDriveBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The room stays connected; a rendering or chunk failure must not become a blank page.
  }

  override render() {
    if (this.state.failed) {
      return (
        <main className="loading-page">
          <h1>怪车舞台暂时没有打开</h1>
          <p>房间和车辆都已保留，请刷新页面重试。</p>
          <button className="primary-button" type="button" onClick={() => window.location.reload()}>重新打开</button>
        </main>
      );
    }
    return this.props.children;
  }
}
