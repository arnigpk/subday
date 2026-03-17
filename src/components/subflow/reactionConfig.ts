export const PRIMARY_REACTIONS = ['💚', '👍', '🔥', '🚀', '⚡️'] as const;
export const EXTRA_REACTIONS = ['🤣', '😍', '🥶', '🤩', '😮', '🙌', '🙏', '☕', '🎯', '🤝'] as const;
export const MAX_REACTIONS_PER_USER = 2;

export const getVisibleSubflowReactions = (
  localReactions: Record<string, number>,
  localUserReactions: string[],
) => {
  const activeExtraReactions = EXTRA_REACTIONS.filter(
    (reaction) => (localReactions[reaction] || 0) > 0 || localUserReactions.includes(reaction),
  );

  return [...PRIMARY_REACTIONS, ...activeExtraReactions.filter((reaction) => !PRIMARY_REACTIONS.includes(reaction))];
};

export const getPickerReactions = (visibleReactions: string[]) =>
  EXTRA_REACTIONS.filter((reaction) => !visibleReactions.includes(reaction));
