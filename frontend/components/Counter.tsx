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
      clearTimeout(reconnectTimeout);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
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
    { style: { padding: '16px' } },
    React.createElement(
      'button',
      { className: 'DialogButton _DialogLayout Secondary', onClick: handleClick },
      count > 0 ? 'Send Request (' + count + ')' : 'Send Request',
    ),
  );
}
