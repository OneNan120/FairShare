export function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function calculateSplit(expense, members = []) {
  const memberIds = new Set(members.map((member) => member.userId));
  const subtotals = {};

  for (const item of expense.items || []) {
    const assigned = (item.assignedTo || []).filter((id) => memberIds.has(id));
    if (!assigned.length) continue;
    const amount = Number(item.price || 0) * Number(item.quantity || 1);
    const share = amount / assigned.length;
    for (const userId of assigned) subtotals[userId] = (subtotals[userId] || 0) + share;
  }

  const totalAssignedSubtotal = Object.values(subtotals).reduce((sum, value) => sum + value, 0);
  const tax = Number(expense.tax || 0);
  const tip = Number(expense.tip || 0);

  return Object.fromEntries(
    members.map((member) => {
      const itemSubtotal = subtotals[member.userId] || 0;
      const proportion = totalAssignedSubtotal > 0 ? itemSubtotal / totalAssignedSubtotal : 0;
      const userTax = tax * proportion;
      const userTip = tip * proportion;
      return [
        member.userId,
        {
          userId: member.userId,
          name: member.name,
          email: member.email,
          itemSubtotal: roundMoney(itemSubtotal),
          tax: roundMoney(userTax),
          tip: roundMoney(userTip),
          total: roundMoney(itemSubtotal + userTax + userTip)
        }
      ];
    })
  );
}
