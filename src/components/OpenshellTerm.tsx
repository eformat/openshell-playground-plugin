import * as React from 'react';
import { GatewayInfo } from '../utils/api';

interface OpenshellTermProps {
  namespace: string;
  gateways: GatewayInfo[];
}

const OpenshellTerm: React.FC<OpenshellTermProps> = React.memo(({ namespace, gateways }) => {
  const [fullscreen, setFullscreen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const toggleFullscreen = React.useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  React.useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  if (!namespace || gateways.length === 0) return null;

  const ttydUrl = `/api/proxy/plugin/openshell-playground-plugin/backend/api/ttyd/?ns=${encodeURIComponent(namespace)}&service=openshell`;

  return (
    <div className="os-term-panel" ref={containerRef}>
      <div className="os-term-panel__header">
        <div className="os-term-panel__tabs">
          <span style={{ padding: '6px 12px', fontSize: 13, fontWeight: 600, color: 'var(--pf-t--global--text--color--regular)' }}>
            Gateway TUI
          </span>
        </div>
        <button className="os-fullscreen-btn" onClick={toggleFullscreen} title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}>
          {fullscreen ? '✖' : '⤢'}
        </button>
      </div>
      <div className="os-term-panel__body">
        <iframe
          src={ttydUrl}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          title="OpenShell Gateway TUI"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
});

export default OpenshellTerm;
