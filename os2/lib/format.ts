const numberFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Plain numeric formatting, two decimal places, no currency symbol. */
export function formatMoney(value: number): string {
  return numberFormatter.format(value);
}
