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
import { NgStyle } from '@angular/common';
import { Router } from '@angular/router';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzPopoverModule } from 'ng-zorro-antd/popover';
import { ThemeService } from '../../services/theme.service';
import { PaletteService } from '../../services/palette.service';
import { AuthService } from '../../../features/auth/data/auth.service';
import {
  AppUser,
  ROLE_LABEL,
  fullName as appUserFullName,
} from '../../../features/user-management/data/user-management.model';
import { UserManagementService } from '../../../features/user-management/data/user-management.service';
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
  imports: [NzAvatarModule, NzPopoverModule, NgStyle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  protected readonly palette = inject(PaletteService);
  private readonly userMgmt = inject(UserManagementService);
  private readonly router = inject(Router);

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly avatarMenuRoot = viewChild<ElementRef<HTMLElement>>('avatarMenuRoot');

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

  // --- Usuario logeado -------------------------------------------------
  // `AuthUser` (sesión) solo trae `appUserId` — el registro completo
  // (nombre real, foto, roles) vive en `user-management`, la misma lista
  // que ve "Administración de usuarios". Así el Header nunca puede mostrar
  // datos distintos a los que un admin ve/edita ahí.
  protected readonly currentAppUser = computed<AppUser | null>(() => {
    const id = this.auth.currentUser()?.appUserId;
    return id ? this.userMgmt.findUser(id) : null;
  });

  protected readonly fullName = computed(() => {
    const user = this.currentAppUser();
    return user ? appUserFullName(user) : '';
  });

  protected readonly roleLabel = computed(() =>
    (this.currentAppUser()?.roleIds ?? []).map((roleId) => ROLE_LABEL[roleId]).join(', '),
  );

  // Mismo criterio que user-list/user-detail: foto real (`avatarUrl`) con
  // fallback a iniciales+color por hash del id — nunca por username, para
  // que la persona tenga el mismo color en Header, lista y detalle.
  protected readonly avatarUrl = computed(() => this.currentAppUser()?.avatarUrl ?? undefined);
  protected readonly avatarStyle = computed(() => avatarTokensFor(this.currentAppUser()?.id ?? ''));
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

  // Cierra el menú al hacer click fuera de él — el avatar y el propio menú
  // (incl. el grid de paleta anidado) están dentro de `#avatarMenuRoot`, así
  // que un click ahí adentro nunca debe cerrarlo.
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
