const Stripe = require("stripe");
const { pool } = require("../config/db");
const {
  ensureCurrentDueRecord,
  getMonthlyDuesAmount,
  getBillingMonthStart,
  toIsoDate,
} = require("../services/duesService");

const STRIPE_CURRENCY = (process.env.STRIPE_CURRENCY || "pkr").toLowerCase();
const DEFAULT_RETURN_URL = process.env.MOBILE_BILLING_RETURN_URL || "greenguardian:///";

const getStripeWebhookSecret = () => process.env.STRIPE_WEBHOOK_SECRET || "";

const getStripeClient = () => {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    const err = new Error("Stripe is not configured. Please set STRIPE_SECRET_KEY.");
    err.status = 500;
    throw err;
  }
  return new Stripe(secret);
};

const appendParams = (baseUrl, params) => {
  try {
    const target = new URL(baseUrl);
    Object.entries(params).forEach(([k, v]) => target.searchParams.set(k, String(v)));
    return target.toString();
  } catch (_) {
    const hasQuery = baseUrl.includes("?");
    const query = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    return `${baseUrl}${hasQuery ? "&" : "?"}${query}`;
  }
};

const fail = (res, status, message, extra = {}) =>
  res.status(status).json({ success: false, message, ...extra });

const finalizeDuePayment = async ({
  due,
  paymentStatus,
  paymentIntent,
  paymentMethod,
  receiptUrl,
  failureReason,
}) => {
  let nextStatus = due.status;
  let paidAt = due.paid_at;

  if (paymentStatus === "paid") {
    nextStatus = "paid";
    paidAt = new Date().toISOString();
  } else if (paymentStatus === "unpaid" && due.status !== "overdue") {
    nextStatus = "failed";
  }

  await pool.query(
    `
      UPDATE resident_dues_payments
      SET status = $1,
          paid_at = CASE WHEN $2::timestamp IS NULL THEN paid_at ELSE $2::timestamp END,
          stripe_payment_intent_id = $3,
          stripe_payment_status = $4,
          payment_method = $5,
          receipt_url = $6,
          failure_reason = $7,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
    `,
    [
      nextStatus,
      paidAt,
      paymentIntent || null,
      paymentStatus || null,
      paymentMethod || null,
      receiptUrl || null,
      failureReason || null,
      due.id,
    ]
  );
};

const getSocietyIdForRequester = async (requester) => {
  if (requester.society_id) return requester.society_id;
  const userQ = await pool.query("SELECT society_id FROM users WHERE id = $1", [requester.id]);
  return userQ.rows[0]?.society_id || null;
};

const mapDueForClient = (dueState) => {
  if (!dueState?.due) {
    return null;
  }

  const due = dueState.due;
  return {
    id: due.id,
    billingMonth: due.billing_month,
    dueDate: due.due_date,
    amount: due.amount_cents / 100,
    amountCents: due.amount_cents,
    currency: due.currency,
    status: due.status,
    paidAt: due.paid_at,
    canRequestSpecialCollection: dueState.canRequestSpecialCollection,
    blockReason: dueState.blockReason,
    stripeCheckoutSessionId: due.stripe_checkout_session_id,
    stripePaymentIntentId: due.stripe_payment_intent_id,
    receiptUrl: due.receipt_url,
    paymentMethod: due.payment_method,
  };
};

const getMyDueStatus = async (req, res) => {
  if (req.user.role !== "resident") {
    return fail(res, 403, "Access denied. Resident role required.");
  }

  try {
    const societyId = await getSocietyIdForRequester(req.user);
    const dueState = await ensureCurrentDueRecord(pool, req.user.id, societyId, new Date());

    if (dueState.noDueForCurrentMonth) {
      return res.status(200).json({
        success: true,
        monthlyAmount: getMonthlyDuesAmount(),
        dueStatus: null,
        message: "No dues are generated in your signup month. Billing starts from next month.",
      });
    }

    return res.status(200).json({
      success: true,
      monthlyAmount: getMonthlyDuesAmount(),
      dueStatus: mapDueForClient(dueState),
    });
  } catch (error) {
    console.error("Get due status error:", error);
    return fail(res, error.status || 500, error.message || "Failed to get due status");
  }
};

