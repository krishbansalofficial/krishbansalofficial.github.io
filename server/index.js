import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3000;
const app = createApp();

app.listen(port, () => {
  console.log(`Portfolio running at http://localhost:${port}`);
  if (!process.env.ADMIN_TOKEN) {
    console.log('ADMIN_TOKEN not set: /api/admin/* endpoints are disabled.');
  }
});
