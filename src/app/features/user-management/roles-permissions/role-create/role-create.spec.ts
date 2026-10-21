import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { of } from 'rxjs';
import { AccessCatalogService } from '../../../../core/auth/access-catalog.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { RoleDef } from '../../../../shared/models/access.model';
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

    // `onBack`/`create` navegan: se espía para que no haya navegación real.
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
