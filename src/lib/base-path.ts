/** Prefijo de ruta de la app (vacío salvo que se configure NEXT_BASE_PATH al compilar). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Antepone el basePath a rutas absolutas usadas con fetch (next/link y el router ya lo hacen solos). */
export const withBase = (path: string) => (path.startsWith("/") ? `${BASE_PATH}${path}` : path);
