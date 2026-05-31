-- ─────────────────────────────────────────────────────────────────────────────
-- 014_add_identity_document_fields.sql
--
-- Country-aware identity document collected at registration.
--   • cpf_cnpj (pre-existing column) stores the NUMBER:
--       - Brazil: CPF (11 digits) or CNPJ (14 digits)
--       - other countries: a generic tax/registration ID (free-form)
--   • document_type: 'INDIVIDUAL' | 'COMPANY'
--   • document_path / document_name: optional identity PDF in the
--     `identity-documents` storage bucket (created below).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS document_type TEXT;   -- 'INDIVIDUAL' | 'COMPANY'
ALTER TABLE users ADD COLUMN IF NOT EXISTS document_path TEXT;   -- identity PDF storage path
ALTER TABLE users ADD COLUMN IF NOT EXISTS document_name TEXT;

-- Private storage bucket for identity PDFs (backend uploads via service role).
INSERT INTO storage.buckets (id, name, public)
VALUES ('identity-documents', 'identity-documents', false)
ON CONFLICT (id) DO NOTHING;
