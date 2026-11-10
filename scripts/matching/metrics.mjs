export function evaluate(ranked, grades, k = 10) {
  const relevant = Object.entries(grades).filter(([, grade]) => grade >= 2);
  const top = ranked.slice(0, k);
  const dcg = (list) =>
    list.reduce(
      (sum, id, index) =>
        sum + (2 ** (grades[id] || 0) - 1) / Math.log2(index + 2),
      0,
    );
  const ideal = Object.keys(grades)
    .sort((a, b) => grades[b] - grades[a])
    .slice(0, k);
  return {
    ndcg: ideal.length ? dcg(top) / dcg(ideal) : 0,
    recall: relevant.length
      ? top.filter((id) => (grades[id] || 0) >= 2).length / relevant.length
      : 0,
    precision: top.filter((id) => (grades[id] || 0) >= 2).length / k,
    mrr: (() => {
      const index = ranked.findIndex((id) => (grades[id] || 0) >= 2);
      return index < 0 ? 0 : 1 / (index + 1);
    })(),
    success5: ranked.slice(0, 5).some((id) => (grades[id] || 0) >= 2) ? 1 : 0,
  };
}
export function summarize(rows) {
  const keys = ["ndcg", "recall", "precision", "mrr", "success5"];
  return Object.fromEntries(
    keys.map((key) => [
      key,
      rows.reduce((sum, row) => sum + row[key], 0) / (rows.length || 1),
    ]),
  );
}
