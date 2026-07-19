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
import GatewayPanel from './GatewayPanel';
import AgentList from './AgentList';
import OpenshellTerm from './OpenshellTerm';
import SandboxTerminals from './SandboxTerminals';
import GatewaySetup from './GatewaySetup';
import { AgentInfo, NamespaceInfo } from '../utils/types';
import * as api from '../utils/api';
import { GatewayInfo } from '../utils/api';
import '../styles/openshell-plugin.css';

interface AgentTerminal {
  name: string;
  namespace: string;
  agentType: string;
}

let useActiveNamespace: (() => [string, (ns: string) => void]) | undefined;
try {
  useActiveNamespace = require('@openshift-console/dynamic-plugin-sdk').useActiveNamespace;
} catch (_) {}

const PlaygroundPage: React.FC = () => {
  const sdkNs = useActiveNamespace ? useActiveNamespace() : undefined;

  const [localNamespace, setLocalNamespace] = React.useState('');
  const [namespaces, setNamespaces] = React.useState<NamespaceInfo[]>([]);
  const [agents, setAgents] = React.useState<AgentInfo[]>([]);
  const [loadingAgents, setLoadingAgents] = React.useState(false);
  const [agentError, setAgentError] = React.useState('');
  const [gateways, setGateways] = React.useState<GatewayInfo[]>([]);
  const [loadingGateways, setLoadingGateways] = React.useState(false);
  const [openTerminals, setOpenTerminals] = React.useState<AgentTerminal[]>([]);
  const [activeTerminal, setActiveTerminal] = React.useState('');
  const [splitPos, setSplitPos] = React.useState(50);
  const prevNamespaceRef = React.useRef('');
  const splitRef = React.useRef<HTMLDivElement>(null);

  const rawNamespace = sdkNs ? sdkNs[0] : localNamespace;
  const namespace = rawNamespace && !rawNamespace.startsWith('#') ? rawNamespace : localNamespace;
  const setNamespace = sdkNs ? sdkNs[1] : setLocalNamespace;

  const gwInitialDone = React.useRef(false);
  const loadGateways = React.useCallback(async () => {
    if (!namespace) { setGateways([]); return; }
    if (!gwInitialDone.current) setLoadingGateways(true);
    try {
      const gws = await api.listGateways(namespace);
      setGateways((prev) => JSON.stringify(prev) === JSON.stringify(gws) ? prev : gws);
    } catch {
      setGateways((prev) => prev.length === 0 ? prev : []);
    } finally {
      setLoadingGateways(false);
      gwInitialDone.current = true;
    }
  }, [namespace]);

  const initialLoadDone = React.useRef(false);
  const loadAgents = React.useCallback(async () => {
    if (!namespace) return;
    if (!initialLoadDone.current) setLoadingAgents(true);
    try {
      const a = await api.listAgents(namespace);
      setAgents((prev) => JSON.stringify(prev) === JSON.stringify(a) ? prev : a);
      setAgentError('');
    } catch (err: any) {
      setAgentError(err.message || 'Failed to load agents');
    } finally {
      setLoadingAgents(false);
      initialLoadDone.current = true;
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
      setGateways([]);
    }
    loadGateways();
    if (namespace) loadAgents();
  }, [namespace, loadGateways, loadAgents]);

  React.useEffect(() => {
    const loadNamespaces = (retries = 2) => {
      api.listNamespaces().then(setNamespaces).catch(() => {
        if (retries > 0) setTimeout(() => loadNamespaces(retries - 1), 1500);
      });
    };
    loadNamespaces();
  }, []);

  React.useEffect(() => {
    if (!namespace) return;
    const interval = setInterval(() => { loadAgents(); loadGateways(); }, 10000);
    return () => clearInterval(interval);
  }, [namespace, loadAgents, loadGateways]);

  const handleOpenTerminal = (name: string, ns: string, agentType?: string) => {
    const key = `${ns}/${name}`;
    const type = agentType || agents.find((a) => a.name === name && a.namespace === ns)?.agentType || '';
    setOpenTerminals((prev) =>
      prev.some((t) => `${t.namespace}/${t.name}` === key) ? prev : [...prev, { name, namespace: ns, agentType: type }],
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
        <Title headingLevel="h1" size="2xl">OpenShell Playground</Title>
        <p className="os-page__subtitle">Deploy and interact with OpenShell agent sandboxes</p>
      </div>

      <Toolbar>
        <ToolbarContent>
          <ToolbarItem>
            <FormSelect value={namespace} onChange={(_e, val) => setNamespace(val)} aria-label="Select namespace" style={{ minWidth: 200 }}>
              <FormSelectOption value="" label="-- Select namespace --" isDisabled />
              {namespaces.map((ns) => (
                <FormSelectOption key={ns.name} value={ns.name} label={ns.name} />
              ))}
            </FormSelect>
          </ToolbarItem>
          {namespace && <ToolbarItem><Label color="blue">{namespace}</Label></ToolbarItem>}
          <ToolbarItem>
            <Button variant="secondary" onClick={() => { loadAgents(); loadGateways(); }} isDisabled={!namespace}>Refresh</Button>
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      {!namespace ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
          <p>Select a namespace to get started.</p>
        </div>
      ) : loadingGateways ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
          <Spinner size="xl" />
        </div>
      ) : gateways.length === 0 ? (
        <GatewaySetup namespace={namespace} onDeployed={loadGateways} />
      ) : (
        <>
          <Split hasGutter className="os-top-row">
            <SplitItem className="os-top-row__deploy">
              <GatewayPanel
                namespace={namespace}
                gateways={gateways}
                onDeployed={loadAgents}
                onGatewaysChanged={loadGateways}
              />
            </SplitItem>
            <SplitItem isFilled className="os-top-row__agents">
              <Title headingLevel="h3" size="lg" style={{ marginBottom: 16 }}>Agent List</Title>
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
              <OpenshellTerm namespace={namespace} gateways={gateways} />
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
