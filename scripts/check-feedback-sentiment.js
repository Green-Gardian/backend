/**
 * Quick script to check sentiment analysis status for feedback
 * Run: node backend/scripts/check-feedback-sentiment.js
 */

const { pool } = require('../src/config/db');

async function checkFeedbackSentiment() {
    try {
        const query = `
            SELECT 
                id, 
                title, 
                sentiment_score, 
                sentiment_label, 
                sentiment_analyzed_at,
                created_at,
                CASE 
                    WHEN sentiment_analyzed_at IS NULL THEN '❌ Not Analyzed'
                    ELSE '✅ Analyzed'
                END as status
            FROM system_feedback
            ORDER BY created_at DESC
            LIMIT 10
        `;
        
        const result = await pool.query(query);
        
        if (result.rows.length === 0) {
            console.log('📭 No feedback found.');
            return;
        }
        
        console.log('\n📊 Recent Feedback Sentiment Analysis Status:\n');
        console.log('─'.repeat(80));
        
        result.rows.forEach((feedback) => {
            console.log(`\nID: ${feedback.id}`);
            console.log(`Title: ${feedback.title.substring(0, 60)}${feedback.title.length > 60 ? '...' : ''}`);
            console.log(`Status: ${feedback.status}`);
            
            if (feedback.sentiment_analyzed_at) {
                console.log(`Sentiment: ${feedback.sentiment_label || 'N/A'} (${feedback.sentiment_score || 'N/A'})`);
                console.log(`Analyzed: ${new Date(feedback.sentiment_analyzed_at).toLocaleString()}`);
            } else {
                console.log(`Created: ${new Date(feedback.created_at).toLocaleString()}`);
            }
            console.log('─'.repeat(80));
        });
        
        // Summary
        const summaryQuery = `
            SELECT 
                COUNT(*) as total,
                COUNT(sentiment_analyzed_at) as analyzed,
                COUNT(*) - COUNT(sentiment_analyzed_at) as not_analyzed
            FROM system_feedback
        `;
        
        const summary = await pool.query(summaryQuery);
        const stats = summary.rows[0];
        
        console.log(`\n📈 Summary:`);
        console.log(`  Total Feedback: ${stats.total}`);
        console.log(`  ✅ Analyzed: ${stats.analyzed}`);
        console.log(`  ❌ Not Analyzed: ${stats.not_analyzed}`);
        
        if (stats.not_analyzed > 0) {
            console.log(`\n💡 To analyze existing feedback, run:`);
            console.log(`   node scripts/analyze-existing-feedback.js\n`);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

if (require.main === module) {
    checkFeedbackSentiment();
}

module.exports = { checkFeedbackSentiment };

