import * as React from 'react';
import {
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  FormSelect,
  FormSelectOption,
  Button,
  Label,
  Spinner,
  Split,
  SplitItem,
} from '@patternfly/react-core';
import DeployPanel from './DeployPanel';
import AgentList from './AgentList';
import OpenshellTerm from './OpenshellTerm';
import SandboxTerminals from './SandboxTerminals';
import GatewaySetup from './GatewaySetup';
import { AgentInfo, NamespaceInfo } from '../utils/types';
import * as api from '../utils/api';
import '../styles/openshell-plugin.css';

interface AgentTerminal {
  name: string;
  namespace: string;
}

let useActiveNamespace: (() => [string, (ns: string) => void]) | undefined;
try {
  useActiveNamespace = require('@openshift-console/dynamic-plugin-sdk').useActiveNamespace;
} catch (_) {
  // SDK hook not available in dev mode
}

const PlaygroundPage: React.FC = () => {
  const sdkNs = useActiveNamespace ? useActiveNamespace() : undefined;

  const [localNamespace, setLocalNamespace] = React.useState('');
  const [namespaces, setNamespaces] = React.useState<NamespaceInfo[]>([]);
  const [agents, setAgents] = React.useState<AgentInfo[]>([]);
  const [loadingAgents, setLoadingAgents] = React.useState(false);
  const [agentError, setAgentError] = React.useState('');
  const [gatewayExists, setGatewayExists] = React.useState<boolean | null>(null);
  const [checkingGateway, setCheckingGateway] = React.useState(false);
  const [openTerminals, setOpenTerminals] = React.useState<AgentTerminal[]>([]);
  const [activeTerminal, setActiveTerminal] = React.useState('');
  const [splitPos, setSplitPos] = React.useState(50);
  const prevNamespaceRef = React.useRef('');
  const splitRef = React.useRef<HTMLDivElement>(null);

  const rawNamespace = sdkNs ? sdkNs[0] : localNamespace;
  const namespace = rawNamespace && !rawNamespace.startsWith('#') ? rawNamespace : localNamespace;
  const setNamespace = sdkNs ? sdkNs[1] : setLocalNamespace;

  const checkGateway = React.useCallback(async () => {
    if (!namespace) {
      setGatewayExists(null);
      return;
    }
    setCheckingGateway(true);
    try {
      await api.getGatewayPod(namespace);
      setGatewayExists(true);
    } catch {
      setGatewayExists(false);
    } finally {
      setCheckingGateway(false);
    }
  }, [namespace]);

  React.useEffect(() => {
    const prev = prevNamespaceRef.current;
    prevNamespaceRef.current = namespace;
    if (prev && prev !== namespace) {
      setAgents([]);
      setAgentError('');
      setOpenTerminals([]);
      setActiveTerminal('');
      setGatewayExists(null);
    }
    checkGateway();
  }, [namespace, checkGateway]);

  React.useEffect(() => {
    const loadNamespaces = (retries = 2) => {
      api.listNamespaces().then(setNamespaces).catch(() => {
        if (retries > 0) setTimeout(() => loadNamespaces(retries - 1), 1500);
      });
    };
    loadNamespaces();
  }, []);

  const loadAgents = React.useCallback(async () => {
    if (!namespace) return;
    setLoadingAgents(true);
    setAgentError('');
    try {
      const a = await api.listAgents(namespace);
      setAgents(a);
    } catch (err: any) {
      setAgentError(err.message || 'Failed to load agents');
    } finally {
      setLoadingAgents(false);
    }
  }, [namespace]);

  React.useEffect(() => {
    if (namespace) {
      loadAgents();
    } else {
      setAgents([]);
    }
  }, [namespace, loadAgents]);

  React.useEffect(() => {
    if (!namespace) return;
    const interval = setInterval(loadAgents, 10000);
    return () => clearInterval(interval);
  }, [namespace, loadAgents]);

  const handleOpenTerminal = (name: string, ns: string) => {
    const key = `${ns}/${name}`;
    setOpenTerminals((prev) =>
      prev.some((t) => `${t.namespace}/${t.name}` === key) ? prev : [...prev, { name, namespace: ns }],
    );
    setActiveTerminal(key);
  };

  const handleCloseTab = (key: string) => {
    setOpenTerminals((prev) => {
      const next = prev.filter((t) => `${t.namespace}/${t.name}` !== key);
      if (key === activeTerminal && next.length > 0) {
        const last = next[next.length - 1];
        setActiveTerminal(`${last.namespace}/${last.name}`);
      }
      return next;
    });
  };

  const handleDividerDrag = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = splitRef.current;
    if (!container) return;

    const handleMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitPos(Math.max(20, Math.min(80, pct)));
    };

    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, []);

  return (
    <div className="os-page">
      <div className="os-page__header">
        <Title headingLevel="h1" size="2xl">
          OpenShell Playground
        </Title>
        <p className="os-page__subtitle">
          Deploy and interact with OpenShell agent sandboxes
        </p>
      </div>

      <Toolbar>
        <ToolbarContent>
          <ToolbarItem>
            <FormSelect
              value={namespace}
              onChange={(_e, val) => setNamespace(val)}
              aria-label="Select namespace"
              style={{ minWidth: 200 }}
            >
              <FormSelectOption value="" label="-- Select namespace --" isDisabled />
              {namespaces.map((ns) => (
                <FormSelectOption key={ns.name} value={ns.name} label={ns.name} />
              ))}
            </FormSelect>
          </ToolbarItem>
          {namespace && (
            <ToolbarItem>
              <Label color="blue">{namespace}</Label>
            </ToolbarItem>
          )}
          <ToolbarItem>
            <Button variant="secondary" onClick={loadAgents} isDisabled={!namespace}>
              Refresh
            </Button>
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      {!namespace ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
          <p>Select a namespace to get started.</p>
        </div>
      ) : checkingGateway ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
          <Spinner size="xl" />
        </div>
      ) : gatewayExists === false ? (
        <GatewaySetup namespace={namespace} onDeployed={checkGateway} />
      ) : (
        <>
          <Split hasGutter className="os-top-row">
            <SplitItem className="os-top-row__deploy">
              <DeployPanel key={namespace || '__none__'} namespace={namespace} onDeployed={loadAgents} />
            </SplitItem>
            <SplitItem isFilled className="os-top-row__agents">
              <Title headingLevel="h3" size="lg" style={{ marginBottom: 16 }}>
                Agent List
              </Title>
              <AgentList
                namespace={namespace}
                agents={agents}
                loading={loadingAgents}
                error={agentError}
                onOpenTerminal={handleOpenTerminal}
                onRefresh={loadAgents}
              />
            </SplitItem>
          </Split>

          <div className="os-terminal-split" ref={splitRef}>
            <div className="os-terminal-split__left" style={{ width: `${splitPos}%` }}>
              <OpenshellTerm key={`term-${namespace}`} namespace={namespace} />
            </div>
            <div className="os-terminal-split__divider" onMouseDown={handleDividerDrag} />
            <div className="os-terminal-split__right" style={{ width: `${100 - splitPos}%` }}>
              <SandboxTerminals
                agents={openTerminals}
                activeAgent={activeTerminal}
                currentNamespace={namespace}
                onSelectTab={(key) => setActiveTerminal(key)}
                onCloseTab={handleCloseTab}
                onCloseAll={() => setOpenTerminals([])}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default PlaygroundPage;
