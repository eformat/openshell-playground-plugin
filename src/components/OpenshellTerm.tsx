import * as React from 'react';
import { GatewayInfo } from '../utils/api';

interface OpenshellTermProps {
  namespace: string;
  gateways: GatewayInfo[];
}

const OpenshellTerm: React.FC<OpenshellTermProps> = React.memo(({ namespace, gateways }) => {
  const [activeTab, setActiveTab] = React.useState('');
  const [fullscreen, setFullscreen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (gateways.length > 0 && !activeTab) {
      setActiveTab(gateways[0].name);
    }
  }, [gateways, activeTab]);

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

  const ttydUrl = (gwName: string) =>
    `/api/proxy/plugin/openshell-playground-plugin/backend/api/ttyd/?ns=${encodeURIComponent(namespace)}&service=${encodeURIComponent(gwName)}`;

  return (
    <div className="os-term-panel" ref={containerRef}>
      <div className="os-term-panel__header">
        <div className="os-term-panel__tabs">
          {gateways.map((gw) => (
            <button
              key={gw.name}
              className={`os-term-panel__tab ${gw.name === activeTab ? 'os-term-panel__tab--active' : ''}`}
              onClick={() => setActiveTab(gw.name)}
            >
              <span style={{ textTransform: 'capitalize' }}>{gw.agentType}</span>
            </button>
          ))}
        </div>
        <button className="os-fullscreen-btn" onClick={toggleFullscreen} title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}>
          {fullscreen ? '✖' : '⤢'}
        </button>
      </div>
      <div className="os-term-panel__body">
        {gateways.map((gw) => (
          <iframe
            key={gw.name}
            src={ttydUrl(gw.name)}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: gw.name === activeTab ? 'block' : 'none',
            }}
            title={`OpenShell TUI - ${gw.agentType}`}
            allow="clipboard-read; clipboard-write"
          />
        ))}
      </div>
    </div>
  );
});

export default OpenshellTerm;
