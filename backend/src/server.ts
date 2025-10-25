
import app from './app';
import config from './config';
import os from 'os';
import { githubService } from './services/github.service';
import cors from 'cors';

app.use(cors());

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

function getLocalIp(): string | null {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    const net = ifaces[name];
    if (!net) continue;
    for (const iface of net) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

async function startServer() {
  if (githubService) {
    await githubService.initializeLocalData();
  } else {
    console.warn('GitHub service is not configured. Skipping data initialization.');
  }

  app.listen(PORT, HOST, () => {
    const localIp = getLocalIp();
    console.log(`🚀 Server is running:`);
    console.log(`   • Local:   http://localhost:${PORT}`);
    if (localIp) console.log(`   • LAN:     http://${localIp}:${PORT}`);
    else console.log('   • LAN:     (unable to detect local IP)');
  });
}

startServer();
