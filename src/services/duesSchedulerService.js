const cron = require("node-cron");
const { pool } = require("../config/db");
const notificationService = require("./notificationService");
const {
  getBillingMonthStart,
  getDueDateForMonth,
  getMonthlyDuesAmountCents,
  toIsoDate,
} = require("./duesService");

const CURRENCY = (process.env.STRIPE_CURRENCY || "pkr").toLowerCase();
const TIMEZONE = process.env.DUES_CRON_TIMEZONE || "Asia/Karachi";

class DuesSchedulerService {
  constructor() {
    this.started = false;
    this.jobs = [];
  }

  async createMonthlyDuesForResidents(referenceDate = new Date()) {
    const billingMonthDate = getBillingMonthStart(referenceDate);
    const dueDate = getDueDateForMonth(billingMonthDate);

    const insertQ = await pool.query(
      `
        INSERT INTO resident_dues_payments (
          user_id,
          society_id,
          billing_month,
          due_date,
          amount_cents,
          currency,
          status,
          due_type,
          metadata
        )
        SELECT
          u.id,
          u.society_id,
          $1::date,
          $2::date,
          $3::int,
          $4::text,
          'pending',
          'monthly',
          jsonb_build_object(
            'createdByScheduler', true,
            'createdAt', CURRENT_TIMESTAMP
          )
        FROM users u
        WHERE u.role = 'resident'
          AND COALESCE(u.is_verified, true) = true
          AND COALESCE(u.is_blocked, false) = false
          AND u.created_at < $1::date
          AND NOT EXISTS (
            SELECT 1
            FROM resident_dues_payments rdp
            WHERE rdp.user_id = u.id
              AND rdp.billing_month = $1::date
              AND rdp.due_type = 'monthly'
          )
        RETURNING id
      `,
      [
        toIsoDate(billingMonthDate),
        toIsoDate(dueDate),
        getMonthlyDuesAmountCents(),
        CURRENCY,
      ]
    );

    return {
      billingMonth: toIsoDate(billingMonthDate),
      createdCount: insertQ.rowCount || 0,
    };
  }

  async sendUnpaidDuesReminders(reminderDay, referenceDate = new Date()) {
    const billingMonthDate = getBillingMonthStart(referenceDate);
    const billingMonth = toIsoDate(billingMonthDate);
    const reminderKey = `day_${reminderDay}`;

    const dueRows = await pool.query(
      `
        SELECT
          rdp.id,
          rdp.user_id,
          rdp.amount_cents,
          rdp.currency,
          rdp.due_date,
          rdp.status,
          u.first_name,
          u.last_name,
          u.email
        FROM resident_dues_payments rdp
        JOIN users u ON u.id = rdp.user_id
        WHERE rdp.billing_month = $1::date
          AND rdp.status IN ('pending', 'overdue', 'failed')
          AND u.role = 'resident'
          AND COALESCE(u.is_blocked, false) = false
          AND COALESCE((rdp.metadata->'reminders'->>$2), 'false') <> 'true'
      `,
      [billingMonth, reminderKey]
    );

    let sentCount = 0;

    for (const row of dueRows.rows) {
      if (!row.email) {
        continue;
      }

      const amount = (Number(row.amount_cents) / 100).toFixed(2);
      const residentName = [row.first_name, row.last_name].filter(Boolean).join(" ") || "Resident";

      const subject = `Green Guardian Dues Reminder (${billingMonth})`;
      const html = `
        <div style="font-family: Arial, sans-serif; line-height:1.5; color:#1f2937;">
          <h2 style="margin-bottom:8px;">Monthly Dues Reminder</h2>
          <p>Hello ${residentName},</p>
          <p>This is a reminder that your monthly dues are still unpaid.</p>
          <ul>
            <li><strong>Billing Month:</strong> ${billingMonth}</li>
            <li><strong>Due Date:</strong> ${row.due_date}</li>
            <li><strong>Amount:</strong> ${amount} ${String(row.currency || CURRENCY).toUpperCase()}</li>
            <li><strong>Status:</strong> ${row.status}</li>
          </ul>
          <p>Please complete payment in the mobile app to keep access to special collection requests.</p>
          <p>Thank you,<br/>Green Guardian Team</p>
        </div>
      `;

      const result = await notificationService.sendEmail(row.email, subject, html, null, row.user_id);
      if (!result.success) {
        continue;
      }

      await pool.query(
        `
          UPDATE resident_dues_payments
          SET metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{reminders,${reminderKey}}',
                'true'::jsonb,
                true
              ),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `,
        [row.id]
      );

      sentCount += 1;
    }

    return {
      billingMonth,
      reminderDay,
      totalUnpaid: dueRows.rowCount || 0,
      sentCount,
    };
  }

  async runDayOneGeneration() {
    const result = await this.createMonthlyDuesForResidents(new Date());
    console.log(`[dues-scheduler] Day 1 generation complete: ${result.createdCount} created for ${result.billingMonth}`);
  }

  async runReminderDay(day) {
    await this.createMonthlyDuesForResidents(new Date());
    const result = await this.sendUnpaidDuesReminders(day, new Date());
    console.log(
      `[dues-scheduler] Reminder day ${day}: sent ${result.sentCount}/${result.totalUnpaid} for ${result.billingMonth}`
    );
  }

  start() {
    if (this.started) return;

    const dayOneJob = cron.schedule(
      "5 0 1 * *",
      async () => {
        try {
          await this.runDayOneGeneration();
        } catch (error) {
          console.error("[dues-scheduler] Day 1 generation failed:", error);
        }
      },
      { timezone: TIMEZONE }
    );

    const dayThreeJob = cron.schedule(
      "0 9 3 * *",
      async () => {
        try {
          await this.runReminderDay(3);
        } catch (error) {
          console.error("[dues-scheduler] Day 3 reminder failed:", error);
        }
      },
      { timezone: TIMEZONE }
    );

    const daySixJob = cron.schedule(
      "0 9 6 * *",
      async () => {
        try {
          await this.runReminderDay(6);
        } catch (error) {
          console.error("[dues-scheduler] Day 6 reminder failed:", error);
        }
      },
      { timezone: TIMEZONE }
    );

    const dayEightJob = cron.schedule(
      "0 9 8 * *",
      async () => {
        try {
          await this.runReminderDay(8);
        } catch (error) {
          console.error("[dues-scheduler] Day 8 reminder failed:", error);
        }
      },
      { timezone: TIMEZONE }
    );

    this.jobs.push(dayOneJob, dayThreeJob, daySixJob, dayEightJob);
    this.started = true;

    // Startup safety run: ensure month records exist.
    this.createMonthlyDuesForResidents(new Date())
      .then((result) => {
        console.log(`[dues-scheduler] Startup sync complete: ${result.createdCount} created for ${result.billingMonth}`);
      })
      .catch((error) => {
        console.error("[dues-scheduler] Startup sync failed:", error);
      });
  }
}

module.exports = new DuesSchedulerService();
