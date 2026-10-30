export interface ProductDef {
  key: string;
  label: string;
  category: string;
  unit: string;
  /** Consumo diario estimado por persona (experimental, configurable). null = no aplica. */
  dailyPerPerson: number | null;
  essential: boolean;
  /** Sinónimos para el parser por reglas. */
  aliases: string[];
  medicine?: boolean;
}

export const CATEGORIES: Record<string, string> = {
  agua: "Agua potable",
  alimentos: "Alimentos no perecibles",
  ropa: "Ropa",
  abrigo: "Frazadas y abrigo",
  higiene: "Kits de higiene",
  bebes: "Artículos para bebés",
  escolar: "Artículos escolares",
  otros: "Otros suministros permitidos",
  medicamentos: "Medicamentos (flujo validado)",
};

export const PRODUCTS: ProductDef[] = [
  { key: "agua_potable", label: "Agua potable", category: "agua", unit: "litros", dailyPerPerson: 3, essential: true, aliases: ["agua", "agua potable", "botellas de agua", "bidones de agua", "bidon de agua", "bidones", "botellas"] },
  { key: "arroz", label: "Arroz", category: "alimentos", unit: "kg", dailyPerPerson: 0.15, essential: true, aliases: ["arroz"] },
  { key: "menestras", label: "Menestras", category: "alimentos", unit: "kg", dailyPerPerson: 0.08, essential: false, aliases: ["menestras", "lentejas", "frejoles", "frijoles"] },
  { key: "atun_conservas", label: "Conservas de atún", category: "alimentos", unit: "unidades", dailyPerPerson: 0.5, essential: false, aliases: ["atun", "atún", "conservas", "latas"] },
  { key: "fideos", label: "Fideos", category: "alimentos", unit: "kg", dailyPerPerson: 0.08, essential: false, aliases: ["fideos", "pasta", "tallarines"] },
  { key: "aceite", label: "Aceite", category: "alimentos", unit: "litros", dailyPerPerson: 0.03, essential: false, aliases: ["aceite"] },
  { key: "azucar", label: "Azúcar", category: "alimentos", unit: "kg", dailyPerPerson: 0.03, essential: false, aliases: ["azucar", "azúcar"] },
  { key: "frazadas", label: "Frazadas", category: "abrigo", unit: "unidades", dailyPerPerson: null, essential: true, aliases: ["frazadas", "frazada", "mantas", "manta", "cobijas", "cobertores"] },
  { key: "ropa_adulto", label: "Ropa de adulto", category: "ropa", unit: "unidades", dailyPerPerson: null, essential: false, aliases: ["ropa", "polos", "casacas", "abrigos", "ropa de adulto"] },
  { key: "kit_higiene", label: "Kit de higiene", category: "higiene", unit: "kits", dailyPerPerson: null, essential: true, aliases: ["kit de higiene", "kits de higiene", "kit higiene", "kits higiene", "higiene", "jabón", "jabon"] },
  { key: "panales", label: "Pañales", category: "bebes", unit: "paquetes", dailyPerPerson: null, essential: false, aliases: ["pañales", "panales", "pañal"] },
  { key: "leche_infantil", label: "Leche infantil", category: "bebes", unit: "tarros", dailyPerPerson: null, essential: false, aliases: ["leche", "leche infantil", "formula", "fórmula"] },
  { key: "utiles_escolares", label: "Útiles escolares", category: "escolar", unit: "kits", dailyPerPerson: null, essential: false, aliases: ["utiles", "útiles", "utiles escolares", "útiles escolares", "cuadernos"] },
  { key: "carpas", label: "Carpas", category: "otros", unit: "unidades", dailyPerPerson: null, essential: false, aliases: ["carpas", "carpa", "toldos"] },
  { key: "medicamentos", label: "Medicamentos", category: "medicamentos", unit: "unidades", dailyPerPerson: null, essential: false, medicine: true, aliases: ["medicamentos", "medicinas", "pastillas", "paracetamol", "antibióticos", "antibioticos"] },
];

export const PRODUCT_BY_KEY = new Map(PRODUCTS.map((p) => [p.key, p]));

export function productLabel(key: string): string {
  return PRODUCT_BY_KEY.get(key)?.label ?? key;
}

