import * as React from 'react';
import {
  Title,
  FormGroup,
  FormSelect,
  FormSelectOption,
  NumberInput,
  Button,
  Alert,
} from '@patternfly/react-core';
import CredentialsModal from './CredentialsModal';
import { AGENT_TYPES, ProviderInfo, WarmPoolInfo } from '../utils/types';
import * as api from '../utils/api';

const CREATE_PROVIDER_VALUE = '__create_new__';

interface DeployPanelProps {
  namespace: string;
  onDeployed: () => void;
}

const DeployPanel: React.FC<DeployPanelProps> = ({ namespace, onDeployed }) => {
  const [providers, setProviders] = React.useState<ProviderInfo[]>([]);
  const [warmPools, setWarmPools] = React.useState<WarmPoolInfo[]>([]);

  const [agentType, setAgentType] = React.useState(AGENT_TYPES[0].name);
  const [provider, setProvider] = React.useState('');
  const [warmPool, setWarmPool] = React.useState('');
  const [model, setModel] = React.useState('claude-sonnet-4-6');
  const [count, setCount] = React.useState(1);

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [showCredModal, setShowCredModal] = React.useState(false);

  React.useEffect(() => {
    if (!namespace) return;
    api.listProviders(namespace).then((p) => {
      setProviders(p);
      if (p.length > 0) setProvider(p[0].name);
    }).catch(() => {});
    api.listWarmPools(namespace).then((w) => {
      setWarmPools(w);
    }).catch(() => {});
  }, [namespace]);

  const handleProviderChange = (_e: any, val: string) => {
    if (val === CREATE_PROVIDER_VALUE) {
      setShowCredModal(true);
    } else {
      setProvider(val);
    }
  };

  const handleProviderCreated = (name: string) => {
    setShowCredModal(false);
    api.listProviders(namespace).then((p) => {
      setProviders(p);
      setProvider(name);
    }).catch(() => {});
  };

  const handleDeploy = async () => {
    if (!namespace || !agentType || !provider) {
      setError('Please select namespace, agent type, and provider');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const selectedAgent = AGENT_TYPES.find((a) => a.name === agentType);
      await api.deploy({
        namespace,
        agentType: selectedAgent?.sandbox || 'base',
        provider,
        warmPool,
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

  return (
    <div className="os-deploy-panel">
      <Title headingLevel="h3" size="lg" style={{ marginBottom: 16 }}>
        Deploy
      </Title>

      {error && (
        <Alert variant="danger" isInline title={error} style={{ marginBottom: 12 }} />
      )}

      <FormGroup label="Agent Type" fieldId="agent-type" style={{ marginBottom: 12 }}>
        <FormSelect
          id="agent-type"
          value={agentType}
          onChange={(_e, val) => setAgentType(val)}
          isDisabled={!namespace}
        >
          {AGENT_TYPES.map((at) => (
            <FormSelectOption key={at.name} value={at.name} label={at.displayName} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup label="Provider" fieldId="provider" style={{ marginBottom: 12 }}>
        <FormSelect
          id="provider"
          value={provider}
          onChange={handleProviderChange}
          isDisabled={!namespace}
        >
          <FormSelectOption value="" label="-- Select provider --" isDisabled />
          <FormSelectOption value={CREATE_PROVIDER_VALUE} label="+ Create new provider..." />
          {providers.map((p) => (
            <FormSelectOption key={p.name} value={p.name} label={`${p.name} (${p.type})`} />
          ))}
        </FormSelect>
      </FormGroup>

      <FormGroup label="Model" fieldId="model" style={{ marginBottom: 12 }}>
        <FormSelect
          id="model"
          value={model}
          onChange={(_e, val) => setModel(val)}
          isDisabled={!namespace}
        >
          <FormSelectOption value="claude-sonnet-4-6" label="Claude Sonnet 4.6 (1M)" />
          <FormSelectOption value="claude-sonnet-5" label="Claude Sonnet 5 (1M)" />
          <FormSelectOption value="claude-opus-4-6" label="Claude Opus 4.6 (1M)" />
          <FormSelectOption value="claude-opus-4-7" label="Claude Opus 4.7 (1M)" />
          <FormSelectOption value="claude-opus-4-8" label="Claude Opus 4.8 (1M)" />
          <FormSelectOption value="claude-fable-5" label="Claude Fable 5 (1M)" />
          <FormSelectOption value="claude-haiku-4-5-20251001" label="Claude Haiku 4.5 (200k)" />
        </FormSelect>
      </FormGroup>

      <FormGroup label="Warm Pool" fieldId="warm-pool" style={{ marginBottom: 12 }}>
        <FormSelect
          id="warm-pool"
          value={warmPool}
          onChange={(_e, val) => setWarmPool(val)}
          isDisabled={!namespace}
        >
          <FormSelectOption value="" label="Default" />
          {warmPools.map((wp) => (
            <FormSelectOption
              key={wp.name}
              value={wp.name}
              label={`${wp.name} (${wp.available}/${wp.replicas} available)`}
            />
          ))}
        </FormSelect>
      </FormGroup>

      <div className="os-deploy-panel__actions">
        <Button
          variant="primary"
          onClick={handleDeploy}
          isLoading={loading}
          isDisabled={loading || !namespace || !agentType || !provider}
        >
          Go
        </Button>
        <NumberInput
          value={count}
          min={1}
          max={10}
          onMinus={() => setCount(Math.max(1, count - 1))}
          onPlus={() => setCount(Math.min(10, count + 1))}
          onChange={(e) => {
            const val = parseInt((e.target as HTMLInputElement).value, 10);
            if (!isNaN(val) && val >= 1 && val <= 10) setCount(val);
          }}
          widthChars={2}
        />
      </div>

      <CredentialsModal
        isOpen={showCredModal}
        namespace={namespace}
        onClose={() => setShowCredModal(false)}
        onCreated={handleProviderCreated}
      />
    </div>
  );
};

export default DeployPanel;
