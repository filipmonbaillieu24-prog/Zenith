-- ==========================================================
-- RECIPES: HOW MANY PORTIONS DOES THIS MAKE?
-- ==========================================================
--
-- fuel_recipes stored the macros for the WHOLE recipe and nothing that said how
-- many portions it makes. serving_size existed but is free text ("a bowl",
-- "2 slices"), so nothing could divide by it.
--
-- The consequence reached the food log. Logging a recipe multiplied the whole
-- recipe's totals by a field labelled "servings", so eating one portion of a
-- four-portion bake meant typing 0.25 - and typing 1, which is what the label
-- invites, logged the entire dish. Every calorie total, every macro split and the
-- calorie target that ZANE derives from them inherited that error.
--
-- Default 1 is deliberate: an existing recipe then reports one portion equal to
-- its current totals, which is exactly what the app does today. No stored figure
-- changes meaning until someone edits the recipe and says what it actually makes.

alter table public.fuel_recipes
  add column if not exists servings numeric not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fuel_recipes_servings_positive'
  ) then
    alter table public.fuel_recipes
      add constraint fuel_recipes_servings_positive check (servings > 0);
  end if;
end $$;

comment on column public.fuel_recipes.servings is
  'How many portions the recipe makes. The calories/carbs/protein/fat columns are '
  'totals for the WHOLE recipe; divide by this for one portion.';

comment on column public.fuel_recipes.serving_size is
  'Free-text description of one portion ("a bowl", "2 slices"). Descriptive only - '
  'servings is the number the maths uses.';
