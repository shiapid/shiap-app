begin;
update public.shiap_experiences
set title='DEMO — '||title, updated_at=now()
where title not like 'DEMO — %'
  and slug ~ '^(snorkeling|kayak|banana-boat|jetski|drone-standalone|mirrorless-standalone|underwater-standalone|drone-bundle|mirrorless-bundle|underwater-bundle)-(teluk-tamiang|risalo|gedambaan|kerayaan)$';
commit;
