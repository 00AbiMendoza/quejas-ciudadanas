/**
 * Procesamiento de fotografías con sharp.
 *
 * ¿Por qué guardamos la foto en Firestore y no en Cloud Storage?
 * Desde 2024–2026 Firebase exige el plan Blaze (de pago) para usar Cloud Storage,
 * y el enunciado pide la CAPA GRATUITA (plan Spark). Firestore sí es gratuito, pero
 * un documento no puede pesar más de 1 MiB. Por eso el backend:
 *   1. Verifica que el archivo realmente sea una imagen (no solo por la extensión).
 *   2. La endereza según la orientación EXIF y elimina los metadatos (GPS, cámara…).
 *   3. La redimensiona y comprime a JPEG hasta que pese menos de ~750 KB.
 *   4. Genera una miniatura WEBP pequeña para el listado del panel.
 */
import sharp from 'sharp';
import { ApiError } from '../utils/ApiError.js';

const LIMITE_BYTES_FIRESTORE = 750 * 1024;
const MAX_PIXELES_ENTRADA = 50_000_000; // Protege contra "bombas" de descompresión.
const FORMATOS_ACEPTADOS = new Set(['jpeg', 'png', 'webp']);

// Se prueba de mayor a menor calidad hasta cumplir el límite de tamaño.
const INTENTOS = [
  { lado: 1600, calidad: 82 },
  { lado: 1600, calidad: 72 },
  { lado: 1280, calidad: 70 },
  { lado: 1024, calidad: 65 },
  { lado: 800, calidad: 60 },
];

const errorFoto = (mensaje) => ApiError.validacion([{ campo: 'foto', mensaje }], mensaje);

/**
 * @param {Buffer} buffer Archivo original subido por el ciudadano.
 * @returns {Promise<{imagen: Buffer, miniatura: Buffer, mime: string, ancho: number, alto: number, bytes: number, original: object}>}
 */
export async function procesarFoto(buffer) {
  let meta;
  try {
    meta = await sharp(buffer, { limitInputPixels: MAX_PIXELES_ENTRADA }).metadata();
  } catch {
    throw errorFoto('El archivo adjunto no es una imagen válida o está dañado.');
  }

  if (!FORMATOS_ACEPTADOS.has(meta.format)) {
    throw errorFoto('Formato de imagen no permitido. Usa JPG, PNG o WEBP.');
  }
  if (!meta.width || !meta.height || meta.width < 50 || meta.height < 50) {
    throw errorFoto('La imagen es demasiado pequeña (mínimo 50 × 50 píxeles).');
  }

  const base = () =>
    sharp(buffer, { limitInputPixels: MAX_PIXELES_ENTRADA })
      .rotate() // Aplica la orientación EXIF (fotos de celular) antes de descartar metadatos.
      .flatten({ background: '#ffffff' }); // Fondo blanco para PNG con transparencia.

  try {
    let resultado = null;
    for (const { lado, calidad } of INTENTOS) {
      resultado = await base()
        .resize({ width: lado, height: lado, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: calidad, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
      if (resultado.data.length <= LIMITE_BYTES_FIRESTORE) break;
    }

    if (!resultado || resultado.data.length > LIMITE_BYTES_FIRESTORE) {
      throw errorFoto('No fue posible reducir la imagen a un tamaño aceptable. Intenta con otra fotografía.');
    }

    const miniatura = await base()
      .resize({ width: 320, height: 320, fit: 'cover' })
      .webp({ quality: 60 })
      .toBuffer();

    return {
      imagen: resultado.data,
      miniatura,
      mime: 'image/jpeg',
      ancho: resultado.info.width,
      alto: resultado.info.height,
      bytes: resultado.data.length,
      original: { formato: meta.format, ancho: meta.width, alto: meta.height, bytes: buffer.length },
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw errorFoto('No fue posible procesar la imagen. Intenta con otra fotografía.');
  }
}
