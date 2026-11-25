import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { PageHeaderService } from '../../../core/layout/header/page-header.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ModalOptions, NzModalService } from 'ng-zorro-antd/modal';
import { Subject, of, throwError } from 'rxjs';
import { AccessCatalogService } from '../../../core/auth/access-catalog.service';
import { RoleDef } from '../../../shared/models/access.model';
import { RolesApiService } from '../data/roles-api.service';
import { AppUser } from '../data/user-management.model';
import { UserManagementService } from '../data/user-management.service';
import { RolesPermissions } from './roles-permissions';

const ROLES: RoleDef[] = [
  { id: 'ADMIN', label: 'Administrador', defaultPermissions: ['manage_users', 'manage_roles'] },
  { id: 'CONTABILIDAD', label: 'Contabilidad', defaultPermissions: ['view_dashboard'] },
  { id: 'COSTOS', label: 'Costos <Sur>', defaultPermissions: [] },
];

const PERMISSION_LABELS: Record<string, string> = {
  manage_users: 'Administrar usuarios',
  manage_roles: 'Administrar roles',
  view_dashboard: 'Ver dashboard',
};

function user(id: string, firstName: string, lastName: string, roleIds: string[]): AppUser {
  return { id, firstName, lastName, avatarUrl: null, roleIds } as unknown as AppUser;
}

