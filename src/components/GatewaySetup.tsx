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
      await api.deployGateway(namespace);
      setTimeout(onDeployed, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to deploy gateway');
      setDeploying(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
      <EmptyState>
        <Title headingLevel="h2" size="lg">
          No OpenShell Gateway
        </Title>
        <EmptyStateBody>
          Namespace <strong>{namespace}</strong> does not have an OpenShell gateway deployed.
          Deploy one to start creating sandboxes and running agents.
        </EmptyStateBody>
        {error && (
          <Alert variant="danger" isInline title={error} style={{ marginTop: 16, textAlign: 'left' }} />
        )}
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button
              variant="primary"
              onClick={handleDeploy}
              isLoading={deploying}
              isDisabled={deploying}
            >
              {deploying ? 'Deploying Gateway...' : 'Deploy Gateway'}
            </Button>
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    </div>
  );
};

export default GatewaySetup;