export const UNIT_ALIASES: Record<string, string> = {
  l: "litros", lt: "litros", lts: "litros", litro: "litros", litros: "litros",
  kg: "kg", kilo: "kg", kilos: "kg", kilogramo: "kg", kilogramos: "kg", kgs: "kg",
  unidad: "unidades", unidades: "unidades", und: "unidades", u: "unidades",
  kit: "kits", kits: "kits",
  paquete: "paquetes", paquetes: "paquetes",
  botella: "unidades", botellas: "unidades",
  lata: "unidades", latas: "unidades",
  bidon: "unidades", bidón: "unidades", bidones: "unidades",
  tarro: "tarros", tarros: "tarros",
};

/** Departamentos de Perú (código INEI de 2 dígitos). Lima Metropolitana y Provincias se unifican en 15. */
export const DEPARTMENTS: { code: string; name: string; lat: number; lng: number }[] = [
  { code: "01", name: "AMAZONAS", lat: -5.07, lng: -78.0 },
  { code: "02", name: "ÁNCASH", lat: -9.53, lng: -77.53 },
  { code: "03", name: "APURÍMAC", lat: -13.63, lng: -72.88 },
  { code: "04", name: "AREQUIPA", lat: -15.84, lng: -72.9 },
  { code: "05", name: "AYACUCHO", lat: -13.16, lng: -74.22 },
  { code: "06", name: "CAJAMARCA", lat: -7.16, lng: -78.5 },
  { code: "07", name: "CALLAO", lat: -12.05, lng: -77.12 },
  { code: "08", name: "CUSCO", lat: -13.52, lng: -71.97 },
  { code: "09", name: "HUANCAVELICA", lat: -12.78, lng: -74.97 },
  { code: "10", name: "HUÁNUCO", lat: -9.93, lng: -76.24 },
  { code: "11", name: "ICA", lat: -14.07, lng: -75.73 },
  { code: "12", name: "JUNÍN", lat: -11.16, lng: -75.0 },
  { code: "13", name: "LA LIBERTAD", lat: -8.11, lng: -79.03 },
  { code: "14", name: "LAMBAYEQUE", lat: -6.77, lng: -79.84 },
  { code: "15", name: "LIMA", lat: -12.05, lng: -77.04 },
  { code: "16", name: "LORETO", lat: -3.75, lng: -73.25 },
  { code: "17", name: "MADRE DE DIOS", lat: -12.59, lng: -69.19 },
  { code: "18", name: "MOQUEGUA", lat: -17.19, lng: -70.93 },
  { code: "19", name: "PASCO", lat: -10.68, lng: -76.26 },
  { code: "20", name: "PIURA", lat: -5.19, lng: -80.63 },
  { code: "21", name: "PUNO", lat: -15.84, lng: -70.02 },
  { code: "22", name: "SAN MARTÍN", lat: -6.03, lng: -76.97 },
  { code: "23", name: "TACNA", lat: -18.01, lng: -70.25 },
  { code: "24", name: "TUMBES", lat: -3.57, lng: -80.45 },
  { code: "25", name: "UCAYALI", lat: -8.38, lng: -74.55 },
];

export const DEPT_BY_CODE = new Map(DEPARTMENTS.map((d) => [d.code, d]));

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeName(s: string): string {
  return stripAccents(s).toUpperCase().replace(/\s+/g, " ").trim();
}

const DEPT_BY_NORM = new Map(DEPARTMENTS.map((d) => [normalizeName(d.name), d]));
DEPT_BY_NORM.set("LIMA METROPOLITANA", DEPT_BY_CODE.get("15")!);
DEPT_BY_NORM.set("LIMA PROVINCIAS", DEPT_BY_CODE.get("15")!);

/** Resuelve un nombre libre a un departamento. Devuelve null si no hay coincidencia clara. */
export function findDepartment(text: string): { code: string; name: string; lat: number; lng: number } | null {
  const n = normalizeName(text);
  if (DEPT_BY_NORM.has(n)) return DEPT_BY_NORM.get(n)!;
  for (const [key, d] of DEPT_BY_NORM) {
    if (key.length >= 4 && new RegExp(`(^|[^A-Z])${key}([^A-Z]|$)`).test(n)) return d;
  }
  return null;
}
