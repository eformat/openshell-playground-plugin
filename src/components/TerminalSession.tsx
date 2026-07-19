import * as React from 'react';
import { Button, Spinner, Alert } from '@patternfly/react-core';
import { Base64 } from 'js-base64';
import Terminal, { ImperativeTerminalType } from './Terminal';

interface TerminalSessionProps {
  podName: string;
  containerName: string;
  namespace: string;
  isActive: boolean;
  autoCommand?: string;
}

type Status = 'connecting' | 'connected' | 'error' | 'closed';

const TerminalSession: React.FC<TerminalSessionProps> = ({
  podName,
  containerName,
  namespace,
  isActive,
  autoCommand,
}) => {
  const [status, setStatus] = React.useState<Status>('connecting');
  const [errorMessage, setErrorMessage] = React.useState('');
  const terminalRef = React.useRef<ImperativeTerminalType>(null);
  const wsRef = React.useRef<WebSocket | null>(null);
  const connectRef = React.useRef(0);

  const connect = React.useCallback(() => {
    const connectId = ++connectRef.current;
    setStatus('connecting');
    setErrorMessage('');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const initCols = terminalRef.current?.getSize().cols || 80;
    const initRows = terminalRef.current?.getSize().rows || 24;
    const shellInit = `export HOME=/tmp TERM=xterm-256color COLUMNS=${initCols} LINES=${initRows} OPENSHELL_THEME=dark; stty rows ${initRows} cols ${initCols} 2>/dev/null; exec bash`;
    const params = [
      'stdout=1',
      'stdin=1',
      'stderr=1',
      'tty=1',
      `container=${encodeURIComponent(containerName)}`,
      `command=${encodeURIComponent('sh')}`,
      `command=${encodeURIComponent('-c')}`,
      `command=${encodeURIComponent(shellInit)}`,
    ].join('&');
    const wsUrl = `${protocol}//${window.location.host}/api/kubernetes/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(podName)}/exec?${params}`;

    const ws = new WebSocket(wsUrl, ['base64.channel.k8s.io']);
    wsRef.current = ws;

    ws.onopen = () => {
      if (connectId !== connectRef.current) return;
      setStatus('connected');
      if (terminalRef.current) {
        terminalRef.current.reset();
        terminalRef.current.focus();
        const { cols, rows } = terminalRef.current.getSize();
        ws.send('4' + Base64.encode(JSON.stringify({ Height: rows, Width: cols })));
      }
      if (autoCommand) {
        setTimeout(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send('0' + Base64.encode(autoCommand + '\n'));
          }
        }, 800);
      }
    };

    ws.onmessage = (evt) => {
      const raw = evt.data as string;
      if (!raw || raw.length < 2) return;
      const channel = raw[0];
      if (channel === '3') {
        const decoded = Base64.decode(raw.slice(1));
        if (decoded.includes('executable file not found')) {
          terminalRef.current?.onConnectionClosed('Container does not have /bin/sh');
          ws.close();
        }
        return;
      }
      if (channel === '1' || channel === '2') {
        const decoded = Base64.decode(raw.slice(1));
        terminalRef.current?.onDataReceived(decoded);
      }
    };

    ws.onclose = (evt) => {
      if (connectId !== connectRef.current) return;
      setStatus('closed');
      const msg = evt.reason || 'Connection closed.';
      terminalRef.current?.onConnectionClosed(msg);
    };

    ws.onerror = () => {
      if (connectId !== connectRef.current) return;
      setStatus('error');
      setErrorMessage('WebSocket connection failed');
    };
  }, [podName, containerName, namespace, autoCommand]);

  React.useEffect(() => {
    // Delay connect to let FitAddon resize xterm to container width
    const timer = setTimeout(connect, 200);
    return () => {
      clearTimeout(timer);
      connectRef.current++;
      if (wsRef.current) {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send('0' + Base64.encode('exit\r'));
        }
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  React.useEffect(() => {
    if (isActive && terminalRef.current) {
      terminalRef.current.focus();
    }
  }, [isActive]);

  const handleData = React.useCallback((data: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send('0' + Base64.encode(data));
    }
  }, []);

  const handleResize = React.useCallback((cols: number, rows: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send('4' + Base64.encode(JSON.stringify({ Height: rows, Width: cols })));
    }
  }, []);

  return (
    <div style={{ display: isActive ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
      {status === 'error' && (
        <div style={{ padding: 16 }}>
          <Alert variant="danger" isInline title={errorMessage} />
          <Button variant="secondary" onClick={connect} style={{ marginTop: 8 }}>
            Reconnect
          </Button>
        </div>
      )}
      {status === 'connecting' && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          <Spinner size="xl" />
        </div>
      )}
      {(status === 'connected' || status === 'closed') && (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <Terminal ref={terminalRef} onData={handleData} onResize={handleResize} />
        </div>
      )}
      {status === 'closed' && (
        <div style={{ padding: '8px 16px' }}>
          <Button variant="secondary" size="sm" onClick={connect}>
            Reconnect
          </Button>
        </div>
      )}
    </div>
  );
};

export default TerminalSession;
