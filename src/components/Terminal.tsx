import * as React from 'react';
import { Terminal as XTerminal } from 'xterm';
import { CanvasAddon } from 'xterm-addon-canvas';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

type TerminalProps = {
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
};

export type ImperativeTerminalType = {
  focus: () => void;
  reset: () => void;
  refit: () => void;
  getSize: () => { cols: number; rows: number };
  onDataReceived: (data: string) => void;
  onConnectionClosed: (msg: string) => void;
};

const Terminal = React.forwardRef<ImperativeTerminalType, TerminalProps>(
  ({ onData, onResize }, ref) => {
    const terminal = React.useRef<XTerminal>();
    const fitAddonRef = React.useRef<FitAddon>();
    const containerRef = React.useRef<HTMLDivElement>();

    React.useEffect(() => {
      const term = new XTerminal({
        fontFamily: 'monospace',
        fontSize: 14,
        cursorBlink: true,
        cols: 80,
        rows: 25,
        theme: {
          background: '#1e1e2e',
          foreground: '#cdd6f4',
          cursor: '#f5e0dc',
          black: '#45475a',
          red: '#f38ba8',
          green: '#a6e3a1',
          yellow: '#f9e2af',
          blue: '#89b4fa',
          magenta: '#f5c2e7',
          cyan: '#94e2d5',
          white: '#bac2de',
          brightBlack: '#585b70',
          brightRed: '#f38ba8',
          brightGreen: '#a6e3a1',
          brightYellow: '#f9e2af',
          brightBlue: '#89b4fa',
          brightMagenta: '#f5c2e7',
          brightCyan: '#94e2d5',
          brightWhite: '#a6adc8',
        },
      });
      const fitAddon = new FitAddon();
      fitAddonRef.current = fitAddon;
      term.loadAddon(fitAddon);
      term.open(containerRef.current);
      try { term.loadAddon(new CanvasAddon()); } catch (_) { /* canvas not available, use DOM fallback */ }
      try { fitAddon.fit(); } catch (_) { /* container may have zero dimensions */ }
      term.focus();

      const resizeObserver = new ResizeObserver(() => {
        window.requestAnimationFrame(() => {
          try { fitAddon.fit(); } catch (_) { /* ignore resize when unmounted */ }
        });
      });
      resizeObserver.observe(containerRef.current);

      if (terminal.current !== term) {
        terminal.current && terminal.current.dispose();
        terminal.current = term;
      }

      return () => {
        term.dispose();
        resizeObserver.disconnect();
      };
    }, []);

    React.useEffect(() => {
      const term = terminal.current;
      if (!term) return;
      const dataDisposable = term.onData(onData);
      const resizeDisposable = term.onResize(({ cols, rows }) => onResize(cols, rows));
      return () => {
        dataDisposable.dispose();
        resizeDisposable.dispose();
      };
    }, [onData, onResize]);

    React.useImperativeHandle(ref, () => ({
      focus: () => {
        terminal.current && terminal.current.focus();
      },
      reset: () => {
        if (!terminal.current) return;
        terminal.current.reset();
        terminal.current.clear();
        terminal.current.options.disableStdin = false;
      },
      refit: () => {
        try { fitAddonRef.current?.fit(); } catch (_) {}
      },
      getSize: () => {
        if (!terminal.current) return { cols: 80, rows: 25 };
        return { cols: terminal.current.cols, rows: terminal.current.rows };
      },
      onDataReceived: (data: string) => {
        if (!terminal.current) return;
        const cleaned = data
          .replace(/\x1b\[\?2026[hl]/g, '')           // synchronized output mode
          .replace(/\x1b\]11;[^\x07\x1b]*(\x07|\x1b\\)/g, ''); // OSC 11 bg color response
        if (cleaned) terminal.current.write(cleaned);
      },
      onConnectionClosed: (msg: string) => {
        if (!terminal.current) return;
        terminal.current.write(`\x1b[31m${msg || 'disconnected'}\x1b[m\r\n`);
        terminal.current.options.disableStdin = true;
      },
    }));

    return <div className="os-terminal" ref={containerRef} />;
  },
);

export default Terminal;
