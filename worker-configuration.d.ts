declare global {
  interface Env {
    DB: D1Database;
    ADMIN_TOKEN: string;
    ENCRYPTION_KEY?: string;
  }
}
export {};