const getMyDueHistory = async (req, res) => {
  if (req.user.role !== "resident") {
    return fail(res, 403, "Access denied. Resident role required.");
  }

  try {
    const historyQ = await pool.query(
      `
        SELECT
          id,
          billing_month,
          due_date,
          amount_cents,
          currency,
          status,
          paid_at,
          payment_method,
          stripe_checkout_session_id,
          stripe_payment_intent_id,
          receipt_url,
          created_at,
          updated_at
        FROM resident_dues_payments
        WHERE user_id = $1
        ORDER BY billing_month DESC
        LIMIT 24
      `,
      [req.user.id]
    );

    return res.status(200).json({
      success: true,
      history: historyQ.rows.map((row) => ({
        id: row.id,
        billingMonth: row.billing_month,
        dueDate: row.due_date,
        amount: row.amount_cents / 100,
        amountCents: row.amount_cents,
        currency: row.currency,
        status: row.status,
        paidAt: row.paid_at,
        paymentMethod: row.payment_method,
        stripeCheckoutSessionId: row.stripe_checkout_session_id,
        stripePaymentIntentId: row.stripe_payment_intent_id,
        receiptUrl: row.receipt_url,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    console.error("Get due history error:", error);
    return fail(res, 500, "Failed to get due history");
  }
};

const createDueCheckoutSession = async (req, res) => {
  if (req.user.role !== "resident") {
    return fail(res, 403, "Access denied. Resident role required.");
  }

  const returnUrl = req.body?.returnUrl || DEFAULT_RETURN_URL;

  try {
    const stripe = getStripeClient();

    // Get ALL pending/overdue dues for this user
    const pendingQ = await pool.query(
      `SELECT * FROM resident_dues_payments
       WHERE user_id = $1 AND status IN ('pending', 'overdue')
       ORDER BY billing_month ASC`,
      [req.user.id]
    );

    const pendingDues = pendingQ.rows;

    if (pendingDues.length === 0) {
      return fail(res, 400, "No pending dues found. All dues are paid.");
    }

    const totalAmountCents = pendingDues.reduce((sum, d) => sum + Number(d.amount_cents), 0);
    const dueIds = pendingDues.map(d => d.id);

    const userQ = await pool.query(
      `SELECT id, first_name, last_name, email FROM users WHERE id = $1 LIMIT 1`,
      [req.user.id]
    );
    const user = userQ.rows[0];

    const customerQ = await pool.query(
      `
        SELECT stripe_customer_id
        FROM resident_dues_payments
        WHERE user_id = $1 AND stripe_customer_id IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [req.user.id]
    );

    let stripeCustomerId = customerQ.rows[0]?.stripe_customer_id || null;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email,
        metadata: {
          userId: String(user.id),
          role: "resident",
        },
      });
      stripeCustomerId = customer.id;
    }

    // Stripe requires http/https success_url and cancel_url.
    // Mobile deep links (exp://, mobile://, etc.) are not accepted directly.
    // When the returnUrl is a custom scheme, proxy through a backend redirect endpoint.
    let stripeSuccessUrl, stripeCancelUrl;
    if (/^https?:\/\//i.test(returnUrl)) {
      stripeSuccessUrl = `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}payment=success&session_id={CHECKOUT_SESSION_ID}`;
      stripeCancelUrl = appendParams(returnUrl, { payment: "cancelled" });
    } else {
      const backendBase = (
        process.env.BACKEND_PUBLIC_URL || `${req.protocol}://${req.get("host")}`
      ).replace(/\/$/, "");
      const encodedReturn = encodeURIComponent(returnUrl);
      stripeSuccessUrl = `${backendBase}/payment/redirect?return_url=${encodedReturn}&payment=success&session_id={CHECKOUT_SESSION_ID}`;
      stripeCancelUrl = `${backendBase}/payment/redirect?return_url=${encodedReturn}&payment=cancelled`;
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: stripeCustomerId,
      success_url: stripeSuccessUrl,
      cancel_url: stripeCancelUrl,
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: STRIPE_CURRENCY,
            unit_amount: totalAmountCents,
            product_data: {
              name: `Green Guardian Dues — ${pendingDues.length} item${pendingDues.length > 1 ? 's' : ''}`,
              description: `Clears all pending dues (${pendingDues.length} record${pendingDues.length > 1 ? 's' : ''})`,
            },
          },
        },
      ],
      metadata: {
        userId: String(req.user.id),
        duePaymentId: dueIds.join(','),   // comma-separated all due IDs
        payAllDues: 'true',
      },
    });

    // Tag ALL pending dues with this session
    await pool.query(
      `UPDATE resident_dues_payments
       SET stripe_checkout_session_id = $1,
           stripe_customer_id = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($3::int[])`,
      [checkoutSession.id, stripeCustomerId, dueIds]
    );

    return res.status(201).json({
      success: true,
      checkoutUrl: checkoutSession.url,
      checkoutSessionId: checkoutSession.id,
      amount: totalAmountCents / 100,
      amountCents: totalAmountCents,
      currency: STRIPE_CURRENCY,
      duesCount: pendingDues.length,
      sandbox: true,
    });
  } catch (error) {
    console.error("Create checkout session error:", error);
    return fail(res, error.status || 500, error.message || "Failed to create checkout session");
  }
};

