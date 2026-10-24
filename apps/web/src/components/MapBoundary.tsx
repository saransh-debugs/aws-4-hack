import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

/** The map needs WebGL. If it fails to start, show a message instead of a blank screen. */
export class MapBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (this.state.failed) {
      return (
        <p role="alert" className="p-4 text-sm text-slate-300">
          The map could not start (WebGL is required). The feed and alerts still work.
        </p>
      );
    }
    return this.props.children;
  }
}
