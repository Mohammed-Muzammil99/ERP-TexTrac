import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

// Core Middlewares & DB configuration
import { requestLogger } from './server/middleware';

// Modular Department & Service Routers
import fabricRouter from './server/routes/fabric';
import cuttingRouter from './server/routes/cutting';
import stitchingRouter from './server/routes/stitching';
import usersRouter from './server/routes/users';
import poRouter from './server/routes/po';
import handoversRouter from './server/routes/handovers';
import finishingRouter from './server/routes/finishing';
import packingRouter from './server/routes/packing';
import returnsRouter from './server/routes/returns';
import shippingRouter from './server/routes/shipping';
import statusRouter from './server/routes/status';
import departmentsRouter from './server/routes/departments';
import customFormsRouter from './server/routes/custom_forms';
import sqaDiagnosticsRouter from './server/routes/sqa_diagnostics';
import oldStockRouter from './server/routes/old_stock';
import discardsRouter from './server/routes/discards';
import pressRouter from './server/routes/press';
import whatsappRouter from './server/routes/whatsapp';

const __filename = typeof import.meta !== 'undefined' && import.meta.url ? fileURLToPath(import.meta.url) : '';
const __dirname = __filename ? path.dirname(__filename) : process.cwd();

async function startServer() {
  const app = express();

  // --- Global Middlewares ---
  app.use(cors());
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));
  app.use(requestLogger);

  // --- Mount Modular Routers ---
  app.use('/api', fabricRouter);
  app.use('/api', cuttingRouter);
  app.use('/api', stitchingRouter);
  app.use('/api', usersRouter);
  app.use('/api', poRouter);
  app.use('/api', handoversRouter);
  app.use('/api', finishingRouter);
  app.use('/api', packingRouter);
  app.use('/api', returnsRouter);
  app.use('/api', shippingRouter);
  app.use('/api', statusRouter);
  app.use('/api', departmentsRouter);
  app.use('/api', customFormsRouter);
  app.use('/api', sqaDiagnosticsRouter);
  app.use('/api', oldStockRouter);
  app.use('/api', discardsRouter);
  app.use('/api', pressRouter);
  app.use('/api', whatsappRouter);
  app.use(whatsappRouter); // Also mount at root for /public/whatsapp-action and /whatsapp/webhook

  // --- Error & Environment Handlers ---

  // Global Error Handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error('SERVER ERROR:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  });

  // Vite static file server / middleware configuration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
