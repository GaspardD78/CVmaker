/**
 * Liste blanche d'expéditeurs (spec 007, phase 3). Un e-mail dont l'expéditeur
 * n'y figure pas est ignoré. La liste par défaut est vide tant que les adresses
 * réelles ne sont pas confirmées sur des e-mails fournis par l'utilisateur.
 */

/** Adresse nue d'un en-tête `From` (« Nom <a@b.fr> » ou « a@b.fr »), en minuscules. */
export function senderAddress(from: string): string | null {
  const angle = /<([^<>\s]+@[^<>\s]+)>/.exec(from);
  const bare = angle?.[1] ?? /^\s*([^\s<>"]+@[^\s<>"]+)\s*$/.exec(from)?.[1];
  return bare ? bare.toLowerCase() : null;
}

/** Entrée de liste blanche : adresse complète (`alertes@apec.fr`) ou domaine (`apec.fr`). */
export function isSenderAllowed(from: string, allowlist: readonly string[]): boolean {
  const address = senderAddress(from);
  if (!address) return false;
  const domain = address.slice(address.lastIndexOf('@') + 1);
  return allowlist.some(entry => {
    const e = entry.trim().toLowerCase();
    if (!e) return false;
    return e.includes('@') ? address === e : domain === e || domain.endsWith(`.${e}`);
  });
}
