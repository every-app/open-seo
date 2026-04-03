export function parseTopUpAmount(value: string) {
  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    return {
      isValid: false,
      parsed: 20,
    };
  }

  const parsed = Number(trimmed);
  const isValid = Number.isInteger(parsed) && parsed >= 10 && parsed <= 99;

  return {
    isValid,
    parsed: isValid ? parsed : 20,
  };
}
