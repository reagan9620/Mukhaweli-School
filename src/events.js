const clients = new Set();

export function subscribe(res, topics) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');

  const client = { res, topics: new Set(topics) };
  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      stop();
    }
  }, 25000);
  heartbeat.unref?.();

  const stop = () => {
    clearInterval(heartbeat);
    clients.delete(client);
  };
  res.on('close', stop);
  res.on('error', stop);
  clients.add(client);
}

export function broadcast(topic, payload = {}) {
  const frame = `event: ${topic}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    if (!client.topics.has(topic)) continue;
    try {
      client.res.write(frame);
    } catch {
      clients.delete(client);
    }
  }
}
