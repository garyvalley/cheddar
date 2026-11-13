// Transactions that already exist have been seen; new ones start in the review inbox.
export default async function up(pb) {
  const transactions = await pb.collection("transactions");
  if (!transactions.fields.some((f) => f.name === "reviewed")) {
    await pb.send("PATCH", "/api/collections/transactions", {
      fields: [...transactions.fields, { name: "reviewed", type: "bool" }],
    });
  }

  let page = 1;
  for (;;) {
    const result = await pb.send(
      "GET",
      `/api/collections/transactions/records?page=${page}&perPage=200&fields=id,reviewed`,
    );
    const requests = result.items
      .filter((row) => !row.reviewed)
      .map((row) => ({
        method: "PATCH",
        url: `/api/collections/transactions/records/${encodeURIComponent(row.id)}`,
        body: { reviewed: true },
      }));
    if (requests.length) await pb.send("POST", "/api/batch", { requests });
    if (page >= result.totalPages) break;
    page++;
  }
}
