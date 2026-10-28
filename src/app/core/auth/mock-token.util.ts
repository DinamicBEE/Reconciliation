// Tokens simulados: solo importa que cada emisión sea única (contador + sufijo aleatorio),
// para que la detección de reuso del refresh no dispare por accidente.
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
