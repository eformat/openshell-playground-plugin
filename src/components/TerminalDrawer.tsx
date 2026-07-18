import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Button, Spinner, Tooltip } from '@patternfly/react-core';
import { CloseIcon } from '@patternfly/react-icons/dist/esm/icons/close-icon';
import { CompressIcon } from '@patternfly/react-icons/dist/esm/icons/compress-icon';
import { ExpandIcon } from '@patternfly/react-icons/dist/esm/icons/expand-icon';
import TerminalSession from './TerminalSession';
import { PodInfo } from '../utils/types';
import * as api from '../utils/api';

interface AgentTerminal {
  name: string;
  namespace: string;
}

interface TerminalDrawerProps {
  agents: AgentTerminal[];
  activeAgent: string;
  currentNamespace: string;
  onSelectTab: (key: string) => void;
  onCloseTab: (key: string) => void;
  onCloseAll: () => void;
}

function agentKey(a: AgentTerminal): string {
  return `${a.namespace}/${a.name}`;
}

const DEFAULT_HEIGHT = 400;
const MIN_HEIGHT = 48;

const TerminalDrawer: React.FC<TerminalDrawerProps> = ({
  agents,
  activeAgent,
  currentNamespace,
  onSelectTab,
  onCloseTab,
  onCloseAll,
}) => {
  const [expanded, setExpanded] = React.useState(true);
  const [height, setHeight] = React.useState(DEFAULT_HEIGHT);
  const [podInfoMap, setPodInfoMap] = React.useState<Record<string, PodInfo>>({});
  const [loadingPods, setLoadingPods] = React.useState<Record<string, boolean>>({});
  const drawerRef = React.useRef<HTMLDivElement>(null);
  const dragStartRef = React.useRef<{ y: number; h: number } | null>(null);

  const hasMultipleNamespaces = React.useMemo(() => {
    const ns = new Set(agents.map((a) => a.namespace));
    return ns.size > 1;
  }, [agents]);

  React.useEffect(() => {
    agents.forEach((agent) => {
      const key = agentKey(agent);
      if (!podInfoMap[key] && !loadingPods[key]) {
        setLoadingPods((prev) => ({ ...prev, [key]: true }));
        api.getAgentPod(agent.name, agent.namespace).then((pod) => {
          setPodInfoMap((prev) => ({ ...prev, [key]: pod }));
          setLoadingPods((prev) => ({ ...prev, [key]: false }));
        }).catch(() => {
          setLoadingPods((prev) => ({ ...prev, [key]: false }));
        });
      }
    });
  }, [agents]);

  const handleDragStart = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const currentH = drawerRef.current?.offsetHeight || height;
    dragStartRef.current = { y: e.clientY, h: currentH };

    const handleDragMove = (ev: MouseEvent) => {
      if (!dragStartRef.current) return;
      const delta = dragStartRef.current.y - ev.clientY;
      const newHeight = Math.max(MIN_HEIGHT, dragStartRef.current.h + delta);
      const maxH = window.innerHeight - 60;
      setHeight(Math.min(newHeight, maxH));
      setExpanded(newHeight > MIN_HEIGHT);
    };

    const handleDragEnd = () => {
      dragStartRef.current = null;
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
    };

    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
  }, [height]);

  if (agents.length === 0) return null;

  return ReactDOM.createPortal(
    <div
      ref={drawerRef}
      className="os-drawer"
      style={{ height: expanded ? height : MIN_HEIGHT }}
    >
      <div className="os-drawer__drag-handle" onMouseDown={handleDragStart} />

      <div className="os-drawer__header">
        <div className="os-drawer__tabs">
          {agents.map((agent) => {
            const key = agentKey(agent);
            const isOtherNs = agent.namespace !== currentNamespace;
            const label = hasMultipleNamespaces
              ? `${agent.namespace}/${agent.name}`
              : agent.name;
            return (
              <div
                key={key}
                className={`os-drawer__tab ${key === activeAgent ? 'os-drawer__tab--active' : ''} ${isOtherNs ? 'os-drawer__tab--other-ns' : ''}`}
                onClick={() => onSelectTab(key)}
              >
                <span className="os-drawer__tab-label">{label}</span>
                <button
                  className="os-drawer__tab-close"
                  onClick={(e) => { e.stopPropagation(); onCloseTab(key); }}
                  aria-label={`Close ${agent.name}`}
                >
                  x
                </button>
              </div>
            );
          })}
        </div>
        <div className="os-drawer__actions">
          <Tooltip content={expanded ? 'Minimize terminal' : 'Restore terminal'}>
            <Button
              variant="plain"
              aria-label={expanded ? 'Minimize' : 'Restore'}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <CompressIcon /> : <ExpandIcon />}
            </Button>
          </Tooltip>
          <Tooltip content="Close all terminals">
            <Button variant="plain" aria-label="Close all terminals" onClick={onCloseAll}>
              <CloseIcon />
            </Button>
          </Tooltip>
        </div>
      </div>

      {expanded && (
        <div className="os-drawer__body">
          {agents.map((agent) => {
            const key = agentKey(agent);
            const pod = podInfoMap[key];
            const loading = loadingPods[key];
            if (loading || !pod) {
              return (
                <div
                  key={key}
                  style={{
                    display: key === activeAgent ? 'flex' : 'none',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100%',
                  }}
                >
                  <Spinner size="xl" />
                </div>
              );
            }
            return (
              <TerminalSession
                key={key}
                podName={pod.podName}
                containerName={pod.containerName}
                namespace={agent.namespace}
                isActive={key === activeAgent}
                autoCommand="export ANTHROPIC_BASE_URL=https://inference.local ANTHROPIC_API_KEY=unused; printf '\033[2J\033[H'; echo '=== Sandbox: ${HOSTNAME} ==='; echo 'inference.local configured — run: claude --bare'; echo"
              />
            );
          })}
        </div>
      )}
    </div>,
    document.body,
  );
};

export default TerminalDrawer;
