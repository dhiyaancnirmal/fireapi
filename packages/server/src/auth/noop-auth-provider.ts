import type { AuthProvider } from './types.js';

export class NoopAuthProvider implements AuthProvider {
  async authorize(): Promise<void> {
    return;
  }
}
