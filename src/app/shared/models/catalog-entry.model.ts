// Entrada de un catálogo de subsidiaria/ubicación con la forma del backend (`SubsidiariaSummaryDto`/
// `UbicacionSummaryDto` — ver AuthService, `UserSummaryDto.subsidiarias`/
// `.ubicaciones`) — {id, nombre} es la forma completa de AMBOS catálogos,
// así que un solo tipo alcanza para los dos.
//
// REGLA GENERAL (ver MASTER.md, "Catálogos reales: subsidiaria/ubicación"):
// cualquier select nuevo cuyo campo represente una SUBSIDIARIA (negocio,
// marca, empresa) o una UBICACIÓN (tienda, store, punto de venta, sucursal)
// debe llenar sus opciones desde `CatalogService.subsidiarias()`/
// `.ubicaciones()` (`core/services/catalog.service.ts`) — nunca un array
// hardcodeado ni un enum propio del frontend. Esas dos listas son las que
// trae la sesión actual (en el backend real, `/auth/login` y `/auth/me`; hoy,
// el login mock de `auth-mock.data.ts`).
export interface CatalogEntry {
  id: number;
  nombre: string;
}
