-- supabase/migrations/20260922000009_parent_consistency.sql

-- Final review of the comercial-core plan found that RLS on proposta/contrato
-- validated each row's own marca_id in isolation but never checked it was
-- consistent with the parent row (oportunidade/proposta) it references. A
-- user authenticated as one marca could pass RLS with their own marca_id
-- while pointing oportunidade_id/proposta_id at another marca's record —
-- proven exploitable via direct API insert, bypassing the service layer's
-- TypeScript-only derivation. This migration adds parent-consistency checks
-- to close that gap, and adds the contrato UPDATE policy that was missing
-- entirely (violating the "RLS habilitado com select/insert/update juntos"
-- global constraint).

drop policy "insert_proposta_por_marca" on proposta;
create policy "insert_proposta_por_marca"
on proposta for insert
to authenticated
with check (
  public.tem_acesso_marca(marca_id)
  and exists (
    select 1 from oportunidade o
    where o.id = proposta.oportunidade_id
      and o.marca_id = proposta.marca_id
  )
);

drop policy "update_proposta_por_marca" on proposta;
create policy "update_proposta_por_marca"
on proposta for update
to authenticated
using (public.tem_acesso_marca(marca_id))
with check (
  public.tem_acesso_marca(marca_id)
  and exists (
    select 1 from oportunidade o
    where o.id = proposta.oportunidade_id
      and o.marca_id = proposta.marca_id
  )
);

drop policy "insert_contrato_por_marca" on contrato;
create policy "insert_contrato_por_marca"
on contrato for insert
to authenticated
with check (
  public.tem_acesso_marca(marca_id)
  and exists (
    select 1 from proposta p
    where p.id = contrato.proposta_id
      and p.marca_id = contrato.marca_id
      and p.oportunidade_id = contrato.oportunidade_id
      and p.status = 'aprovada'
  )
);

create policy "update_contrato_por_marca"
on contrato for update
to authenticated
using (public.tem_acesso_marca(marca_id))
with check (public.tem_acesso_marca(marca_id));
