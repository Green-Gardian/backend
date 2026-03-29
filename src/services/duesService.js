const DEFAULT_MONTHLY_DUES_AMOUNT = Number.parseInt(process.env.MONTHLY_DUES_AMOUNT || "500", 10);

const getMonthlyDuesAmount = () => {
  if (!Number.isFinite(DEFAULT_MONTHLY_DUES_AMOUNT) || DEFAULT_MONTHLY_DUES_AMOUNT <= 0) {
    return 500;
  }
  return DEFAULT_MONTHLY_DUES_AMOUNT;
};

const getMonthlyDuesAmountCents = () => Math.round(getMonthlyDuesAmount() * 100);

const getBillingMonthStart = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const getDueDateForMonth = (billingMonthDate) =>
  new Date(Date.UTC(billingMonthDate.getUTCFullYear(), billingMonthDate.getUTCMonth(), 7));

const toIsoDate = (date) => date.toISOString().slice(0, 10);

const normalizeStatus = (status, isAfterDueDate) => {
  if (status === "paid") return "paid";
  if (isAfterDueDate && status === "pending") return "overdue";
  return status;
};

const shouldBlockSpecialCollection = (status, isAfterDueDate) => {
  if (!isAfterDueDate) return false;
  return status !== "paid";
};

const ensureCurrentDueRecord = async (queryRunner, userId, societyId, referenceDate = new Date()) => {
  const billingMonthDate = getBillingMonthStart(referenceDate);
  const dueDate = getDueDateForMonth(billingMonthDate);
  const billingMonth = toIsoDate(billingMonthDate);

  await queryRunner.query(
    `
      INSERT INTO resident_dues_payments (user_id, society_id, billing_month, due_date, amount_cents, currency)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, billing_month) DO NOTHING
    `,
    [userId, societyId || null, billingMonth, toIsoDate(dueDate), getMonthlyDuesAmountCents(), process.env.STRIPE_CURRENCY || "pkr"]
  );

  const dueResult = await queryRunner.query(
    `
      SELECT *
      FROM resident_dues_payments
      WHERE user_id = $1 AND billing_month = $2
      LIMIT 1
    `,
    [userId, billingMonth]
  );

  let row = dueResult.rows[0];
  const isAfterDueDate = referenceDate > dueDate;
  const normalized = normalizeStatus(row.status, isAfterDueDate);

  if (normalized !== row.status) {
    const updated = await queryRunner.query(
      `
        UPDATE resident_dues_payments
        SET status = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `,
      [normalized, row.id]
    );
    row = updated.rows[0];
  }

  const blocked = shouldBlockSpecialCollection(row.status, isAfterDueDate);

  return {
    due: row,
    billingMonth,
    dueDate: toIsoDate(dueDate),
    isAfterDueDate,
    canRequestSpecialCollection: !blocked,
    blockReason: blocked
      ? "Monthly dues are unpaid after the 7th. Please complete dues payment to continue requesting special collection."
      : null,
  };
};

module.exports = {
  getMonthlyDuesAmount,
  getMonthlyDuesAmountCents,
  getBillingMonthStart,
  getDueDateForMonth,
  toIsoDate,
  ensureCurrentDueRecord,
};
