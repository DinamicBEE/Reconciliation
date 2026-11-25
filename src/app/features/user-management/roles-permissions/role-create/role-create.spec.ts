import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ModalOptions, NzModalService } from 'ng-zorro-antd/modal';
import { Observable, of, throwError } from 'rxjs';
import { AccessCatalogService, RoleDto } from '../../../../core/auth/access-catalog.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { PageHeaderService } from '../../../../core/layout/header/page-header.service';
import { PermissionDef, RoleDef } from '../../../../shared/models/access.model';
import { AppUser } from '../../data/user-management.model';
import { RolesApiService } from '../../data/roles-api.service';
import { UserManagementService } from '../../data/user-management.service';
import { RoleCreate } from './role-create';

// `GET /roles` solo trae roles activos: el catálogo simulado representa eso.
const ROLES: RoleDef[] = [
  { id: 'ADMIN', label: 'Administrador', defaultPermissions: [] },
  { id: 'CONTABILIDAD', label: 'Contabilidad', defaultPermissions: [] },
  { id: 'GESTION', label: 'Gestión', defaultPermissions: [] },
] as RoleDef[];

describe('RoleCreate — nombre duplicado', () => {
  let fixture: ComponentFixture<RoleCreate>;
  let el: HTMLElement;
  let rolesApi: { getRole: ReturnType<typeof vi.fn> };

  async function setup(code?: string) {
    rolesApi = {
      getRole: vi.fn((c: string) =>
        of({ code: c, name: ROLES.find((r) => r.id === c)?.label ?? c, defaultPermissions: [] }),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [RoleCreate],
      providers: [
        provideRouter([]),
        {
          provide: AccessCatalogService,
          useValue: {
            roles: signal(ROLES),
            permissions: signal([]),
            permissionGroups: signal([]),
            loading: signal(false),
            loadFailed: signal(false),
            load: vi.fn(),
            permissionLabel: (key: string) => key,
          },
        },
        { provide: AuthService, useValue: { currentUser: signal(null), renewSession: vi.fn(() => of(null)) } },
        { provide: UserManagementService, useValue: { allUsers: signal([]), syncFromBackend: vi.fn() } },
        { provide: RolesApiService, useValue: rolesApi },
        { provide: NzModalService, useValue: { confirm: vi.fn() } },
        { provide: NzMessageService, useValue: { success: vi.fn() } },
      ],
    }).compileComponents();

    // `create` navega: se espía para que no haya navegación real.
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(RoleCreate);
    if (code) fixture.componentRef.setInput('code', code);
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  }

  const nameInput = () => el.querySelector<HTMLInputElement>('input[nz-input]')!;
  const errorText = () => el.querySelector('.role-create__error')?.textContent?.trim() ?? null;

  async function typeName(value: string) {
    nameInput().value = value;
    nameInput().dispatchEvent(new Event('input'));
    nameInput().dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  }

  describe('alta', () => {
    beforeEach(() => setup());

    it('marca duplicado un nombre igual al de otro rol activo', async () => {
      await typeName('Contabilidad');
      expect(errorText()).toBe('Ya existe un rol con ese nombre.');
    });

    it('no distingue mayúsculas ni espacios sobrantes', async () => {
      await typeName('  cONTABILIDAD  ');
      expect(errorText()).toBe('Ya existe un rol con ese nombre.');
    });

    it('los acentos sí cuentan: "Gestion" no repite "Gestión"', async () => {
      await typeName('Gestion');
      expect(errorText()).toBeNull();
    });

    it('no compara contra el código del rol, solo contra el nombre', async () => {
      // "ADMIN" es el código del rol "Administrador", no su nombre.
      await typeName('Admin');
      expect(errorText()).toBeNull();
    });

    it('acepta un nombre que no existe en el catálogo', async () => {
      await typeName('Auditoría externa');
      expect(errorText()).toBeNull();
    });

    it('un nombre vacío muestra "requerido", no "duplicado"', async () => {
      await typeName('');
      expect(errorText()).toBe('Escribe el nombre del rol.');
    });
  });

  describe('edición', () => {
    beforeEach(() => setup('CONTABILIDAD'));

    it('precarga el rol con GET /roles/{code}', () => {
      expect(rolesApi.getRole).toHaveBeenCalledWith('CONTABILIDAD');
      expect(nameInput().value).toBe('Contabilidad');
    });

    it('no marca duplicado el nombre del propio rol', async () => {
      await typeName(' contabilidad ');
      expect(errorText()).toBeNull();
    });

    it('sí marca duplicado el nombre de otro rol activo', async () => {
      await typeName('administrador');
      expect(errorText()).toBe('Ya existe un rol con ese nombre.');
    });
  });
});

