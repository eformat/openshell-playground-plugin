import * as React from 'react';
import {
  EmptyState,
  EmptyStateBody,
  EmptyStateActions,
  EmptyStateFooter,
  Button,
  Alert,
  Title,
} from '@patternfly/react-core';
import * as api from '../utils/api';

interface GatewaySetupProps {
  namespace: string;
  onDeployed: () => void;
}

const GatewaySetup: React.FC<GatewaySetupProps> = ({ namespace, onDeployed }) => {
  const [deploying, setDeploying] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleDeploy = async () => {
    setDeploying(true);
    setError('');
    try {
      await api.deployGateway(namespace, 'default');
      for (let i = 0; i < 60; i++) {
        const gws = await api.listGateways(namespace).catch(() => []);
        if (gws.some((g) => g.status === 'Running')) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      onDeployed();
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
