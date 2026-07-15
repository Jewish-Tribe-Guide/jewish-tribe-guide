-- Tier 3: decouple the resource directory from hospitals.
--
-- The directory now anchors on the visitor's typed address (straight-line miles
-- from each listing's geocoded coordinates), so a listing's hospital is no
-- longer meaningful. The legacy `hospital_id` becomes a generic grouping key
-- `anchor_id` (defaulting to 'community'), and the precomputed per-hospital
-- `travel` map — which nothing reads anymore — is dropped.
--
-- Idempotent-ish: the renames run once. On a brand-new database the earlier
-- migrations create `hospital_id` + `travel` and this one immediately renames /
-- drops them; the net result is identical to an upgraded existing database.

alter table resource rename column hospital_id to anchor_id;
alter table resource alter column anchor_id set default 'community';
alter index if exists resource_hospital_id_idx rename to resource_anchor_id_idx;
alter table resource drop column if exists travel;