const verifyDueCheckoutSession = async (req, res) => {
  if (req.user.role !== "resident") {
    return fail(res, 403, "Access denied. Resident role required.");
  }

  const sessionId = req.body?.sessionId;
  if (!sessionId) {
    return fail(res, 400, "sessionId is required.");
  }

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent", "payment_intent.latest_charge"],
    });

    const userIdFromStripe = Number.parseInt(session.metadata?.userId, 10);
    if (userIdFromStripe !== req.user.id) {
      return fail(res, 403, "This checkout session does not belong to the current user.");
    }

    const dueQ = await pool.query(
      `SELECT * FROM resident_dues_payments WHERE user_id = $1 AND stripe_checkout_session_id = $2`,
      [req.user.id, sessionId]
    );

    if (dueQ.rows.length === 0) {
      return fail(res, 404, "Due payment record not found for this session.");
    }

    const paymentIntent = session.payment_intent;
    const latestCharge = paymentIntent?.latest_charge || null;
    const paymentMethod = latestCharge?.payment_method_details?.type || session.payment_method_types?.[0] || "card";
    const paymentStatus = session.payment_status;
    const receiptUrl = latestCharge?.receipt_url || null;
    const piId = typeof paymentIntent === "object" ? paymentIntent?.id : paymentIntent || null;

    // Mark ALL dues linked to this session
    for (const due of dueQ.rows) {
      await finalizeDuePayment({
        due,
        paymentStatus,
        paymentIntent: piId,
        paymentMethod,
        receiptUrl,
        failureReason: session.status === "expired" ? "Checkout session expired" : null,
      });
    }

    const allPaid = paymentStatus === "paid";

    return res.status(200).json({
      success: true,
      paymentStatus,
      duesUpdated: dueQ.rows.length,
      message: allPaid
        ? `Payment successful. ${dueQ.rows.length} due(s) cleared.`
        : "Payment is not completed yet.",
    });
  } catch (error) {
    console.error("Verify checkout session error:", error);
    return fail(res, error.status || 500, error.message || "Failed to verify payment session");
  }
};

