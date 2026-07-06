export function buildWaDeepLink(phoneNumber, text) {
  const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
  const international = cleanPhone.startsWith('0')
    ? `92${cleanPhone.slice(1)}`
    : cleanPhone;
  return `https://wa.me/${international}?text=${encodeURIComponent(text)}`;
}
