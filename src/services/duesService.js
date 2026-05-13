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

const getNextBillingMonthStart = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));

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

const isUserInFirstBillingMonth = async (queryRunner, userId, billingMonthDate) => {
  const userQ = await queryRunner.query(`SELECT created_at FROM users WHERE id = $1 LIMIT 1`, [userId]);
  const createdAt = userQ.rows[0]?.created_at ? new Date(userQ.rows[0].created_at) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) return false;

  const monthStart = new Date(Date.UTC(billingMonthDate.getUTCFullYear(), billingMonthDate.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(billingMonthDate.getUTCFullYear(), billingMonthDate.getUTCMonth() + 1, 1));

  return createdAt >= monthStart && createdAt < nextMonthStart;
};

const ensureCurrentDueRecord = async (queryRunner, userId, societyId, referenceDate = new Date()) => {
  const billingMonthDate = getBillingMonthStart(referenceDate);
  const dueDate = getDueDateForMonth(billingMonthDate);
  const billingMonth = toIsoDate(billingMonthDate);

  const skipFirstMonthDue = await isUserInFirstBillingMonth(queryRunner, userId, billingMonthDate);
  if (skipFirstMonthDue) {
    return {
      due: null,
      billingMonth,
      dueDate: toIsoDate(dueDate),
      isAfterDueDate: referenceDate > dueDate,
      canRequestSpecialCollection: true,
      blockReason: null,
      noDueForCurrentMonth: true,
    };
  }

  await queryRunner.query(
    `
      INSERT INTO resident_dues_payments (
        user_id,
        society_id,
        billing_month,
        due_date,
        amount_cents,
        currency,
        due_type,
        metadata
      )
      SELECT $1, $2, $3, $4, $5, $6, 'monthly',
             jsonb_build_object('createdBy', 'ensureCurrentDueRecord', 'createdAt', CURRENT_TIMESTAMP)
      WHERE NOT EXISTS (
        SELECT 1
        FROM resident_dues_payments
        WHERE user_id = $1
          AND billing_month = $3::date
          AND due_type = 'monthly'
      )
    `,
    [userId, societyId || null, billingMonth, toIsoDate(dueDate), getMonthlyDuesAmountCents(), process.env.STRIPE_CURRENCY || "pkr"]
  );

  const dueResult = await queryRunner.query(
    `
      SELECT *
      FROM resident_dues_payments
      WHERE user_id = $1 AND billing_month = $2 AND due_type = 'monthly'
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
    noDueForCurrentMonth: false,
  };
};

module.exports = {
  getMonthlyDuesAmount,
  getMonthlyDuesAmountCents,
  getBillingMonthStart,
  getNextBillingMonthStart,
  getDueDateForMonth,
  toIsoDate,
  ensureCurrentDueRecord,
};
