import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { environment } from '../../../../environments/environment';

/**
 * Banco o canal cuyo reporte se carga en una conciliación (`GET /reconciliations/banks`).
 *
 * @remarks `code` es el campo `bank` de `POST /reconciliation/reconciliations/{id}/files`.
 * @see docs/codigo/conciliacion.md#bancos
 */
export interface BankOption {
  id: number;
  code: string;
  name: string;
}

/**
 * Bancos y canales habilitados para el paso "Carga de archivos" (Core Service).
 *
 * @remarks Carga perezosa: se pide la primera vez que se llama {@link ensureLoaded}. Pide `import_settlements` o `view_reconciliation`.
 * @see docs/codigo/conciliacion.md#bancos
 */
@Injectable({ providedIn: 'root' })
export class BankCatalogService {
  private readonly http = inject(HttpClient);
  private readonly requested = signal(false);

  private readonly resource = rxResource<readonly BankOption[], true | undefined>({
    params: () => (this.requested() ? true : undefined),
    stream: () => this.http.get<BankOption[]>(`${environment.apiUrl}/reconciliations/banks`),
    defaultValue: [],
  });

  // Un resource en error lanza al leer `value()`: se usa `hasValue()`.
  readonly banks = computed(() => (this.resource.hasValue() ? this.resource.value() : []));
  readonly loading = this.resource.isLoading;
  readonly loadFailed = computed(() => !!this.resource.error());

  /** Pide el catálogo la primera vez; después solo reintenta si falló. */
  ensureLoaded(): void {
    if (!this.requested()) {
      this.requested.set(true);
      return;
    }
    if (this.resource.error()) this.resource.reload();
  }

  /** @returns El banco con ese código, o `null` si no está en el catálogo. */
  find(code: string | null | undefined): BankOption | null {
    return code ? (this.banks().find((bank) => bank.code === code) ?? null) : null;
  }
}
