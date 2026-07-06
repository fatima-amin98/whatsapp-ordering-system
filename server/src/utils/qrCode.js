import QRCode from 'qrcode';

export async function generateQrDataUrl(text) {
  try {
    return await QRCode.toDataURL(text, {
      width: 400,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch (err) {
    console.error('QR generation failed:', err.message);
    throw new Error('Failed to generate QR code');
  }
}