describe('RolesPermissions', () => {
  let fixture: ComponentFixture<RolesPermissions>;
  let el: HTMLElement;
  let roles: WritableSignal<RoleDef[]>;
  let loadFailed: WritableSignal<boolean>;
  let allUsers: WritableSignal<AppUser[]>;
  let catalog: { load: ReturnType<typeof vi.fn> };
  let users: { syncFromBackend: ReturnType<typeof vi.fn> };
  let rolesApi: { deleteRole: ReturnType<typeof vi.fn> };
  let modal: { confirm: ReturnType<typeof vi.fn> };
  let message: { success: ReturnType<typeof vi.fn> };
  let navigate: ReturnType<typeof vi.spyOn>;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    roles = signal(ROLES);
    loadFailed = signal(false);
    allUsers = signal([
      user('u2', 'Zoe', 'Alvarez', ['CONTABILIDAD']),
      user('u1', 'Ana', 'Beltrán', ['ADMIN', 'CONTABILIDAD']),
    ]);
    catalog = { load: vi.fn() };
    users = { syncFromBackend: vi.fn() };
    rolesApi = { deleteRole: vi.fn(() => of(null)) };
    modal = { confirm: vi.fn() };
    message = { success: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [RolesPermissions],
      providers: [
        // Ruta hoja con el título, como `app.routes.ts`: el header lo lee de `data`.
        provideRouter([{ path: 'gestion-de-roles', children: [], data: { title: 'Roles y permisos' } }]),
        {
          provide: AccessCatalogService,
          useValue: {
            roles,
            loading: signal(false),
            loadFailed,
            load: catalog.load,
            permissionLabel: (key: string) => PERMISSION_LABELS[key] ?? key,
          },
        },
        { provide: UserManagementService, useValue: { allUsers, syncFromBackend: users.syncFromBackend } },
        { provide: RolesApiService, useValue: rolesApi },
        { provide: NzMessageService, useValue: message },
      ],
    });
    // `NzModalModule` (en `imports` del componente) registra su propio
    // `NzModalService` en el injector standalone: se reemplaza ahí también.
    TestBed.overrideProvider(NzModalService, { useValue: modal });
    await TestBed.compileComponents();

    const router = TestBed.inject(Router);
    await router.navigateByUrl('/gestion-de-roles');
    // Sin navegación real: `navigate` (onEdit) y `navigateByUrl` (routerLink).
    navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(RolesPermissions);
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  const rowsEl = () => Array.from(el.querySelectorAll<HTMLTableRowElement>('tbody tr.clickable-row'));
  const rowOf = (code: string) => rowsEl().find((r) => r.querySelector('.cell-subtitle')?.textContent?.trim() === code)!;
  const deleteButton = (code: string) => rowOf(code).querySelector<HTMLButtonElement>('button[aria-label="Eliminar rol"]')!;
  const editButton = (code: string) => rowOf(code).querySelector<HTMLButtonElement>('button[aria-label="Editar rol"]')!;
  const lastConfirm = () => modal.confirm.mock.calls.at(-1)![0] as ModalOptions;

  describe('renderizado', () => {
    it('sincroniza los usuarios con el backend al entrar', () => {
      expect(users.syncFromBackend).toHaveBeenCalledTimes(1);
    });

    it('le entrega al header el botón "Nuevo rol" (el título es el de la ruta) y no pinta su propio encabezado', () => {
      const page = TestBed.inject(PageHeaderService).header()!;

      expect(page.title).toBe('Roles y permisos');
      expect(page.actions).not.toBeNull();
      expect(el.querySelector('nz-page-header')).toBeNull();
      expect(Array.from(el.querySelectorAll('button')).some((b) => b.textContent?.includes('Nuevo rol'))).toBe(false);
    });

    it('el botón "Nuevo rol" lleva al alta', () => {
      const view = TestBed.inject(PageHeaderService).header()!.actions!.createEmbeddedView({});
      view.detectChanges();
      const button = view.rootNodes.find((n): n is HTMLButtonElement => n instanceof HTMLButtonElement)!;
      button.click();

      expect(button.textContent).toContain('Nuevo rol');
      expect(String(navigateByUrl.mock.calls.at(-1)![0])).toBe('/gestion-de-roles/nuevo');
      view.destroy();
    });

    it('pinta una fila por rol del catálogo con nombre y código', () => {
      expect(rowsEl()).toHaveLength(3);
      expect(rowOf('ADMIN').querySelector('.cell-title')?.textContent?.trim()).toBe('Administrador');
      expect(rowOf('COSTOS').querySelector('.cell-title')?.textContent?.trim()).toBe('Costos <Sur>');
    });

    it('lista los permisos por defecto con su descripción del catálogo', () => {
      const items = Array.from(rowOf('ADMIN').querySelectorAll('.permission-item')).map((li) => li.textContent?.trim());
      expect(items).toEqual(['Administrar usuarios', 'Administrar roles']);
    });

    it('muestra "Sin permisos" cuando el rol no trae ninguno', () => {
      expect(rowOf('COSTOS').textContent).toContain('Sin permisos');
    });

    it('lista las personas del rol ordenadas por nombre completo, con el conteo', () => {
      const row = rowOf('CONTABILIDAD');
      const names = Array.from(row.querySelectorAll('.user-item__name')).map((a) => a.textContent?.trim());
      expect(names).toEqual(['Ana Beltrán', 'Zoe Alvarez']);
      expect(row.querySelector('.chip')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('2 usuarios');
    });

    it('usa el singular con un solo usuario y enlaza a su detalle', () => {
      const row = rowOf('ADMIN');
      expect(row.querySelector('.chip')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('1 usuario');
      expect(row.querySelector<HTMLAnchorElement>('.user-item__name')?.getAttribute('href')).toBe('/usuarios/u1');
    });

    it('muestra "Sin usuarios asignados" cuando nadie tiene el rol', () => {
      expect(rowOf('COSTOS').textContent).toContain('Sin usuarios asignados');
    });

    it('refleja los cambios del catálogo y de los usuarios', async () => {
      roles.set([ROLES[2]]);
      allUsers.set([user('u3', 'Luis', 'Pérez', ['COSTOS'])]);
      await fixture.whenStable();

      expect(rowsEl()).toHaveLength(1);
      expect(rowOf('COSTOS').querySelector('.user-item__name')?.textContent?.trim()).toBe('Luis Pérez');
    });

    it('sin roles muestra el mensaje de vacío', async () => {
      roles.set([]);
      await fixture.whenStable();
      expect(rowsEl()).toHaveLength(0);
      expect(el.textContent).toContain('No hay roles registrados.');
    });

    it('si falló el catálogo muestra el mensaje de error', async () => {
      roles.set([]);
      loadFailed.set(true);
      await fixture.whenStable();
      expect(el.textContent).toContain('No se pudo cargar el catálogo de roles.');
    });
  });

  describe('edición', () => {
    it('al hacer clic en la fila navega a /gestion-de-roles/:code', () => {
      rowOf('CONTABILIDAD').click();
      expect(navigate).toHaveBeenCalledWith(['/gestion-de-roles', 'CONTABILIDAD']);
    });

    it('el botón de editar navega una sola vez (no propaga el clic a la fila)', () => {
      editButton('ADMIN').click();
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith(['/gestion-de-roles', 'ADMIN']);
    });

    it('el enlace a un usuario abre su detalle y no dispara la edición del rol', () => {
      rowOf('ADMIN').querySelector<HTMLAnchorElement>('.user-item__name')!.click();
      expect(navigateByUrl).toHaveBeenCalledTimes(1);
      expect(String(navigateByUrl.mock.calls[0][0])).toBe('/usuarios/u1');
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('baja', () => {
    it('el botón eliminar está deshabilitado si el rol tiene usuarios', () => {
      expect(deleteButton('ADMIN').disabled).toBe(true);
      expect(deleteButton('CONTABILIDAD').disabled).toBe(true);
      expect(deleteButton('COSTOS').disabled).toBe(false);
    });

    it('pide confirmación con el nombre escapado y no llama al backend todavía', () => {
      deleteButton('COSTOS').click();

      expect(modal.confirm).toHaveBeenCalledTimes(1);
      const options = lastConfirm();
      expect(options.nzTitle).toBe('¿Eliminar este rol?');
      expect(options.nzContent).toContain('<b>Costos &lt;Sur&gt;</b> (COSTOS)');
      expect(options.nzOkText).toBe('Eliminar');
      expect(options.nzOkDanger).toBe(true);
      expect(rolesApi.deleteRole).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('al confirmar da de baja, avisa y recarga el catálogo', async () => {
      deleteButton('COSTOS').click();
      await (lastConfirm().nzOnOk as () => Promise<void>)();

      expect(rolesApi.deleteRole).toHaveBeenCalledWith('COSTOS');
      expect(message.success).toHaveBeenCalledWith('Rol "Costos <Sur>" eliminado.');
      expect(catalog.load).toHaveBeenCalledTimes(1);
    });

    it('deshabilita el botón mientras la baja está en curso', async () => {
      const response = new Subject<void>();
      rolesApi.deleteRole.mockReturnValue(response);
      deleteButton('COSTOS').click();

      const pending = (lastConfirm().nzOnOk as () => Promise<void>)();
      await fixture.whenStable();
      expect(deleteButton('COSTOS').disabled).toBe(true);

      response.next();
      response.complete();
      await pending;
      await fixture.whenStable();
      expect(deleteButton('COSTOS').disabled).toBe(false);
    });

    it('si el backend falla no avisa éxito ni recarga, y rehabilita el botón', async () => {
      rolesApi.deleteRole.mockReturnValue(throwError(() => new Error('409')));
      deleteButton('COSTOS').click();

      await expect((lastConfirm().nzOnOk as () => Promise<void>)()).resolves.toBeUndefined();
      await fixture.whenStable();

      expect(message.success).not.toHaveBeenCalled();
      expect(catalog.load).not.toHaveBeenCalled();
      expect(deleteButton('COSTOS').disabled).toBe(false);
    });
  });
});