const processCheckoutSessionForWebhook = async (session) => {
  const duePaymentId = Number.parseInt(session?.metadata?.duePaymentId || "", 10);

  let due = null;
  if (Number.isFinite(duePaymentId) && duePaymentId > 0) {
    const byId = await pool.query(`SELECT * FROM resident_dues_payments WHERE id = $1 LIMIT 1`, [duePaymentId]);
    due = byId.rows[0] || null;
  }

  if (!due && session?.id) {
    const bySession = await pool.query(
      `SELECT * FROM resident_dues_payments WHERE stripe_checkout_session_id = $1 LIMIT 1`,
      [session.id]
    );
    due = bySession.rows[0] || null;
  }

  if (!due) {
    console.warn("[stripe-webhook] No dues record found for session", session?.id);
    return;
  }

  const paymentIntent = session.payment_intent;
  const paymentIntentId = typeof paymentIntent === "object" ? paymentIntent.id : paymentIntent || null;
  const paymentMethod =
    session.payment_method_types?.[0] ||
    (typeof paymentIntent === "object" ? paymentIntent?.payment_method_types?.[0] : null) ||
    "card";

  await finalizeDuePayment({
    due,
    paymentStatus: session.payment_status,
    paymentIntent: paymentIntentId,
    paymentMethod,
    receiptUrl: null,
    failureReason: session.status === "expired" ? "Checkout session expired" : null,
  });
};

const handleStripeWebhook = async (req, res) => {
  const stripe = getStripeClient();
  const sig = req.headers["stripe-signature"];
  const webhookSecret = getStripeWebhookSecret();

  if (!webhookSecret) {
    return fail(res, 500, "Missing STRIPE_WEBHOOK_SECRET configuration.");
  }

  if (!sig) {
    return fail(res, 400, "Missing stripe-signature header.");
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err.message);
    return fail(res, 400, `Webhook signature verification failed: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const session = event.data.object;
        await processCheckoutSessionForWebhook(session);
        break;
      }
      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed:", error);
    return fail(res, 500, "Stripe webhook processing failed");
  }
};

const getAdminOverview = async (req, res) => {
  const role = req.user.role;
  if (!["admin", "sub_admin", "super_admin"].includes(role)) {
    return fail(res, 403, "Access denied. Admin role required.");
  }

  try {
    const month = req.query.month || toIsoDate(getBillingMonthStart(new Date())).slice(0, 7);
    const monthStart = `${month}-01`;

    const scopeSocietyId = role === "super_admin" ? null : await getSocietyIdForRequester(req.user);

    const summaryQ = await pool.query(
      `
        SELECT
          COUNT(*) AS total_records,
          COUNT(*) FILTER (WHERE status = 'paid') AS paid_count,
          COUNT(*) FILTER (WHERE status = 'overdue') AS overdue_count,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
          COALESCE(SUM(amount_cents), 0) AS total_due_cents,
          COALESCE(SUM(amount_cents) FILTER (WHERE status = 'paid'), 0) AS total_collected_cents,
          COALESCE(SUM(amount_cents) FILTER (WHERE status IN ('pending','overdue','failed')), 0) AS total_outstanding_cents
        FROM resident_dues_payments
        WHERE billing_month = $1
          AND ($2::int IS NULL OR society_id = $2)
      `,
      [monthStart, scopeSocietyId]
    );

    const row = summaryQ.rows[0] || {};
    const total = Number.parseInt(row.total_records, 10) || 0;
    const paid = Number.parseInt(row.paid_count, 10) || 0;

    // Service delivery stats for this society/month
    const serviceQ = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE sr.status = 'completed') AS completed_services,
         COUNT(*) FILTER (WHERE sr.status IN ('assigned','in_progress','approved')) AS active_services,
         COALESCE(SUM(rdp.amount_cents) FILTER (WHERE rdp.due_type = 'service_request' AND rdp.status IN ('pending','overdue')), 0) AS service_fees_outstanding_cents,
         COALESCE(SUM(rdp.amount_cents) FILTER (WHERE rdp.due_type = 'service_request' AND rdp.status = 'paid'), 0) AS service_fees_collected_cents
       FROM service_requests sr
       JOIN users u ON sr.user_id = u.id
       LEFT JOIN resident_dues_payments rdp ON rdp.service_request_id = sr.id
       WHERE ($1::int IS NULL OR u.society_id = $1)
         AND DATE_TRUNC('month', sr.created_at) = DATE_TRUNC('month', $2::date)`,
      [scopeSocietyId, monthStart]
    );
    const sRow = serviceQ.rows[0] || {};

    return res.status(200).json({
      success: true,
      overview: {
        month,
        totalRecords: total,
        paidCount: paid,
        overdueCount: Number.parseInt(row.overdue_count, 10) || 0,
        pendingCount: Number.parseInt(row.pending_count, 10) || 0,
        collectionRate: total > 0 ? Number(((paid / total) * 100).toFixed(2)) : 0,
        totalDue: (Number.parseInt(row.total_due_cents, 10) || 0) / 100,
        totalCollected: (Number.parseInt(row.total_collected_cents, 10) || 0) / 100,
        totalOutstanding: (Number.parseInt(row.total_outstanding_cents, 10) || 0) / 100,
        currency: STRIPE_CURRENCY,
        // Service delivery stats
        completedServices: Number.parseInt(sRow.completed_services, 10) || 0,
        activeServices: Number.parseInt(sRow.active_services, 10) || 0,
        serviceFeesOutstanding: (Number.parseInt(sRow.service_fees_outstanding_cents, 10) || 0) / 100,
        serviceFeesCollected: (Number.parseInt(sRow.service_fees_collected_cents, 10) || 0) / 100,
      },
    });
  } catch (error) {
    console.error("Get admin overview error:", error);
    return fail(res, 500, "Failed to fetch dues overview");
  }
};

