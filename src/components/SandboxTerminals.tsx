import * as React from 'react';
import { Spinner, Button } from '@patternfly/react-core';
import TerminalSession from './TerminalSession';
import { PodInfo } from '../utils/types';
import * as api from '../utils/api';

interface AgentTerminal {
  name: string;
  namespace: string;
  agentType: string;
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

const BASE_ENV = `export HOME=/sandbox TERM=xterm-256color
export HTTPS_PROXY=http://10.200.0.1:3128 HTTP_PROXY=http://10.200.0.1:3128
export SSL_CERT_FILE=/etc/openshell-tls/ca-bundle.pem NODE_EXTRA_CA_CERTS=/etc/openshell-tls/openshell-ca.pem
export CURL_CA_BUNDLE=/etc/openshell-tls/ca-bundle.pem REQUESTS_CA_BUNDLE=/etc/openshell-tls/ca-bundle.pem
export CODEX_CA_CERTIFICATE=/etc/openshell-tls/ca-bundle.pem GIT_SSL_CAINFO=/etc/openshell-tls/ca-bundle.pem
export ANTHROPIC_BASE_URL=https://inference.local ANTHROPIC_API_KEY=unused
export OPENAI_BASE_URL=https://inference.local/v1 OPENAI_API_KEY=unused
export CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1
cd /sandbox
set +m
trap 'kill 0' EXIT`;

const CLAUDE_SETUP = `echo "Claude Code ready. Run: claude --bare"`;

const CODEX_SETUP = `mkdir -p /sandbox/.codex
if [ ! -f /sandbox/.codex/config.toml ]; then
  cat > /sandbox/.codex/config.toml << 'CODEXCFG'
model_provider = "openshell"

[model_providers.openshell]
name = "OpenShell Inference"
base_url = "https://inference.local/v1"
env_key = "OPENAI_API_KEY"
supports_websockets = false
CODEXCFG
fi
export CODEX_HOME=/sandbox/.codex
echo "Codex ready. Run: codex --full-auto"`;


const OPENCODE_SETUP = `if [ -f /sandbox/.local/share/opencode/opencode.db ]; then
  python3 -c "import sqlite3;sqlite3.connect('/sandbox/.local/share/opencode/opencode.db').execute('select 1')" 2>/dev/null || { rm -f /sandbox/.local/share/opencode/opencode.db*; echo "reset corrupt opencode db"; }
fi
if [ -f /sandbox/opencode.json ]; then echo "OpenCode ready. Run: opencode (new) or opencode -c (resume)"; fi
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
fi`;

const COPILOT_SETUP = `export COPILOT_PROVIDER_BASE_URL=https://inference.local/v1
export COPILOT_PROVIDER_API_KEY=unused
COPILOT_MODEL=$(curl -sk https://inference.local/v1/models 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['data'][0]['id'])" 2>/dev/null)
[ -n "$COPILOT_MODEL" ] && export COPILOT_MODEL
echo "Copilot ready. Run: copilot"
echo "  Provider: inference.local (model: \${COPILOT_MODEL:-not detected})"`;

const OLLAMA_SETUP = `mkdir -p /sandbox/.codex
if [ ! -f /sandbox/.codex/config.toml ]; then
  cat > /sandbox/.codex/config.toml << 'CODEXCFG'
model_provider = "openshell"

[model_providers.openshell]
name = "OpenShell Inference"
base_url = "https://inference.local/v1"
env_key = "OPENAI_API_KEY"
supports_websockets = false
CODEXCFG
fi
export CODEX_HOME=/sandbox/.codex
if [ ! -f /sandbox/opencode.json ] && command -v opencode >/dev/null 2>&1; then
  MODELS=$(curl -sk https://inference.local/v1/models 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);[print(m['id']) for m in d.get('data',[])]" 2>/dev/null)
  if [ -n "$MODELS" ]; then
    python3 -c "
import json,sys
ms = [l.strip() for l in sys.stdin if l.strip()]
cfg = {'provider':{'openai-compatible':{'npm':'@ai-sdk/openai-compatible','options':{'baseURL':'https://inference.local/v1','apiKey':'unused'},'models':{m:{'name':m} for m in ms}}}}
json.dump(cfg, open('/sandbox/opencode.json','w'), indent=2)
" <<< "$MODELS"
  fi
fi
echo "Ollama sandbox ready. Run: ollama"
echo "  Agents: claude, codex, opencode (all via inference.local)"`;

const PI_SETUP = `mkdir -p /sandbox/.pi/agent
if [ ! -f /sandbox/.pi/agent/models.json ]; then
  MODELS=$(curl -sk https://inference.local/v1/models 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
ms=[{'id':m['id']} for m in d.get('data',[])]
cfg={'providers':{'openshell':{'baseUrl':'https://inference.local/v1','api':'openai-completions','apiKey':'unused','compat':{'supportsDeveloperRole':False,'supportsReasoningEffort':False},'models':ms}}}
json.dump(cfg,open('/sandbox/.pi/agent/models.json','w'),indent=2)
print(', '.join(m['id'] for m in ms))
" 2>/dev/null)
  [ -n "$MODELS" ] && echo "Pi configured with models: $MODELS"
fi
echo "Pi ready. Run: pi"
echo "  Models config: ~/.pi/agent/models.json"
echo "  Select model in Pi with /model"`;

const HERMES_SETUP = `export HERMES_HOME=/sandbox/.hermes
mkdir -p /sandbox/.hermes/{cron,sessions,logs/curator,memories,profiles,hooks,skills,dashboard-themes,pairing,image_cache,audio_cache} 2>/dev/null
chmod -R 777 /sandbox/.hermes 2>/dev/null
echo "Hermes Agent ready. Run: hermes chat"`;

const DEFAULT_SETUP = `echo "Sandbox ready."`;

function agentSetup(agentType: string): string {
  switch (agentType) {
    case 'claude': return CLAUDE_SETUP;
    case 'codex': return CODEX_SETUP;
    case 'opencode': return OPENCODE_SETUP;
    case 'copilot': return COPILOT_SETUP;
    case 'ollama': return OLLAMA_SETUP;
    case 'pi': return PI_SETUP;
    case 'hermes': return HERMES_SETUP;
    default: return DEFAULT_SETUP;
  }
}

function buildAutoCommand(agentType: string): string {
  return `NETNS=$(ls /var/run/netns/ 2>/dev/null | head -1)
[ -z "$NETNS" ] && exec bash
cat > /tmp/.sandbox-env.sh << 'INITEOF'
${BASE_ENV}
${agentSetup(agentType)}
INITEOF
exec nsenter --net=/var/run/netns/$NETNS bash --rcfile /tmp/.sandbox-env.sh`;
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
    <div className="os-sandbox-terms" ref={containerRef}>
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
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button className="os-fullscreen-btn" onClick={toggleFullscreen} title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}>
            {fullscreen ? '✖' : '⤢'}
          </button>
          <Button variant="plain" size="sm" onClick={onCloseAll} aria-label="Close all" style={{ fontSize: 12, padding: '2px 8px' }}>
            Close all
          </Button>
        </div>
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
              autoCommand={buildAutoCommand(agent.agentType)}
            />
          );
        })}
      </div>
    </div>
  );
};

export default SandboxTerminals;
