import * as React from 'react';
import {
  Title,
  FormGroup,
  FormSelect,
  FormSelectOption,
  NumberInput,
  Button,
  Alert,
  Label,
  Spinner,
} from '@patternfly/react-core';
import CredentialsModal from './CredentialsModal';
import { AGENT_TYPES, ProviderInfo } from '../utils/types';
import * as api from '../utils/api';
import { GatewayInfo } from '../utils/api';

interface GatewayPanelProps {
  namespace: string;
  gateways: GatewayInfo[];
  onDeployed: () => void;
  onGatewaysChanged: () => void;
}

const GatewayPanel: React.FC<GatewayPanelProps> = ({ namespace, gateways, onDeployed, onGatewaysChanged }) => {
  const [selectedGateway, setSelectedGateway] = React.useState('');
  const [providers, setProviders] = React.useState<ProviderInfo[]>([]);
  const [provider, setProvider] = React.useState('');
  const [model, setModel] = React.useState('');
  const [count, setCount] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [deployingGw, setDeployingGw] = React.useState(false);
  const [error, setError] = React.useState('');
  const [showCredModal, setShowCredModal] = React.useState(false);
  const [newGwType, setNewGwType] = React.useState('');

  const selectedGw = gateways.find((g) => g.name === selectedGateway);
  const agentType = selectedGw?.agentType || '';
  const agentInfo = AGENT_TYPES.find((a) => a.name === agentType);
  const suggestedModels = agentInfo?.models || [];

  // Auto-select first gateway
  React.useEffect(() => {
    if (gateways.length > 0 && !selectedGateway) {
      setSelectedGateway(gateways[0].name);
    }
  }, [gateways, selectedGateway]);

  // Load providers and inference config when gateway changes
  React.useEffect(() => {
    if (!namespace || !selectedGateway) return;
    api.listProviders(namespace, selectedGateway).then((p) => {
      setProviders(p);
      if (p.length > 0) setProvider(p[0].name);
      else setProvider('');
    }).catch(() => setProviders([]));

    // Load actual inference model from gateway
    api.getInferenceConfig(namespace, selectedGateway).then((cfg) => {
      if (cfg.model) setModel(cfg.model);
      if (cfg.provider && !provider) setProvider(cfg.provider);
    }).catch(() => {
      if (agentInfo && agentInfo.models.length > 0) {
        setModel(agentInfo.models[0].id);
      }
    });
  }, [namespace, selectedGateway]);

  const handleDeleteGateway = async (gwName: string) => {
    if (!confirm(`Delete gateway "${gwName}" and all its resources?`)) return;
    try {
      await api.deleteGateway(namespace, gwName);
      if (selectedGateway === gwName) setSelectedGateway('');
      onGatewaysChanged();
    } catch (err: any) {
      setError(err.message || 'Failed to delete gateway');
    }
  };

  const handleDeployGateway = async (type: string) => {
    setDeployingGw(true);
    setError('');
    try {
      await api.deployGateway(namespace, type);
      onGatewaysChanged();
    } catch (err: any) {
      setError(err.message || 'Failed to deploy gateway');
    } finally {
      setDeployingGw(false);
      setNewGwType('');
    }
  };

  const handleProviderCreated = (name: string) => {
    setShowCredModal(false);
    if (selectedGateway) {
      api.listProviders(namespace, selectedGateway).then((p) => {
        setProviders(p);
        setProvider(name);
      }).catch(() => {});
    }
  };

  const handleDeleteProvider = async () => {
    if (!provider || !namespace) return;
    if (!confirm(`Delete provider "${provider}"?`)) return;
    try {
      await api.deleteProvider(provider, namespace, selectedGateway);
      setProvider('');
      api.listProviders(namespace, selectedGateway).then((p) => {
        setProviders(p);
        if (p.length > 0) setProvider(p[0].name);
      }).catch(() => {});
    } catch (err: any) {
      setError(err.message || 'Failed to delete provider');
    }
  };

  const handleDeploy = async () => {
    if (!namespace || !selectedGateway || !provider) {
      setError('Select a gateway, provider, and model');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.deploy({
        namespace,
        gateway: selectedGateway,
        agentType: agentInfo?.sandbox || 'base',
        agentLabel: agentType,
        provider,
        warmPool: '',
        count,
        model,
      });
      onDeployed();
    } catch (err: any) {
      setError(err.message || 'Deployment failed');
    } finally {
      setLoading(false);
    }
  };

  // Deployed gateway types for filtering "Deploy Gateway" options
  const deployedTypes = new Set(gateways.map((g) => g.agentType));
  const availableTypes = AGENT_TYPES.filter((a) => !deployedTypes.has(a.name));

  return (
    <div className="os-gateway-panel">
      <div className="os-gateway-panel__header">
        <Title headingLevel="h3" size="lg">Gateways</Title>
      </div>

      <div className="os-gateway-panel__tabs">
        {gateways.map((gw) => (
          <div key={gw.name} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              className={`os-gateway-tab ${gw.name === selectedGateway ? 'os-gateway-tab--active' : ''}`}
              onClick={() => setSelectedGateway(gw.name)}
            >
              <span style={{ textTransform: 'capitalize' }}>{gw.agentType}</span>
              {gw.status === 'Running' ? (
                <span className="os-status-dot os-status-dot--running" />
              ) : (
                <Spinner size="sm" />
              )}
            </button>
            <button
              className="os-gateway-tab__delete"
              onClick={() => handleDeleteGateway(gw.name)}
              aria-label={`Delete ${gw.agentType} gateway`}
              title="Delete gateway"
            >x</button>
          </div>
        ))}
        {availableTypes.length > 0 && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {newGwType ? (
              <>
                <FormSelect value={newGwType} onChange={(_e, val) => setNewGwType(val)} style={{ width: 120 }}>
                  <FormSelectOption value="" label="Type..." isDisabled />
                  {availableTypes.map((a) => (
                    <FormSelectOption key={a.name} value={a.name} label={a.displayName} />
                  ))}
                </FormSelect>
                <Button size="sm" variant="primary" isLoading={deployingGw} isDisabled={!newGwType || deployingGw} onClick={() => handleDeployGateway(newGwType)}>
                  Deploy
                </Button>
                <Button size="sm" variant="plain" onClick={() => setNewGwType('')}>x</Button>
              </>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setNewGwType(availableTypes[0]?.name || '')}>
                + Gateway
              </Button>
            )}
          </div>
        )}
      </div>

      {error && <Alert variant="danger" isInline title={error} style={{ marginTop: 8, marginBottom: 8 }} />}

      {selectedGateway && (
        <div className="os-gateway-panel__grid">
          <FormGroup label="Provider" fieldId="provider">
            <div style={{ display: 'flex', gap: 4 }}>
              <FormSelect id="provider" value={provider} onChange={(_e, val) => {
                if (val === '__new__') setShowCredModal(true);
                else setProvider(val);
              }} style={{ flex: 1 }}>
                <FormSelectOption value="" label="-- Select --" isDisabled />
                <FormSelectOption value="__new__" label="+ New provider..." />
                {providers.map((p) => (
                  <FormSelectOption key={p.name} value={p.name} label={`${p.name} (${p.type})`} />
                ))}
              </FormSelect>
              {provider && provider !== '__new__' && (
                <Button variant="plain" size="sm" onClick={handleDeleteProvider} style={{ padding: '4px 6px', color: 'var(--pf-t--global--color--status--danger--default)' }}>x</Button>
              )}
            </div>
          </FormGroup>

          <FormGroup label="Model" fieldId="model">
            <input
              id="model"
              list={`model-${agentType}`}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Enter model ID"
              className="pf-v6-c-form-control"
              style={{ width: '100%' }}
            />
            <datalist id={`model-${agentType}`}>
              {suggestedModels.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </datalist>
          </FormGroup>

          <div className="os-gateway-panel__actions">
            <Button variant="primary" onClick={handleDeploy} isLoading={loading} isDisabled={loading || !provider}>
              Deploy Sandbox
            </Button>
            <NumberInput value={count} min={1} max={10}
              onMinus={() => setCount(Math.max(1, count - 1))}
              onPlus={() => setCount(Math.min(10, count + 1))}
              onChange={(e) => { const v = parseInt((e.target as HTMLInputElement).value, 10); if (!isNaN(v) && v >= 1 && v <= 10) setCount(v); }}
              widthChars={2}
            />
            {agentType && <Label color="blue" style={{ marginLeft: 8 }}>{agentType}</Label>}
          </div>
        </div>
      )}

      <CredentialsModal
        isOpen={showCredModal}
        namespace={namespace}
        gateway={selectedGateway}
        onClose={() => setShowCredModal(false)}
        onCreated={handleProviderCreated}
      />
    </div>
  );
};

export default GatewayPanel;
