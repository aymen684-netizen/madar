// Keep each identity intact while storing repeated descriptions only once.
export function compactMetadata(summary) {
  const descriptionTemplates = [],
    indexes = new Map();
  const satellites = Object.fromEntries(
    Object.entries(summary.satellites).map(([id, record]) => {
      const { owner, type, launch, ...description } = record;
      const identity = { owner, type, launch };
      if (Object.keys(description).length) {
        const key = JSON.stringify(description, Object.keys(description).sort());
        if (!indexes.has(key)) {
          indexes.set(key, descriptionTemplates.length);
          descriptionTemplates.push(description);
        }
        identity.description = indexes.get(key);
      }
      return [id, identity];
    }),
  );
  return { ...summary, compactVersion: 1, descriptionTemplates, satellites };
}
