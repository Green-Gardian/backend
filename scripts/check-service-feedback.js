const { pool } = require('../src/config/db');

async function checkServiceFeedback() {
    try {
        // Check service feedback count
        const feedbackCount = await pool.query('SELECT COUNT(*) FROM service_feedback');
        console.log('📊 Service Feedback Count:', feedbackCount.rows[0].count);

        // Check service requests count
        const requestsCount = await pool.query('SELECT COUNT(*) FROM service_requests');
        console.log('📦 Service Requests Count:', requestsCount.rows[0].count);

        // Check completed service requests (that can receive feedback)
        const completedRequests = await pool.query(`
      SELECT COUNT(*) 
      FROM service_requests 
      WHERE status = 'completed'
    `);
        console.log('✅ Completed Service Requests:', completedRequests.rows[0].count);

        // Show sample service feedback if any
        const sampleFeedback = await pool.query(`
      SELECT id, user_id, service_request_id, overall_rating, sentiment_label, created_at
      FROM service_feedback
      LIMIT 5
    `);

        if (sampleFeedback.rows.length > 0) {
            console.log('\n📋 Sample Service Feedback:');
            console.table(sampleFeedback.rows);
        } else {
            console.log('\n⚠️  No service feedback found!');
            console.log('💡 Residents need to provide feedback after service completion.');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

checkServiceFeedback();
