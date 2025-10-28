console.log('Condenser loaded!');
document.body.style.border = '1px solid red';

const button = document.createElement('button');
button.setAttribute('style', 'position:fixed;top:10px;right:10px;z-index:1000;');
button.textContent = 'Send Request';
document.body.appendChild(button);

const ws = new WebSocket('ws://localhost:3001');

button.onclick = () => {
  ws.send('Client clicked');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Client.message', data.count);
  button.textContent = 'Send Request (' + data.count + ')';
};
