import { Injectable, computed, signal } from '@angular/core';
import { MOCK_USERS } from './auth-mock.data';

const STORAGE_KEY = 'conciliation-auth';

export interface AuthUser {
  username: string;
  displayName: string;
  fullName: string;
  role: string;
}

/**
 * Autenticación mock — hoy valida contra `MOCK_USERS`; el día que exista
 * backend, solo cambia el cuerpo de `login()` (p. ej. una llamada HTTP), el
 * resto de la app (guard, shell, login) no se entera. `providedIn: 'root'`
 * porque el guard de rutas y la pantalla de login lo necesitan fuera del
 * árbol de `Shell`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly user = signal<AuthUser | null>(this.resolveInitialUser());

  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly currentUser = this.user.asReadonly();

  login(username: string, password: string): boolean {
    const match = MOCK_USERS.find(
      (candidate) =>
        candidate.username.toLowerCase() === username.trim().toLowerCase() && candidate.password === password,
    );
    if (!match) {
      return false;
    }

    const authUser: AuthUser = {
      username: match.username,
      displayName: match.displayName,
      fullName: match.fullName,
      role: match.role,
    };
    this.user.set(authUser);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
    return true;
  }

  logout(): void {
    this.user.set(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }

  // Persiste solo en sessionStorage (no localStorage): una sesión mock no
  // debe sobrevivir a cerrar el navegador por completo.
  private resolveInitialUser(): AuthUser | null {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }
}
