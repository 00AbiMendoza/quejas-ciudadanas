/**
 * Aplicación Express: seguridad, CORS, API REST y archivos estáticos del frontend.
 */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config, RAIZ_FRONTEND } from './config/env.js';
import rutas from './routes/index.js';
import { limiteGeneral } from './middlewares/limites.js';
import { manejadorErrores, rutaNoEncontrada } from './middlewares/errores.js';

export function crearApp() {
  const app = express();

  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  // Encabezados de seguridad + política de contenido (CSP).
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:', 'blob:'],
          'connect-src': ["'self'", ...config.corsOrigenes],
        },
      },
    })
  );

  // CORS solo es necesario si el frontend se publica en un dominio distinto al de la API.
  if (config.corsOrigenes.length) {
    app.use('/api', cors({ origin: config.corsOrigenes, exposedHeaders: ['Location'] }));
  }

  app.use(express.json({ limit: '50kb' }));

  // ── API ─────────────────────────────────────────────
  app.use('/api', limiteGeneral, rutas);
  app.use('/api', rutaNoEncontrada);

  // ── Frontend (Portal ciudadano en "/" y Panel en "/admin") ──
  app.use(express.static(RAIZ_FRONTEND, { extensions: ['html'], maxAge: config.esProduccion ? '1h' : 0 }));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.status(404).sendFile('404.html', { root: RAIZ_FRONTEND }, (err) => err && next());
  });

  app.use(manejadorErrores);
  return app;
}
