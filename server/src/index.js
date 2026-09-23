import { config } from './config/index.js';
import app from './app.js';

const server = app.listen(config.port, () => {
  console.log(`Backend API running at http://localhost:${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Error] Port ${config.port} is already in use.`);
  } else {
    console.error('[Error] Server failed to start:', err);
  }
});
