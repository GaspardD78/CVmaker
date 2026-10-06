/**
 * Alertes e-mail APEC / Emploi Territorial (spec 007, phase 3) — contrats.
 *
 * ⚠ Aucun parseur d'expéditeur n'existe encore : ils se construisent
 * uniquement sur de vrais e-mails `.eml` fournis par l'utilisateur
 * (`specs/007-apec-et-recovery/fixtures/`). Ne pas deviner le format.
 */

/** E-mail déjà décodé (MIME) : le contenu est une donnée NON FIABLE. */
export interface ParsedEmail {
  uid: number;
  from: string;
  subject: string;
  /** Date d'envoi, ISO. */
  date: string | null;
  html: string | null;
  text: string | null;
}

/** Offre lue dans un e-mail d'alerte. Aucune requête vers le site d'origine n'est faite pour l'enrichir. */
export interface AlertOffer {
  title: string;
  company: string | null;
  location: string | null;
  salaryRaw: string | null;
  /** URL de l'offre, déjà validée par `isAllowedAlertLink`. */
  url: string;
  /** Référence chez l'émetteur (APEC : numéro d'offre ; ET : `O0…`). */
  reference: string | null;
}

export interface EmailAlertParser {
  /** Identifiant stable, p. ex. `apec-alert`. */
  readonly id: string;
  /** Source affichée dans le tableau des collectes. */
  readonly sourceLabel: string;
  /** Domaines d'expédition connus, confirmés sur fixtures (liste blanche par défaut). */
  readonly defaultSenders: readonly string[];
  parse(email: ParsedEmail): AlertOffer[];
}
