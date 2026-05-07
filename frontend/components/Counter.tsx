export default function Counter({ React, websocketUrl }: { React: any; websocketUrl: string }) {
  const [count, setCount] = React.useState(0);
  const [ws, setWs] = React.useState(null as WebSocket | null);

  React.useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      console.log('[Counter] Connecting to WebSocket:', websocketUrl);
      socket = new WebSocket(websocketUrl);

      socket.onopen = () => {
        console.log('[Counter] WebSocket connected');
        setWs(socket);
      };

      socket.onerror = (error: Event) => {
        console.error('[Counter] WebSocket error:', error);
        const certUrl = websocketUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
        console.info('[Counter] If certificate issue, open ' + certUrl + ' in browser once');
      };

      socket.onmessage = (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        console.log('[Counter] Received count:', data.count);
        setCount(data.count);
      };

      socket.onclose = () => {
        console.log('[Counter] WebSocket disconnected, retrying in 3s...');
        setWs(null);
        reconnectTimeout = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      socket?.close();
      clearTimeout(reconnectTimeout);
    };
  }, []);

  const handleClick = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'click' }));
    } else {
      console.warn('[Counter] Cannot send: WebSocket not open');
    }
  };

  return React.createElement(
    'div',
    { style: { padding: '16px', color: '#c6d4e5', fontFamily: 'sans-serif' } },
    React.createElement('div', { style: { marginBottom: 12, fontSize: 16 } }, 'Counter'),
    React.createElement(
      'button',
      {
        onClick: handleClick,
        style: {
          background: '#4c6b8a',
          border: 'none',
          color: '#fff',
          borderRadius: 4,
          padding: '8px 16px',
          cursor: 'pointer',
          fontSize: 14,
        },
      },
      count > 0 ? 'Send Request (' + count + ')' : 'Send Request',
    ),
  );
}
