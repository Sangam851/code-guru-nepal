CREATE TABLE public.execution_rate_limits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.execution_rate_limits TO authenticated;
GRANT ALL ON public.execution_rate_limits TO service_role;

ALTER TABLE public.execution_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own rate limit rows" ON public.execution_rate_limits
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER execution_rate_limits_touch
  BEFORE UPDATE ON public.execution_rate_limits
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.consume_execution_quota(
  _user_id uuid,
  _limit integer DEFAULT 10,
  _window_seconds integer DEFAULT 60
)
RETURNS TABLE (allowed boolean, remaining integer, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now timestamptz := now();
  _start timestamptz;
  _count integer;
BEGIN
  INSERT INTO public.execution_rate_limits AS e (user_id, window_start, request_count)
  VALUES (_user_id, _now, 1)
  ON CONFLICT (user_id) DO UPDATE
    SET window_start = CASE
          WHEN e.window_start < _now - make_interval(secs => _window_seconds) THEN _now
          ELSE e.window_start END,
        request_count = CASE
          WHEN e.window_start < _now - make_interval(secs => _window_seconds) THEN 1
          ELSE e.request_count + 1 END
  RETURNING e.window_start, e.request_count INTO _start, _count;

  allowed := _count <= _limit;
  remaining := GREATEST(_limit - _count, 0);
  retry_after_seconds := GREATEST(
    CEIL(EXTRACT(EPOCH FROM (_start + make_interval(secs => _window_seconds) - _now)))::int, 0);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_execution_quota(uuid, integer, integer) TO authenticated, service_role;