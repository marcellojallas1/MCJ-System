-- supabase/migrations/20260922000013_hardening_recomendacao.sql

drop policy "insert_oferta_autenticado" on oferta_administradora;
create policy "insert_oferta_autenticado"
on oferta_administradora for insert
to authenticated
with check (
  estado in ('coletado', 'pendente_validacao')
  and exists (
    select 1 from plano_consorcio_administradora p
    where p.id = oferta_administradora.plano_id
      and p.administradora_id = oferta_administradora.administradora_id
  )
  and (
    campanha_id is null
    or exists (
      select 1 from campanha_incentivo c
      where c.id = oferta_administradora.campanha_id
        and c.administradora_id = oferta_administradora.administradora_id
    )
  )
);

drop policy "update_oferta_gestor" on oferta_administradora;
create policy "update_oferta_gestor"
on oferta_administradora for update
to authenticated
using (public.jwt_papel() in ('admin', 'gestor_capital'))
with check (
  public.jwt_papel() in ('admin', 'gestor_capital')
  and exists (
    select 1 from plano_consorcio_administradora p
    where p.id = oferta_administradora.plano_id
      and p.administradora_id = oferta_administradora.administradora_id
  )
  and (
    campanha_id is null
    or exists (
      select 1 from campanha_incentivo c
      where c.id = oferta_administradora.campanha_id
        and c.administradora_id = oferta_administradora.administradora_id
    )
  )
);

create policy "update_politica_gestor"
on politica_recomendacao_consorcio for update
to authenticated
using (public.jwt_papel() in ('admin', 'gestor_capital'))
with check (public.jwt_papel() in ('admin', 'gestor_capital'));
