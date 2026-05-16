/// <reference lib="dom" />
import React, { useState } from 'react';
import { definePlugin } from 'condenser:plugin';

export default definePlugin((api: any) => {
  function CondenserTab() {
    const [count, setCount] = useState(0);

    const handleClick = async () => {
      const result = await api.send('click');
      setCount(result.count);
    };

    return React.createElement(
      'div',
      { style: { padding: '16px' } },
      React.createElement(
        'button',
        { className: 'DialogButton _DialogLayout Secondary', onClick: handleClick },
        count > 0 ? `Send Request (${count})` : 'Send Request',
      ),
    );
  }

  return {
    target: 'quick-access-menu',
    key: 'condenser',
    title: 'Condenser',
    tab: () => React.createElement(
      'svg',
      { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 18 24', width: 24, height: 24, fill: 'currentColor' },
      React.createElement('path', { d: 'M9.6696 0.29267C9.3285 -0.0975568 8.6715 -0.0975568 8.32995 0.29267C7.47765 1.26801 0 9.95829 0 14.7639C0 19.8567 4.0374 24 9 24C13.9626 24 18 19.8567 18 14.7639C18 9.95829 10.5223 1.26801 9.6696 0.29267ZM9 20.3055C6.02235 20.3055 3.6 17.8196 3.6 14.7639C3.6 14.254 4.0032 13.8402 4.5 13.8402C4.9968 13.8402 5.4 14.254 5.4 14.7639C5.4 16.8009 7.01505 18.4583 9 18.4583C9.4968 18.4583 9.9 18.8721 9.9 19.3819C9.9 19.8918 9.4968 20.3055 9 20.3055Z' }),
    ),
    panel: CondenserTab,
  };
});
