import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { ConfirmLeave, confirmLeaveGuard } from './confirm-leave.guard';

describe('confirmLeaveGuard', () => {
  const route = {} as ActivatedRouteSnapshot;
  const currentState = { url: '/conciliacion/CON-0007/proceso' } as RouterStateSnapshot;
  const nextState = (url: string) => ({ url }) as RouterStateSnapshot;

  const run = (component: ConfirmLeave, url: string) =>
    TestBed.runInInjectionContext(() => confirmLeaveGuard(component, route, currentState, nextState(url)));

  it('delega en confirmLeave con la URL de destino', () => {
    const component: ConfirmLeave = { confirmLeave: vi.fn().mockReturnValue(true) };

    run(component, '/conciliacion?x=1');

    expect(component.confirmLeave).toHaveBeenCalledTimes(1);
    expect(component.confirmLeave).toHaveBeenCalledWith('/conciliacion?x=1');
  });

  it('devuelve el resultado síncrono (true y false)', () => {
    expect(run({ confirmLeave: () => true }, '/dashboard')).toBe(true);
    expect(run({ confirmLeave: () => false }, '/dashboard')).toBe(false);
  });

  it('devuelve la misma Promise cuando confirmLeave es asíncrono', async () => {
    const accepted = Promise.resolve(true);
    const rejected = Promise.resolve(false);

    const first = run({ confirmLeave: () => accepted }, '/dashboard');
    const second = run({ confirmLeave: () => rejected }, '/dashboard');

    expect(first).toBe(accepted);
    expect(second).toBe(rejected);
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(false);
  });
});
