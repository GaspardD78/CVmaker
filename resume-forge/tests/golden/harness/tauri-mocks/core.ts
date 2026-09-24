/** Remplace @tauri-apps/api/core : capture le HTML envoyé à la commande Rust generate_pdf. */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (cmd === 'generate_pdf') {
    (window as unknown as { __GOLDEN_HTML__: string }).__GOLDEN_HTML__ = String(args?.html ?? '');
    return [] as unknown as T;
  }
  throw new Error(`golden harness: commande Tauri non simulée « ${cmd} »`);
}
