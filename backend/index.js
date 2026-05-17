const http = require('http');

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Hello from the backend!\n');
});

server.listen(PORT, () => {
  console.log(`Backend server running at http://localhost:${PORT}/`);
});
