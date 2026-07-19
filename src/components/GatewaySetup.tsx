import * as React from 'react';
import {
  EmptyState,
  EmptyStateBody,
  EmptyStateActions,
  EmptyStateFooter,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Button,
  Alert,
  Title,
} from '@patternfly/react-core';
import { AGENT_TYPES } from '../utils/types';
import * as api from '../utils/api';

interface GatewaySetupProps {
  namespace: string;
  onDeployed: () => void;
}

const GatewaySetup: React.FC<GatewaySetupProps> = ({ namespace, onDeployed }) => {
  const [deploying, setDeploying] = React.useState(false);
  const [error, setError] = React.useState('');
  const [agentType, setAgentType] = React.useState(AGENT_TYPES[0].name);

  const handleDeploy = async () => {
    setDeploying(true);
    setError('');
    try {
      await api.deployGateway(namespace, agentType);
      setTimeout(onDeployed, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to deploy gateway');
      setDeploying(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
      <EmptyState>
        <Title headingLevel="h2" size="lg">No OpenShell Gateway</Title>
        <EmptyStateBody>
          Deploy a gateway in <strong>{namespace}</strong> to start creating agent sandboxes.
        </EmptyStateBody>
        {error && <Alert variant="danger" isInline title={error} style={{ marginTop: 16, textAlign: 'left' }} />}
        <EmptyStateFooter>
          <FormGroup label="Agent Type" fieldId="gw-agent-type" style={{ marginBottom: 16 }}>
            <FormSelect id="gw-agent-type" value={agentType} onChange={(_e, val) => setAgentType(val)} style={{ minWidth: 200 }}>
              {AGENT_TYPES.map((at) => (
                <FormSelectOption key={at.name} value={at.name} label={at.displayName} />
              ))}
            </FormSelect>
          </FormGroup>
          <EmptyStateActions>
            <Button variant="primary" onClick={handleDeploy} isLoading={deploying} isDisabled={deploying}>
              {deploying ? 'Deploying Gateway...' : 'Deploy Gateway'}
            </Button>
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    </div>
  );
};

export default GatewaySetup;
