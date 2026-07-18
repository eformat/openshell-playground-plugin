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
    setLoading(true);
    setError('');

    const fetchRoute = async () => {
      try {
        const resp = await fetch(
          `/api/kubernetes/apis/route.openshift.io/v1/namespaces/${encodeURIComponent(namespace)}/routes/openshell-ttyd`,
        );
        if (!resp.ok) throw new Error('ttyd route not found');
        const route = await resp.json();
        const host = route.spec?.host;
        if (host) {
          setTtydUrl(`https://${host}`);
        } else {
          throw new Error('ttyd route has no host');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to find ttyd route');
      } finally {
        setLoading(false);
      }
    };
    fetchRoute();
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