const getAdminRecords = async (req, res) => {
  const role = req.user.role;
  if (!["admin", "sub_admin", "super_admin"].includes(role)) {
    return fail(res, 403, "Access denied. Admin role required.");
  }

  const page = Math.max(Number.parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit || "20", 10), 1), 100);
  const offset = (page - 1) * limit;

  try {
    const scopeSocietyId = role === "super_admin" ? null : await getSocietyIdForRequester(req.user);
    const month = req.query.month || null;
    const status = req.query.status || null;
    const search = (req.query.search || "").trim().toLowerCase();

    const filters = [scopeSocietyId, month ? `${month}-01` : null, status, search ? `%${search}%` : null, limit, offset];

    const recordsQ = await pool.query(
      `
        SELECT
          rdp.id,
          rdp.user_id,
          rdp.society_id,
          rdp.billing_month,
          rdp.due_date,
          rdp.amount_cents,
          rdp.currency,
          rdp.status,
          rdp.paid_at,
          rdp.payment_method,
          rdp.stripe_checkout_session_id,
          rdp.stripe_payment_intent_id,
          rdp.receipt_url,
          rdp.updated_at,
          rdp.due_type,
          rdp.service_request_id,
          u.first_name,
          u.last_name,
          u.email,
          u.phone_number,
          ua.apartment_unit,
          ua.street_address,
          ua.city,
          s.society_name AS society_name
        FROM resident_dues_payments rdp
        JOIN users u ON u.id = rdp.user_id
        LEFT JOIN user_addresses ua ON ua.user_id = u.id AND ua.is_default = true AND ua.is_active = true
        LEFT JOIN societies s ON s.id = rdp.society_id
        WHERE ($1::int IS NULL OR rdp.society_id = $1)
          AND ($2::date IS NULL OR rdp.billing_month = $2)
          AND ($3::text IS NULL OR rdp.status = $3)
          AND (
            $4::text IS NULL OR
            LOWER(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) LIKE $4 OR
            LOWER(COALESCE(u.email, '')) LIKE $4 OR
            LOWER(COALESCE(u.phone_number, '')) LIKE $4
          )
        ORDER BY rdp.billing_month DESC, rdp.updated_at DESC
        LIMIT $5 OFFSET $6
      `,
      filters
    );

    const countQ = await pool.query(
      `
        SELECT COUNT(*) AS total
        FROM resident_dues_payments rdp
        JOIN users u ON u.id = rdp.user_id
        WHERE ($1::int IS NULL OR rdp.society_id = $1)
          AND ($2::date IS NULL OR rdp.billing_month = $2)
          AND ($3::text IS NULL OR rdp.status = $3)
          AND (
            $4::text IS NULL OR
            LOWER(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) LIKE $4 OR
            LOWER(COALESCE(u.email, '')) LIKE $4 OR
            LOWER(COALESCE(u.phone_number, '')) LIKE $4
          )
      `,
      [scopeSocietyId, month ? `${month}-01` : null, status, search ? `%${search}%` : null]
    );

    return res.status(200).json({
      success: true,
      records: recordsQ.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        societyId: row.society_id,
        societyName: row.society_name,
        residentName: [row.first_name, row.last_name].filter(Boolean).join(" "),
        email: row.email,
        phone: row.phone_number,
        houseNumber: row.apartment_unit || row.street_address || "-",
        city: row.city,
        billingMonth: row.billing_month,
        dueDate: row.due_date,
        amount: row.amount_cents / 100,
        amountCents: row.amount_cents,
        currency: row.currency,
        status: row.status,
        paidAt: row.paid_at,
        paymentMethod: row.payment_method,
        stripeCheckoutSessionId: row.stripe_checkout_session_id,
        stripePaymentIntentId: row.stripe_payment_intent_id,
        receiptUrl: row.receipt_url,
        updatedAt: row.updated_at,
        dueType: row.due_type || 'monthly',
        serviceRequestId: row.service_request_id || null,
        isServiceFee: row.due_type === 'service_request',
      })),
      pagination: {
        page,
        limit,
        total: Number.parseInt(countQ.rows[0]?.total || "0", 10),
      },
    });
  } catch (error) {
    console.error("Get admin records error:", error);
    return fail(res, 500, "Failed to fetch dues records");
  }
};

