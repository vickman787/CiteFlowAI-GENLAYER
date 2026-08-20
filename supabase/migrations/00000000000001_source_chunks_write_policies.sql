-- Bug fix: source_chunks had RLS enabled with only a SELECT policy. The
-- registration pipeline writes chunks using the regular authenticated
-- client (not the service-role admin client), so every chunk insert was
-- silently rejected by RLS — registerArticle() never checks that insert's
-- result for an error, so it reported success with zero chunks written.
-- Sources registered before this fix have a `sources` row but no matching
-- `source_chunks` rows; re-register them after running this migration.

CREATE POLICY "Authenticated users can insert source chunks" ON public.source_chunks
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can delete source chunks" ON public.source_chunks
FOR DELETE TO authenticated USING (true);
