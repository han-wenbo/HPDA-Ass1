export function formatAttributeLabel(attributeName) {
  if (!attributeName) {
    return '';
  }

  // field names come from raw attrs, this makes them look a bit less programmer-ish
  return attributeName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function formatMetric(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }

  // fixed decimals are good enough here, we dont need a fancy formatter every where
  return Number(value).toFixed(digits);
}