// Guardado y baja (`POST`/`PATCH`/`DELETE /roles`): el modal se simula ejecutando
// `nzOnOk` de la configuración que recibe, como el botón "Aceptar".
describe('RoleCreate — guardado, baja y estados', () => {
  const PERMISSIONS: PermissionDef[] = [
    { key: 'view_dashboard', label: 'Ver dashboard', group: 'Dashboard' },
    { key: 'export_reports', label: 'Exportar reportes', group: 'Dashboard' },
    { key: 'manage_users', label: 'Administrar usuarios', group: 'Usuarios' },
  ];
  const GROUPS = [
    { group: 'Dashboard', items: PERMISSIONS.slice(0, 2) },
    { group: 'Usuarios', items: PERMISSIONS.slice(2) },
  ];
  const ROLE: RoleDto = { code: 'CONTABILIDAD', name: 'Contabilidad', defaultPermissions: ['view_dashboard'] };

  let fixture: ComponentFixture<RoleCreate>;
  let el: HTMLElement;
  let catalogLoadFailed: WritableSignal<boolean>;
  let allUsers: WritableSignal<AppUser[]>;
  let currentUser: WritableSignal<{ roles: string[] } | null>;
  let catalog: { load: ReturnType<typeof vi.fn> };
  let auth: { renewSession: ReturnType<typeof vi.fn> };
  let users: { syncFromBackend: ReturnType<typeof vi.fn> };
  let rolesApi: {
    getRole: ReturnType<typeof vi.fn>;
    createRole: ReturnType<typeof vi.fn>;
    updateRole: ReturnType<typeof vi.fn>;
    deleteRole: ReturnType<typeof vi.fn>;
  };
  let modal: { confirm: ReturnType<typeof vi.fn> };
  let message: { success: ReturnType<typeof vi.fn> };
  let navigate: ReturnType<typeof vi.spyOn>;

  async function setup(code?: string, options: { getRole?: () => Observable<RoleDto> } = {}) {
    catalogLoadFailed = signal(false);
    allUsers = signal([]);
    currentUser = signal({ roles: ['ADMIN'] });
    catalog = { load: vi.fn() };
    auth = { renewSession: vi.fn(() => of(null)) };
    users = { syncFromBackend: vi.fn() };
    rolesApi = {
      getRole: vi.fn(options.getRole ?? (() => of(ROLE))),
      createRole: vi.fn((req: { name: string; permissions: string[] }) =>
        of({ code: 'AUDITORIA_EXTERNA_2', name: req.name, defaultPermissions: req.permissions }),
      ),
      updateRole: vi.fn((c: string, req: { name?: string }) => of({ ...ROLE, code: c, name: req.name ?? ROLE.name })),
      deleteRole: vi.fn(() => of(null)),
    };
    modal = { confirm: vi.fn() };
    message = { success: vi.fn() };

    TestBed.configureTestingModule({
      imports: [RoleCreate],
      providers: [
        provideRouter([]),
        {
          provide: AccessCatalogService,
          useValue: {
            roles: signal(ROLES),
            permissions: signal(PERMISSIONS),
            permissionGroups: signal(GROUPS),
            loading: signal(false),
            loadFailed: catalogLoadFailed,
            load: catalog.load,
            permissionLabel: (key: string) => PERMISSIONS.find((p) => p.key === key)?.label ?? key,
          },
        },
        { provide: AuthService, useValue: { currentUser, renewSession: auth.renewSession } },
        { provide: UserManagementService, useValue: { allUsers, syncFromBackend: users.syncFromBackend } },
        { provide: RolesApiService, useValue: rolesApi },
        { provide: NzMessageService, useValue: message },
      ],
    });
    // `NzModalModule` (en `imports` del componente) registra su propio
    // `NzModalService` en el injector standalone: se reemplaza ahí también.
    TestBed.overrideProvider(NzModalService, { useValue: modal });
    await TestBed.compileComponents();

    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(RoleCreate);
    if (code) fixture.componentRef.setInput('code', code);
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  }

  const nameInput = () => el.querySelector<HTMLInputElement>('input[nz-input]')!;
  const buttonByText = (text: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.includes(text))!;
  const pageHeader = () => TestBed.inject(PageHeaderService).header();
  // Los botones del encabezado los pinta el header de la app: se instancia el template que la pantalla le entrega.
  function headerButton(text: string): HTMLButtonElement | undefined {
    const actions = pageHeader()?.actions;
    if (!actions) return undefined;
    const view = actions.createEmbeddedView({});
    view.detectChanges();
    const buttons = view.rootNodes.flatMap((n: Node) => (n instanceof Element ? [...n.querySelectorAll('button')] : []));
    return buttons.find((b) => b.textContent?.includes(text));
  }
  const saveButton = () => el.querySelector<HTMLButtonElement>('.role-create__bar button[nz-button]')!;
  const permissionCheckbox = (key: string) =>
    Array.from(el.querySelectorAll<HTMLElement>('.permission-table tbody tr'))
      .find((tr) => tr.querySelector('.permission-table__code')?.textContent?.trim() === key)!
      .querySelector<HTMLElement>('label[nz-checkbox]')!;
  const counter = () => el.querySelector('.role-create__counter')?.textContent?.replace(/\s+/g, ' ').trim();
  const lastConfirm = () => modal.confirm.mock.calls.at(-1)![0] as ModalOptions;
  const confirmOk = () => (lastConfirm().nzOnOk as () => Promise<void>)();

  async function typeName(value: string) {
    nameInput().value = value;
    nameInput().dispatchEvent(new Event('input'));
    nameInput().dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  }

  async function click(target: HTMLElement) {
    target.click();
    await fixture.whenStable();
  }

  describe('alta', () => {
    beforeEach(() => setup());

    it('le entrega al header el título "Nuevo rol", sin botón de eliminar, y no pide ningún rol', () => {
      expect(pageHeader()).toMatchObject({ title: 'Nuevo rol', actions: null });
      expect(el.querySelector('nz-page-header')).toBeNull();
      expect(headerButton('Eliminar rol')).toBeUndefined();
      expect(rolesApi.getRole).not.toHaveBeenCalled();
      expect(users.syncFromBackend).toHaveBeenCalledTimes(1);
    });

    it('muestra el código estimado a partir del nombre', async () => {
      expect(el.querySelector('.role-create__code')).toBeNull();
      await typeName('Auditoría externa');
      const code = el.querySelector('.role-create__code')?.textContent?.replace(/\s+/g, ' ');
      expect(code).toContain('Código estimado: AUDITORIA_EXTERNA');
      expect(code).toContain('el sistema le agrega un número');
    });

    it('pinta los permisos agrupados por módulo con el contador en 0', () => {
      expect(el.querySelectorAll('nz-collapse-panel')).toHaveLength(2);
      expect(el.querySelectorAll('.role-create__module-count')[0]?.textContent?.trim()).toBe('0 / 2');
      expect(counter()).toBe('0 permisos asignados de 3');
    });

    it('no permite guardar sin nombre o sin permisos', async () => {
      expect(saveButton().disabled).toBe(true);
      await typeName('Auditoría externa');
      expect(saveButton().disabled).toBe(true);

      await click(permissionCheckbox('view_dashboard'));
      expect(counter()).toBe('1 permiso asignado de 3');
      expect(saveButton().disabled).toBe(false);

      await typeName('');
      expect(saveButton().disabled).toBe(true);
    });

    it('no permite guardar con un nombre de más de 80 caracteres', async () => {
      await click(permissionCheckbox('view_dashboard'));
      await typeName('x'.repeat(81));
      expect(el.querySelector('.role-create__error')?.textContent?.trim()).toBe('Máximo 80 caracteres.');
      expect(saveButton().disabled).toBe(true);
    });

    it('el checkbox del módulo marca y desmarca todos sus permisos', async () => {
      const moduleCheckbox = el.querySelector<HTMLElement>('.permission-table thead label[nz-checkbox]')!;
      await click(moduleCheckbox);
      expect(counter()).toBe('2 permisos asignados de 3');
      expect(el.querySelectorAll('.role-create__module-count')[0]?.textContent?.trim()).toBe('2 / 2');

      await click(moduleCheckbox);
      expect(counter()).toBe('0 permisos asignados de 3');
    });

    it('pide confirmación antes de crear y no llama al backend todavía', async () => {
      await typeName('Auditoría externa');
      await click(permissionCheckbox('view_dashboard'));
      await click(saveButton());

      expect(modal.confirm).toHaveBeenCalledTimes(1);
      expect(lastConfirm().nzTitle).toBe('¿Crear este rol?');
      expect(lastConfirm().nzOkText).toBe('Crear rol');
      expect(rolesApi.createRole).not.toHaveBeenCalled();
    });

    it('al confirmar hace POST con nombre recortado y permisos, avisa con el código real y vuelve a la lista', async () => {
      await typeName('  Auditoría externa ');
      await click(permissionCheckbox('view_dashboard'));
      await click(permissionCheckbox('manage_users'));
      await click(saveButton());
      await confirmOk();

      expect(rolesApi.createRole).toHaveBeenCalledWith({
        name: 'Auditoría externa',
        permissions: ['view_dashboard', 'manage_users'],
      });
      expect(message.success).toHaveBeenCalledWith('Rol "Auditoría externa" creado (AUDITORIA_EXTERNA_2).');
      expect(catalog.load).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith(['/gestion-de-roles']);
    });

    it('si el POST falla no avisa éxito, no navega y libera el botón', async () => {
      rolesApi.createRole.mockReturnValue(throwError(() => new Error('409')));
      await typeName('Auditoría externa');
      await click(permissionCheckbox('view_dashboard'));
      await click(saveButton());

      await expect(confirmOk()).resolves.toBeUndefined();
      await fixture.whenStable();

      expect(message.success).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(saveButton().disabled).toBe(false);
    });

    it('si el formulario es inválido no abre la confirmación y marca el nombre', async () => {
      await click(saveButton());
      expect(modal.confirm).not.toHaveBeenCalled();

      nameInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await fixture.whenStable();
      expect(modal.confirm).not.toHaveBeenCalled();
      expect(el.querySelector('.role-create__error')?.textContent?.trim()).toBe('Escribe el nombre del rol.');
    });
  });

  describe('edición', () => {
    it('precarga nombre y permisos del rol, muestra su código y no permite guardar sin cambios', async () => {
      await setup('CONTABILIDAD');
      expect(pageHeader()).toMatchObject({ title: 'Editar rol' });
      expect(pageHeader()!.actions).not.toBeNull();
      expect(headerButton('Eliminar rol')).toBeDefined();
      expect(nameInput().value).toBe('Contabilidad');
      expect(el.querySelector('.role-create__code')?.textContent?.replace(/\s+/g, ' ')).toContain('Código: CONTABILIDAD');
      expect(permissionCheckbox('view_dashboard').classList).toContain('ant-checkbox-wrapper-checked');
      expect(permissionCheckbox('export_reports').classList).not.toContain('ant-checkbox-wrapper-checked');
      expect(counter()).toBe('1 permiso asignado de 3');
      expect(buttonByText('Guardar cambios').disabled).toBe(true);
    });

    it('un cambio solo de permisos envía solo `permissions`, propaga y renueva la sesión si la propia tiene el rol', async () => {
      await setup('CONTABILIDAD');
      currentUser.set({ roles: ['CONTABILIDAD'] });
      await click(permissionCheckbox('export_reports'));
      expect(buttonByText('Guardar cambios').disabled).toBe(false);

      await click(buttonByText('Guardar cambios'));
      expect(lastConfirm().nzTitle).toBe('¿Guardar los cambios del rol?');
      expect(lastConfirm().nzOkText).toBe('Guardar cambios');
      await confirmOk();

      expect(rolesApi.updateRole).toHaveBeenCalledWith('CONTABILIDAD', { permissions: ['view_dashboard', 'export_reports'] });
      expect(message.success).toHaveBeenCalledWith('Rol "Contabilidad" actualizado.');
      expect(catalog.load).toHaveBeenCalledTimes(1);
      expect(users.syncFromBackend).toHaveBeenCalledTimes(2);
      expect(auth.renewSession).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith(['/gestion-de-roles']);
    });

    it('no renueva la sesión si la propia no tiene el rol editado', async () => {
      await setup('CONTABILIDAD');
      await click(permissionCheckbox('view_dashboard'));
      await click(permissionCheckbox('manage_users'));
      await click(buttonByText('Guardar cambios'));
      await confirmOk();

      expect(rolesApi.updateRole).toHaveBeenCalledWith('CONTABILIDAD', { permissions: ['manage_users'] });
      expect(users.syncFromBackend).toHaveBeenCalledTimes(2);
      expect(auth.renewSession).not.toHaveBeenCalled();
    });

    it('un cambio solo de nombre envía solo `name` y no resincroniza usuarios', async () => {
      await setup('CONTABILIDAD');
      await typeName('Contabilidad general');
      await click(buttonByText('Guardar cambios'));
      await confirmOk();

      expect(rolesApi.updateRole).toHaveBeenCalledWith('CONTABILIDAD', { name: 'Contabilidad general' });
      expect(message.success).toHaveBeenCalledWith('Rol "Contabilidad general" actualizado.');
      expect(catalog.load).toHaveBeenCalledTimes(1);
      expect(users.syncFromBackend).toHaveBeenCalledTimes(1);
      expect(auth.renewSession).not.toHaveBeenCalled();
    });

    it('si el PATCH falla no navega ni recarga', async () => {
      await setup('CONTABILIDAD');
      rolesApi.updateRole.mockReturnValue(throwError(() => new Error('500')));
      await typeName('Otro nombre');
      await click(buttonByText('Guardar cambios'));
      await confirmOk();

      expect(message.success).not.toHaveBeenCalled();
      expect(catalog.load).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('muestra el aviso de rol inexistente cuando GET /roles/{code} falla', async () => {
      await setup('NO_EXISTE', { getRole: () => throwError(() => new Error('404')) });
      expect(el.textContent).toContain('El rol no existe o ya fue dado de baja.');
      expect(headerButton('Eliminar rol')!.disabled).toBe(true);
    });
  });

  describe('baja', () => {
    it('está deshabilitada mientras alguien tenga el rol asignado', async () => {
      await setup('CONTABILIDAD');
      allUsers.set([{ id: 'u1', firstName: 'Ana', lastName: 'Ruiz', roleIds: ['CONTABILIDAD'] } as unknown as AppUser]);
      await fixture.whenStable();
      expect(headerButton('Eliminar rol')!.disabled).toBe(true);
    });

    it('al confirmar da de baja el rol, recarga el catálogo y vuelve a la lista', async () => {
      await setup('CONTABILIDAD');
      const button = headerButton('Eliminar rol')!;
      expect(button.disabled).toBe(false);

      await click(button);
      expect(lastConfirm().nzTitle).toBe('¿Eliminar este rol?');
      expect(lastConfirm().nzContent).toContain('<b>Contabilidad</b> (CONTABILIDAD)');
      expect(rolesApi.deleteRole).not.toHaveBeenCalled();

      await confirmOk();
      expect(rolesApi.deleteRole).toHaveBeenCalledWith('CONTABILIDAD');
      expect(message.success).toHaveBeenCalledWith('Rol "Contabilidad" eliminado.');
      expect(catalog.load).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith(['/gestion-de-roles']);
    });

    it('si el DELETE falla no navega', async () => {
      await setup('CONTABILIDAD');
      rolesApi.deleteRole.mockReturnValue(throwError(() => new Error('409')));
      await click(headerButton('Eliminar rol')!);
      await confirmOk();

      expect(message.success).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('catálogo de permisos', () => {
    it('si no se pudo cargar muestra el aviso y "Reintentar" vuelve a pedirlo', async () => {
      await setup();
      catalogLoadFailed.set(true);
      await fixture.whenStable();

      expect(el.textContent).toContain('No se pudo cargar el catálogo de permisos.');
      await click(buttonByText('Reintentar'));
      expect(catalog.load).toHaveBeenCalledTimes(1);
    });
  });
});
