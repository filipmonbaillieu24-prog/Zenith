export interface FuelPlan {
  totalCalories: number;
  carbsPerHour: number;
  totalCarbs: number;
  fluidPerHour: number;
  totalFluid: number;
  sodiumPerHour: number;
  totalSodium: number;
  // Producten
  bottles: number;     // 500ml bidons sportdrank (elk 40g carbs)
  bars: number;        // energierepen (elk 30g carbs)
  gels: number;        // energiegels (elk 30g carbs)
}

export function calculateFuel(
  durationSeconds: number,
  intensityZone: number, // 1 to 5
  _weightKg: number,
  ftp: number,
  temperatureCelsius: number = 20
): FuelPlan {
  const durationHours = durationSeconds / 3600;
  
  // 1. Schat gem. wattage op basis van zone
  // Zone 1: 50%, Zone 2: 65%, Zone 3: 80%, Zone 4: 95%, Zone 5: 110%
  const zonePct = [0.50, 0.65, 0.80, 0.95, 1.10];
  const estPower = ftp * (zonePct[intensityZone - 1] ?? 0.65);
  
  // 2. Bereken energie (kJ ≈ kcal)
  // Work (kJ) = Power (W) * Time (s) / 1000
  const totalCalories = Math.round((estPower * durationSeconds) / 1000);
  
  // 3. Koolhydraatbehoefte per uur (g/h)
  // Zone 1: 30g, Zone 2: 60g, Zone 3: 80g, Zone 4: 90g, Zone 5: 100g
  const carbsZones = [30, 60, 80, 90, 100];
  const carbsPerHour = carbsZones[intensityZone - 1] ?? 60;
  const totalCarbs = Math.round(carbsPerHour * durationHours);
  
  // 4. Vochtbehoefte per uur (ml/h)
  // Basisverlies: Zone 1: 400ml, Zone 2: 550ml, Zone 3: 700ml, Zone 4-5: 800ml
  const baseFluidZones = [400, 550, 700, 800, 800];
  let fluidPerHour = baseFluidZones[intensityZone - 1] ?? 550;
  
  // Temperatuurcorrectie: +20ml per graad boven 20°C, -10ml per graad onder 20°C (min 300ml)
  if (temperatureCelsius > 20) {
    fluidPerHour += (temperatureCelsius - 20) * 20;
  } else {
    fluidPerHour = Math.max(300, fluidPerHour - (20 - temperatureCelsius) * 10);
  }
  const totalFluid = Math.round(fluidPerHour * durationHours);
  
  // 5. Natriumbehoefte (mg/h)
  // We adviseren natrium aan te vullen als de ride > 1.5 uur is.
  const sodiumPerHour = durationHours > 1.5 ? Math.round((fluidPerHour / 1000) * 600) : 0;
  const totalSodium = Math.round(sodiumPerHour * durationHours);
  
  // 6. Producten verdeling
  // Elke bidon (500ml) sportdrank levert 40g carbs en 500ml vocht.
  // We vullen eerst de vochtbehoefte aan with bidons.
  const maxBottles = Math.floor(totalFluid / 500);
  const bottles = Math.min(maxBottles, Math.ceil(durationHours * 1.2));
  
  const carbsFromBottles = bottles * 40;
  const remainingCarbs = Math.max(0, totalCarbs - carbsFromBottles);
  
  // De resterende carbs verdelen we 50/50 over repen en gels (elk 30g)
  const remainingItems = Math.ceil(remainingCarbs / 30);
  const bars = Math.ceil(remainingItems / 2);
  const gels = Math.floor(remainingItems / 2);
  
  return {
    totalCalories,
    carbsPerHour,
    totalCarbs,
    fluidPerHour: Math.round(fluidPerHour),
    totalFluid,
    sodiumPerHour,
    totalSodium,
    bottles,
    bars,
    gels
  };
}
