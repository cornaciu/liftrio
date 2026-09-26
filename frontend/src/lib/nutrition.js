export const DEFAULT_TARGETS = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
export const NUTRIENTS = ['kcal', 'protein', 'carbs', 'fat'];

export function caloriesFromMacros({ protein = 0, carbs = 0, fat = 0 } = {}) {
  return Math.round((Math.max(0, Number(protein) || 0) * 4 + Math.max(0, Number(carbs) || 0) * 4 + Math.max(0, Number(fat) || 0) * 9) * 10) / 10;
}

const clean = value => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0;
};

export function foodFromProduct(product) {
  const n = product.nutriments || {};
  const hasData = ['energy-kcal_100g', 'energy_100g', 'proteins_100g', 'carbohydrates_100g', 'fat_100g'].some(k => n[k] != null && Number.isFinite(Number(n[k])));
  if (!hasData || !product.product_name && !product.product_name_ro) return null;
  const protein = clean(n.proteins_100g);
  const carbs = clean(n.carbohydrates_100g);
  const fat = clean(n.fat_100g);
  const reportedKcal = clean(n['energy-kcal_100g'] ?? (Number(n.energy_100g) / 4.184));
  const macroKcal = caloriesFromMacros({ protein, carbs, fat });
  // Community product data can contain a unit or transcription error in energy.
  // Reject entries where the listed macros make the reported calories implausible.
  if (macroKcal >= 40 && reportedKcal > 0 && reportedKcal < macroKcal * 0.45) return null;
  return {
    name: product.product_name_ro || product.product_name,
    brand: product.brands || '', code: product.code || '',
    per100: {
      kcal: reportedKcal || macroKcal,
      protein, carbs, fat
    }
  };
}

export function totalsFor(entries, date) {
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const entry of entries || []) {
    if (entry.date !== date) continue;
    const factor = clean(entry.grams) / 100;
    for (const key of NUTRIENTS) totals[key] += clean(entry.per100?.[key]) * factor;
  }
  return Object.fromEntries(NUTRIENTS.map(key => [key, Math.round(totals[key] * 10) / 10]));
}
