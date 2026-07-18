import * as React from 'react';
import { Spinner, Button } from '@patternfly/react-core';
import TerminalSession from './TerminalSession';
import { PodInfo } from '../utils/types';
import * as api from '../utils/api';

interface AgentTerminal {
  name: string;
  namespace: string;
}

interface SandboxTerminalsProps {
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

const SandboxTerminals: React.FC<SandboxTerminalsProps> = ({
  agents,
  activeAgent,
  currentNamespace,
  onSelectTab,
  onCloseTab,
  onCloseAll,
}) => {
  const [podInfoMap, setPodInfoMap] = React.useState<Record<string, PodInfo>>({});
  const [loadingPods, setLoadingPods] = React.useState<Record<string, boolean>>({});

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

  if (agents.length === 0) {
    return (
      <div className="os-sandbox-terms">
        <div className="os-sandbox-terms__header">
          <span className="os-sandbox-terms__title">Sandbox Terminals</span>
        </div>
        <div className="os-sandbox-terms__empty">
          Click "Terminal" on a sandbox to connect
        </div>
      </div>
    );
  }

  return (
    <div className="os-sandbox-terms">
      <div className="os-sandbox-terms__header">
        <div className="os-sandbox-terms__tabs">
          {agents.map((agent) => {
            const key = agentKey(agent);
            const isOtherNs = agent.namespace !== currentNamespace;
            const label = hasMultipleNamespaces
              ? `${agent.namespace}/${agent.name}`
              : agent.name;
            return (
              <div
                key={key}
                className={`os-sandbox-terms__tab ${key === activeAgent ? 'os-sandbox-terms__tab--active' : ''} ${isOtherNs ? 'os-sandbox-terms__tab--other-ns' : ''}`}
                onClick={() => onSelectTab(key)}
              >
                <span>{label}</span>
                <button
                  className="os-sandbox-terms__tab-close"
                  onClick={(e) => { e.stopPropagation(); onCloseTab(key); }}
                  aria-label={`Close ${agent.name}`}
                >
                  x
                </button>
              </div>
            );
          })}
        </div>
        <Button variant="plain" size="sm" onClick={onCloseAll} aria-label="Close all" style={{ fontSize: 12, padding: '2px 8px' }}>
          Close all
        </Button>
      </div>

      <div className="os-sandbox-terms__body">
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
              autoCommand="export HTTPS_PROXY=http://10.200.0.1:3128 HTTP_PROXY=http://10.200.0.1:3128 ANTHROPIC_BASE_URL=https://inference.local ANTHROPIC_API_KEY=unused NODE_TLS_REJECT_UNAUTHORIZED=0 CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1; printf '\033[2J\033[H'; echo '=== Sandbox: '$(hostname)' ==='; echo 'inference.local configured -- run: claude --bare'; echo"
            />
          );
        })}
      </div>
    </div>
  );
};

export default SandboxTerminals;
