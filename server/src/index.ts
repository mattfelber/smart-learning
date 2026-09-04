import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { createProvider } from './providers/index.js';
import { Store } from './persistence/store.js';
import { Tutor } from './tutor/orchestrator.js';
import { createRoutes } from './routes.js';

async function main() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  const store = new Store();
  await store.init();

  const { provider, configured, error } = createProvider();
  const tutor = new Tutor(provider, store);
  const routes = createRoutes(tutor, store, configured, error);

  app.use('/api', routes);

  app.listen(config.PORT, () => {
    console.log(`Smart Learning API running on http://localhost:${config.PORT}`);
    if (!configured) {
      console.warn('Provider not configured:', error);
    }
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
