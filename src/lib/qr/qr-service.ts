import QRCode from 'qrcode';

export interface QRTokenPayload {
  tokenId: string; // The secret random credential UUID
  prefix: 'SCOUT_ID';
}

/**
 * Encodes the secret bearer token into a standardized Scout Hub QR string payload.
 * Crucial: Only the random UUID is embedded, NEVER member name, phone, or private data.
 */
export function formatQRPayload(tokenId: string): string {
  return `SCOUT_ID:${tokenId}`;
}

/**
 * Parses and extracts the token ID from a scanned QR payload string.
 */
export function parseQRPayload(scannedText: string): string | null {
  if (!scannedText) return null;
  const trimmed = scannedText.trim();
  if (trimmed.startsWith('SCOUT_ID:')) {
    return trimmed.replace('SCOUT_ID:', '').trim();
  }
  // Also tolerate direct UUID format if scanned directly
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/**
 * Generates an SVG string representation of the QR code for vector crispness on high-DPI screens.
 */
export async function generateQRCodeSVG(payload: string): Promise<string> {
  return QRCode.toString(payload, {
    type: 'svg',
    errorCorrectionLevel: 'H',
    margin: 1,
    color: {
      dark: '#173C32', // Deep Forest Green
      light: '#FFFFFF',
    },
  });
}

/**
 * Generates a PNG Data URL for standard image rendering and print stylesheets.
 */
export async function generateQRCodeDataURL(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 320,
    color: {
      dark: '#173C32',
      light: '#FFFFFF',
    },
  });
}
