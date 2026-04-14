/**
 * Modèle de départ Markdown pour un nouveau CV.
 * Injecté dans markdown_content lors de la création d'un document en mode Markdown
 * (uniquement si markdown_content === null).
 *
 * Les champs fictifs sont délimités par [crochets] pour guider l'utilisateur.
 */
export const DEFAULT_MARKDOWN_TEMPLATE = `# [Votre Prénom Nom]

[votre.email@exemple.com] · [+33 6 00 00 00 00] · [Ville, Pays]
[linkedin.com/in/votreprofil] · [github.com/votrehandle]

---

## Résumé

[2 à 3 phrases décrivant votre parcours professionnel, vos expertises clés et ce que vous apportez à un employeur.]

---

## Expérience professionnelle

### [Intitulé de poste] — [Nom de l'entreprise]
*[Mois Année] – [Mois Année ou Présent] · [Ville]*

- [Responsabilité ou réalisation clé — quantifiez si possible (ex. : augmentation de X % des performances)]
- [Responsabilité ou réalisation clé]
- [Responsabilité ou réalisation clé]

### [Intitulé de poste] — [Nom de l'entreprise]
*[Mois Année] – [Mois Année] · [Ville]*

- [Responsabilité ou réalisation clé]
- [Responsabilité ou réalisation clé]

---

## Formation

### [Intitulé du diplôme] en [Domaine d'études]
**[Nom de l'établissement]** · [Année d'obtention]

### [Intitulé du diplôme]
**[Nom de l'établissement]** · [Année d'obtention]

---

## Compétences

**[Catégorie, ex. : Langages]** : [Compétence 1], [Compétence 2], [Compétence 3]
**[Catégorie, ex. : Frameworks]** : [Compétence 1], [Compétence 2]
**[Catégorie, ex. : Outils]** : [Compétence 1], [Compétence 2]

---

## Langues

- [Langue] : [Niveau — ex. : Natif, Courant (C1), Intermédiaire (B2)]
- [Langue] : [Niveau]

---

## Centres d'intérêt

[Intérêt 1], [Intérêt 2], [Intérêt 3]
`;
