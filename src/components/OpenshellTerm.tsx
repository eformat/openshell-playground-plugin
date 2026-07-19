import * as React from 'react';
import { Spinner, Alert } from '@patternfly/react-core';

interface OpenshellTermProps {
  namespace: string;
}

const OpenshellTerm: React.FC<OpenshellTermProps> = ({ namespace }) => {
  const [ttydUrl, setTtydUrl] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!namespace) {
      setTtydUrl('');
      return;
    }
    setTtydUrl(`/api/proxy/plugin/openshell-playground-plugin/backend/api/ttyd/?ns=${encodeURIComponent(namespace)}`);
    setLoading(false);
    setError('');
  }, [namespace]);

  if (!namespace) return null;

  return (
    <div className="os-term-panel">
      <div className="os-term-panel__header">OpenShell TUI</div>
      <div className="os-term-panel__body">
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Spinner size="xl" />
          </div>
        )}
        {error && (
          <div style={{ padding: 16 }}>
            <Alert variant="warning" isInline title={error} />
          </div>
        )}
        {ttydUrl && !loading && (
          <iframe
            src={ttydUrl}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
            }}
            title="OpenShell Terminal"
            allow="clipboard-read; clipboard-write"
          />
        )}
      </div>
    </div>
  );
};

export default OpenshellTerm;
