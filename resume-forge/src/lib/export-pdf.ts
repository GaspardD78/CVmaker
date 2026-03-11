export function printPDF() {
  // Remonter en haut avant l'impression pour que position:absolute
  // ancre correctement #printable-cv au coin supérieur gauche de la page,
  // sans répéter l'élément sur chaque page (comportement de position:fixed).
  window.scrollTo(0, 0);
  window.print();
}
