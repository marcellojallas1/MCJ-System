-- supabase/migrations/20260922000010_contrato_update_parent_check.sql

-- The update_contrato_por_marca policy added in 20260922000009 checked only
-- tem_acesso_marca(marca_id), with no parent-consistency clause on the new
-- row. This let a user re-point their own contrato's proposta_id/
-- oportunidade_id at another marca's records via UPDATE — reopening the
-- exact vulnerability class 20260922000009 was written to close, just
-- through a different verb. This migration corrects the policy.
--
-- Deliberately omits a `status = 'aprovada'` check on the referenced
-- proposta (unlike the insert policy) so a legitimate future status
-- transition on an already-linked contrato (e.g. to 'encerrado') is never
-- blocked by later drift in the proposta's own status — the parent-identity
-- clauses alone are sufficient to close the hole.

drop policy "update_contrato_por_marca" on contrato;
create policy "update_contrato_por_marca"
on contrato for update
to authenticated
using (public.tem_acesso_marca(marca_id))
with check (
  public.tem_acesso_marca(marca_id)
  and exists (
    select 1 from proposta p
    where p.id = contrato.proposta_id
      and p.marca_id = contrato.marca_id
      and p.oportunidade_id = contrato.oportunidade_id
  )
);
