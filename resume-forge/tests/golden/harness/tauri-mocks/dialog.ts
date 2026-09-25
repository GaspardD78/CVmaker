/** Remplace @tauri-apps/plugin-dialog : la boîte « Enregistrer sous » renvoie un chemin factice. */
export async function save(): Promise<string> {
  return '/golden/cv_export.pdf';
}
