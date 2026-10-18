import 'dotenv/config';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer from 1 to 65535.');
}

createApp().listen(port, () => {
  console.log(`Aura Skincare API listening on port ${port}`);
});
