-- 012_markdown_resume.sql
-- Ajoute le support de l'éditeur Markdown à cv_documents.
-- markdown_mode : 0 = constructeur visuel (par défaut), 1 = éditeur Markdown

ALTER TABLE cv_documents ADD COLUMN markdown_content TEXT;
ALTER TABLE cv_documents ADD COLUMN markdown_mode    INTEGER NOT NULL DEFAULT 0
  CHECK (markdown_mode IN (0, 1));
