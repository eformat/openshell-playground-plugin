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
              autoCommand={`NETNS=$(ls /var/run/netns/ 2>/dev/null | head -1)
[ -z "$NETNS" ] && exec bash
_COLS=$(tput cols 2>/dev/null || echo 80)
_ROWS=$(tput lines 2>/dev/null || echo 24)
cat > /tmp/.sandbox-env.sh << 'INITEOF'
export HTTPS_PROXY=http://10.200.0.1:3128 HTTP_PROXY=http://10.200.0.1:3128
export SSL_CERT_FILE=/etc/openshell-tls/ca-bundle.pem NODE_EXTRA_CA_CERTS=/etc/openshell-tls/openshell-ca.pem
export CURL_CA_BUNDLE=/etc/openshell-tls/ca-bundle.pem REQUESTS_CA_BUNDLE=/etc/openshell-tls/ca-bundle.pem
export CODEX_CA_CERTIFICATE=/etc/openshell-tls/ca-bundle.pem GIT_SSL_CAINFO=/etc/openshell-tls/ca-bundle.pem
export ANTHROPIC_BASE_URL=https://inference.local ANTHROPIC_API_KEY=unused
export OPENAI_BASE_URL=https://inference.local/v1 OPENAI_API_KEY=unused
export CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1
if [ -f /sandbox/opencode.json ]; then echo "opencode configured. Run: opencode (new) or opencode -c (resume)"; fi
if [ ! -f /sandbox/opencode.json ] && command -v opencode >/dev/null 2>&1; then
  MODELS=$(curl -sk https://inference.local/v1/models 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);[print(m['id']) for m in d.get('data',[])]" 2>/dev/null)
  if [ -n "$MODELS" ]; then
    python3 -c "
import json,sys
ms = [l.strip() for l in sys.stdin if l.strip()]
cfg = {'provider':{'openai-compatible':{'npm':'@ai-sdk/openai-compatible','options':{'baseURL':'https://inference.local/v1','apiKey':'unused'},'models':{m:{'name':m} for m in ms}}}}
json.dump(cfg, open('/sandbox/opencode.json','w'), indent=2)
print('opencode.json configured:', ', '.join(ms))
" <<< "$MODELS"
  fi
fi
INITEOF
exec nsenter --net=/var/run/netns/$NETNS -- env HOME=/sandbox TERM=xterm-256color COLUMNS=$_COLS LINES=$_ROWS bash --rcfile /tmp/.sandbox-env.sh`}
            />
          );
        })}
      </div>
    </div>
  );
};

export default SandboxTerminals;
