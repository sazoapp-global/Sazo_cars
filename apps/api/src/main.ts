import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = await createApp(config);
await app.listen(config.PORT);
console.log(`SAZO API listening on http://localhost:${config.PORT}/v1 (simulated data: ${config.SIMULATED_DATA})`);