const getResidentHistoryForAdmin = async (req, res) => {
  const role = req.user.role;
  if (!["admin", "sub_admin", "super_admin"].includes(role)) {
    return fail(res, 403, "Access denied. Admin role required.");
  }

  const residentId = Number.parseInt(req.params.residentId, 10);
  if (!Number.isFinite(residentId) || residentId <= 0) {
    return fail(res, 400, "Invalid resident id");
  }

  try {
    const scopeSocietyId = role === "super_admin" ? null : await getSocietyIdForRequester(req.user);

    const residentQ = await pool.query(
      `
        SELECT id, first_name, last_name, email, phone_number, society_id
        FROM users
        WHERE id = $1 AND role = 'resident'
      `,
      [residentId]
    );

    const resident = residentQ.rows[0];
    if (!resident) {
      return fail(res, 404, "Resident not found");
    }

    if (scopeSocietyId && resident.society_id !== scopeSocietyId) {
      return fail(res, 403, "Resident is outside your society scope");
    }

    const historyQ = await pool.query(
      `
        SELECT
          id,
          billing_month,
          due_date,
          amount_cents,
          currency,
          status,
          paid_at,
          payment_method,
          stripe_checkout_session_id,
          stripe_payment_intent_id,
          receipt_url,
          created_at,
          updated_at
        FROM resident_dues_payments
        WHERE user_id = $1
        ORDER BY billing_month DESC
      `,
      [residentId]
    );

    return res.status(200).json({
      success: true,
      resident: {
        id: resident.id,
        name: [resident.first_name, resident.last_name].filter(Boolean).join(" "),
        email: resident.email,
        phone: resident.phone_number,
      },
      history: historyQ.rows.map((row) => ({
        id: row.id,
        billingMonth: row.billing_month,
        dueDate: row.due_date,
        amount: row.amount_cents / 100,
        amountCents: row.amount_cents,
        currency: row.currency,
        status: row.status,
        paidAt: row.paid_at,
        paymentMethod: row.payment_method,
        stripeCheckoutSessionId: row.stripe_checkout_session_id,
        stripePaymentIntentId: row.stripe_payment_intent_id,
        receiptUrl: row.receipt_url,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    console.error("Get resident history for admin error:", error);
    return fail(res, 500, "Failed to fetch resident payment history");
  }
};

module.exports = {
  getMyDueStatus,
  getMyDueHistory,
  createDueCheckoutSession,
  verifyDueCheckoutSession,
  handleStripeWebhook,
  getAdminOverview,
  getAdminRecords,
  getResidentHistoryForAdmin,
};
