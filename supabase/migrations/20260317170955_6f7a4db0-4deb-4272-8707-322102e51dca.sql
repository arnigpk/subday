ALTER TABLE public.subflow_reactions
DROP CONSTRAINT IF EXISTS subflow_reactions_reaction_check;

ALTER TABLE public.subflow_reactions
ADD CONSTRAINT subflow_reactions_reaction_check
CHECK (
  reaction = ANY (
    ARRAY[
      '💚'::text,
      '👍'::text,
      '🔥'::text,
      '🚀'::text,
      '⚡️'::text,
      '🤣'::text,
      '😍'::text,
      '🥶'::text,
      '🤩'::text,
      '😮'::text,
      '🙌'::text,
      '🙏'::text,
      '☕'::text,
      '🎯'::text,
      '🤝'::text
    ]
  )
);

ALTER TABLE public.subflow_ad_reactions
DROP CONSTRAINT IF EXISTS subflow_ad_reactions_reaction_check;

ALTER TABLE public.subflow_ad_reactions
ADD CONSTRAINT subflow_ad_reactions_reaction_check
CHECK (
  reaction = ANY (
    ARRAY[
      '💚'::text,
      '👍'::text,
      '🔥'::text,
      '🚀'::text,
      '⚡️'::text,
      '🤣'::text,
      '😍'::text,
      '🥶'::text,
      '🤩'::text,
      '😮'::text,
      '🙌'::text,
      '🙏'::text,
      '☕'::text,
      '🎯'::text,
      '🤝'::text
    ]
  )
);