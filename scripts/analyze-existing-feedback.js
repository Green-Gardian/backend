const { pool } = require('../src/config/db');
const sentimentService = require('../src/services/sentimentAnalysisService');

async function analyzeFeedbackBatch() {
    try {
        console.log('🔍 Finding service feedback without sentiment analysis...\n');

        // Get all feedback without sentiment analysis
        const result = await pool.query(`
      SELECT * FROM service_feedback
      WHERE sentiment_score IS NULL
      ORDER BY id ASC
    `);

        if (result.rows.length === 0) {
            console.log('✅ All feedback already has sentiment analysis!');
            process.exit(0);
        }

        console.log(`📊 Found ${result.rows.length} feedback entries to analyze\n`);

        let successCount = 0;
        let failCount = 0;

        for (const feedback of result.rows) {
            try {
                console.log(`\nAnalyzing feedback ID ${feedback.id}...`);

                // Analyze sentiment
                const sentimentData = await sentimentService.analyzeFeedback(
                    feedback.comments,
                    feedback.suggestions,
                    {
                        overall_rating: feedback.overall_rating,
                        timeliness_rating: feedback.timeliness_rating,
                        professionalism_rating: feedback.professionalism_rating,
                        cleanliness_rating: feedback.cleanliness_rating,
                    }
                );

                console.log(`  Score: ${sentimentData.sentiment_score}`);
                console.log(`  Label: ${sentimentData.sentiment_label}`);
                console.log(`  Urgent: ${sentimentData.requires_urgent_attention}`);

                // Update feedback with sentiment data
                await pool.query(`
          UPDATE service_feedback
          SET 
            sentiment_score = $1,
            sentiment_label = $2,
            key_themes = $3,
            requires_urgent_attention = $4,
            sentiment_summary = $5,
            sentiment_analyzed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $6
        `, [
                    sentimentData.sentiment_score,
                    sentimentData.sentiment_label,
                    JSON.stringify(sentimentData.key_themes || []),
                    sentimentData.requires_urgent_attention || false,
                    sentimentData.summary || null,
                    feedback.id
                ]);

                console.log(`  ✅ Updated successfully`);
                successCount++;

                // Small delay to avoid API rate limits
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
                console.error(`  ❌ Error analyzing feedback ID ${feedback.id}:`, error.message);
                failCount++;
            }
        }

        console.log(`\n${'='.repeat(50)}`);
        console.log(`📈 Summary:`);
        console.log(`  ✅ Success: ${successCount}`);
        console.log(`  ❌ Failed: ${failCount}`);
        console.log(`  📊 Total: ${result.rows.length}`);
        console.log(`${'='.repeat(50)}\n`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    }
}

console.log('🚀 Starting sentiment analysis batch job...\n');
analyzeFeedbackBatch();
