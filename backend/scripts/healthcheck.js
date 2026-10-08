const http = require('http');
const port = process.env.PORT || 4000;
http
  .get(`http://127.0.0.1:${port}/health`, (res) => {
    let d = '';
    res.on('data', (c) => (d += c));
    res.on('end', () => {
      try {
        const j = JSON.parse(d);
        if (j.ok) process.exit(0);
      } catch (_) {}
      process.exit(1);
    });
  })
  .on('error', () => process.exit(1));
