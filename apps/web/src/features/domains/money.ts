export function formatMoney(minor: string, currency: string) {
  const amount = BigInt(minor);
  const whole = (amount / BigInt(100)).toLocaleString('pt-PT');
  const fraction = (amount % BigInt(100)).toString().padStart(2, '0');
  return whole + ',' + fraction + ' ' + currency;
}
