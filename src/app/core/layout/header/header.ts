import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NgStyle, NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzPopoverModule } from 'ng-zorro-antd/popover';
import { ThemeService } from '../../services/theme.service';
import { PaletteService } from '../../services/palette.service';
import { AccessControlService } from '../../auth/access-control.service';
import { AuthService } from '../../auth/auth.service';
import { AccessCatalogService } from '../../auth/access-catalog.service';
import { avatarTokensFor, initialsFor } from '../../../shared/utils/avatar-color.util';
import { SEARCHABLE_PAGES, SearchablePage, searchPages } from './header-search.util';
import { PageHeaderParent, PageHeaderService } from './page-header.service';

/**
 * Header del layout: título de la pantalla activa, búsqueda de pantallas, notificaciones y menú del avatar.
 *
 * @see docs/codigo/layout-y-tema.md#header
 */
@Component({
  selector: 'app-header',
  imports: [NzAvatarModule, NzPopoverModule, NzPageHeaderModule, NzBreadCrumbModule, NgStyle, NgTemplateOutlet, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  protected readonly palette = inject(PaletteService);
  protected readonly access = inject(AccessControlService);
  private readonly accessCatalog = inject(AccessCatalogService);
  private readonly router = inject(Router);
  protected readonly pageHeader = inject(PageHeaderService);

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly avatarMenuRoot = viewChild<ElementRef<HTMLElement>>('avatarMenuRoot');

  // --- Búsqueda de pantallas ---------------------------------------------
  protected readonly searchOpen = signal(false);
  protected readonly query = signal('');
  // Filtra por permiso antes de buscar: no se ofrece una pantalla que el usuario no puede abrir.
  protected readonly results = computed(() =>
    searchPages(
      SEARCHABLE_PAGES.filter(
        (page) =>
          (!page.permission || this.access.hasPermission(page.permission)) && (!page.role || this.access.hasRole(page.role)),
      ),
      this.query(),
    ),
  );

  constructor() {
    // Foco automático al abrir el input — no se puede hacer en el mismo
    // tick de `openSearch()` porque el `@if` todavía no lo renderiza.
    effect(() => {
      if (this.searchOpen()) {
        this.searchInput()?.nativeElement.focus();
      }
    });
  }

  // Navega a la pantalla padre, no `Location.back()`: no depende del historial.
  protected goBack(parent: PageHeaderParent): void {
    void this.router.navigateByUrl(parent.path);
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

  // --- Usuario logeado -------------------------------------------------
  // Solo datos de la sesión (`AuthUser`): `core` no lee el mock de user-management (ADR-0001).
  protected readonly fullName = computed(() => this.auth.currentUser()?.displayName ?? '');

  // Roles REALES de la sesión (`AuthUser.roles`) con el nombre de `GET /roles`
  // (sin permiso para pedirlo, una versión legible del código).
  protected readonly roleLabel = computed(() =>
    (this.auth.currentUser()?.roles ?? []).map((roleId) => this.accessCatalog.roleLabel(roleId)).join(', '),
  );

  // Iniciales + color por hash del username (la sesión no trae foto ni el id
  // del registro de `user-management`).
  protected readonly avatarStyle = computed(() => avatarTokensFor(this.auth.currentUser()?.username ?? ''));
  protected readonly initials = computed(() => initialsFor(this.fullName()));

  // --- Menú del avatar (Perfil / paleta / tema / logout) -----------------
  protected readonly avatarMenuOpen = signal(false);
  protected readonly paletteExpanded = signal(false);

  protected toggleAvatarMenu(): void {
    this.avatarMenuOpen.update((open) => !open);
    if (!this.avatarMenuOpen()) {
      this.paletteExpanded.set(false);
    }
  }

  protected closeAvatarMenu(): void {
    this.avatarMenuOpen.set(false);
    this.paletteExpanded.set(false);
  }

  protected togglePaletteExpanded(): void {
    this.paletteExpanded.update((open) => !open);
  }

  // Un click fuera de `#avatarMenuRoot` (avatar, menú y grid de paleta) cierra el menú.
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.avatarMenuOpen()) return;
    const root = this.avatarMenuRoot()?.nativeElement;
    if (root && !root.contains(event.target as Node)) {
      this.closeAvatarMenu();
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscapeKey(): void {
    if (this.avatarMenuOpen()) {
      this.closeAvatarMenu();
    }
  }

  // Click de nuevo sobre el color ya activo = quitarlo (vuelve a la paleta
  // por defecto) en vez de quedar sin forma de deseleccionar desde la UI.
  protected onSwatchClick(hex: string): void {
    if (this.palette.selected() === hex) {
      this.palette.reset();
    } else {
      this.palette.select(hex);
    }
  }

  protected goToProfile(): void {
    this.router.navigateByUrl('/perfil');
    this.closeAvatarMenu();
  }

  protected onLogout(): void {
    this.closeAvatarMenu();
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
