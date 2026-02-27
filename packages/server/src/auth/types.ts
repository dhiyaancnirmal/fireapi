import type { AuthProvider as RootAuthProvider } from '../types.js';

export interface AuthContext {
  headers: Record<string, string | undefined>;
  path: string;
  method: string;
}

export interface AuthProvider extends RootAuthProvider {
  authorize(ctx: AuthContext): Promise<void>;
}
