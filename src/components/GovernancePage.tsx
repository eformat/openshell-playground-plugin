import * as React from 'react';
import {
  Alert,
  Button,
  FormSelect,
  FormSelectOption,
  Label,
  PageSection,
  Spinner,
  Tab,
  Tabs,
  TabTitleText,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core';
import PolicySummaryCards from './PolicySummaryCards';
import PolicyTable from './PolicyTable';
import ProposalTable from './ProposalTable';
import { GovernancePoliciesResponse, NamespaceInfo, ProposalInfo } from '../utils/types';
import * as api from '../utils/api';
import '../styles/openshell-plugin.css';

let useActiveNamespace: (() => [string, (ns: string) => void]) | undefined;
try {
  useActiveNamespace = require('@openshift-console/dynamic-plugin-sdk').useActiveNamespace;
} catch (_) {}

const EMPTY_POLICIES: GovernancePoliciesResponse = {
  global: { exists: false, status: 'none', network_policies: 0 },
  sandboxes: [],
};

const GovernancePage: React.FC = () => {
  const sdkNs = useActiveNamespace ? useActiveNamespace() : undefined;

  const [localNamespace, setLocalNamespace] = React.useState('');
  const [namespaces, setNamespaces] = React.useState<NamespaceInfo[]>([]);
  const [policies, setPolicies] = React.useState<GovernancePoliciesResponse>(EMPTY_POLICIES);
  const [proposals, setProposals] = React.useState<ProposalInfo[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<string | number>('overview');
  const initialLoadDone = React.useRef(false);

  const rawNamespace = sdkNs ? sdkNs[0] : localNamespace;
  const namespace = rawNamespace && !rawNamespace.startsWith('#') ? rawNamespace : localNamespace;
  const setNamespace = sdkNs ? sdkNs[1] : setLocalNamespace;

  React.useEffect(() => {
    const loadNamespaces = (retries = 2) => {
      api.listNamespaces().then(setNamespaces).catch(() => {
        if (retries > 0) setTimeout(() => loadNamespaces(retries - 1), 1500);
      });
    };
    loadNamespaces();
  }, []);

  const loadData = React.useCallback(async () => {
    if (!namespace) return;
    if (!initialLoadDone.current) setLoading(true);
    setError('');
    try {
      const [pol, prop] = await Promise.all([
        api.listGovernancePolicies(namespace),
        api.listGovernanceProposals(namespace),
      ]);
      setPolicies(pol);
      setProposals(prop);
    } catch (err: any) {
      setError(err.message || 'Failed to load governance data');
    } finally {
      setLoading(false);
      initialLoadDone.current = true;
    }
  }, [namespace]);

  React.useEffect(() => {
    initialLoadDone.current = false;
    setPolicies(EMPTY_POLICIES);
    setProposals([]);
    setError('');
    loadData();
  }, [namespace, loadData]);

  React.useEffect(() => {
    if (!namespace) return;
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, [namespace, loadData]);

  return (
    <div className="os-page">
      <div className="os-page__header">
        <Title headingLevel="h1" size="2xl">Governance</Title>
        <p className="os-page__subtitle">OPA policy status and Policy Advisor proposals</p>
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
          {namespace && <ToolbarItem><Label color="blue">{namespace}</Label></ToolbarItem>}
          <ToolbarItem>
            <Button variant="secondary" onClick={loadData} isDisabled={!namespace || loading}>
              Refresh
            </Button>
          </ToolbarItem>
          {loading && (
            <ToolbarItem>
              <Spinner size="sm" />
            </ToolbarItem>
          )}
        </ToolbarContent>
      </Toolbar>

      {!namespace ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '4rem' }}>
          <p>Select a namespace to view governance data.</p>
        </div>
      ) : (
        <>
          {error && (
            <PageSection>
              <Alert variant="danger" isInline title="Error loading governance data">
                {error}
              </Alert>
            </PageSection>
          )}

          <PageSection padding={{ default: 'noPadding' }}>
            <Tabs
              activeKey={activeTab}
              onSelect={(_e, key) => setActiveTab(key)}
              isBox={false}
              style={{ padding: '0 1.5rem' }}
            >
              <Tab eventKey="overview" title={<TabTitleText>Overview</TabTitleText>}>
                <PageSection>
                  <PolicySummaryCards policies={policies} proposals={proposals} />
                </PageSection>
              </Tab>

              <Tab eventKey="policies" title={<TabTitleText>Policies</TabTitleText>}>
                <PageSection>
                  <PolicyTable global={policies.global} sandboxes={policies.sandboxes} />
                </PageSection>
              </Tab>

              <Tab
                eventKey="proposals"
                title={
                  <TabTitleText>
                    Proposals
                    {proposals.filter((p) => p.status === 'pending').length > 0 && (
                      <Label
                        color="orange"
                        isCompact
                        style={{ marginLeft: '0.5rem' }}
                      >
                        {proposals.filter((p) => p.status === 'pending').length}
                      </Label>
                    )}
                  </TabTitleText>
                }
              >
                <PageSection>
                  <ProposalTable proposals={proposals} />
                </PageSection>
              </Tab>
            </Tabs>
          </PageSection>
        </>
      )}
    </div>
  );
};

export default GovernancePage;
