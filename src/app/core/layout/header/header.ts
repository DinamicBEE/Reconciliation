import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { NgStyle } from '@angular/common';
import { Router } from '@angular/router';
import { NzPopoverModule } from 'ng-zorro-antd/popover';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { AuthService } from '../../../features/auth/data/auth.service';
import { avatarTokensFor, initialsFor } from '../../../shared/utils/avatar-color.util';
import { SEARCHABLE_PAGES, SearchablePage, searchPages } from './header-search.util';

/**
 * Header del layout principal (`Shell`). Extraído de `shell.html`/`.ts` para
 * aislar acciones + card de usuario en su propio componente — la
 * navegación entre módulos vive en `core/layout/menu` (Menu), no aquí.
 * `Shell` orquesta `<app-menu>` + `<app-header>` + `<router-outlet>`.
 */
@Component({
  selector: 'app-header',
  imports: [NzPopoverModule, NzAvatarModule, NgStyle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  // --- Búsqueda de pantallas ---------------------------------------------
  protected readonly searchOpen = signal(false);
  protected readonly query = signal('');
  protected readonly results = computed(() => searchPages(SEARCHABLE_PAGES, this.query()));

  constructor() {
    // Foco automático al abrir el input — no se puede hacer en el mismo
    // tick de `openSearch()` porque el `@if` todavía no lo renderiza.
    effect(() => {
      if (this.searchOpen()) {
        this.searchInput()?.nativeElement.focus();
      }
    });
  }

  protected openSearch(): void {
    this.searchOpen.set(true);
  }

  protected closeSearch(): void {
    this.searchOpen.set(false);
    this.query.set('');
  }

  protected onSearchInput(value: string): void {
    this.query.set(value);
  }

  protected onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeSearch();
    } else if (event.key === 'Enter') {
      const [first] = this.results();
      if (first) {
        this.goTo(first);
      }
    }
  }

  protected goTo(page: SearchablePage): void {
    this.router.navigateByUrl(page.path);
    this.closeSearch();
  }

  // --- Usuario logeado -----------------------------------------------------
  // "Ana Martínez López" -> "Ana Martínez": primer nombre + primer apellido,
  // para el card compacto del header (el resto del nombre no cabe ahí y no
  // aporta para identificar de un vistazo quién tiene la sesión abierta).
  protected readonly shortName = computed(() => {
    const fullName = this.auth.currentUser()?.fullName ?? '';
    const [firstName = '', firstLastName = ''] = fullName.trim().split(/\s+/);
    return [firstName, firstLastName].filter(Boolean).join(' ');
  });

  protected readonly avatarStyle = computed(() => avatarTokensFor(this.auth.currentUser()?.username ?? ''));
  protected readonly initials = computed(() => initialsFor(this.auth.currentUser()?.fullName ?? ''));

  protected onLogout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
