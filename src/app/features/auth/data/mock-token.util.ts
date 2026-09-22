// Emisión de tokens — simula lo que haría el backend al loguear/rotar. Sin
// backend real, no hay un JWT de verdad que firmar: el valor en sí no
// importa, solo que sea ÚNICO en cada emisión (un contador + un sufijo
// aleatorio) para que comparar "¿es este el refreshToken vigente?" en
// `AuthService.refreshAccessToken` tenga sentido — si dos emisiones
// pudieran coincidir, la detección de reuso (ver ese método) nunca
// dispararía por accidente en la demo.
let issueSeq = 0;

export interface MockTokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number; // epoch ms
}

export function issueMockTokenPair(username: string, accessTokenTtlMs: number): MockTokenPair {
  issueSeq += 1;
  const suffix = `${username}.${issueSeq}.${Math.random().toString(36).slice(2, 10)}`;

  return {
    accessToken: `mock-access.${suffix}`,
    refreshToken: `mock-refresh.${suffix}`,
    accessTokenExpiresAt: Date.now() + accessTokenTtlMs,
  };
}
