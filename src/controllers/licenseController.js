
const {pool} = require("../config/db");
const crypto = require('crypto');

const generateLicense = async (req,res) => {
    try{
        const { societyId , validFrom , validUntil , maxResidents , maxDrivers , maxBins } = req.body;
        if(!societyId || !validFrom || !validUntil || !maxResidents || !maxDrivers || !maxBins){
            return res.status(400).json({message: "All fields are required."});
        }

        const licenseKey = crypto.randomBytes(16).toString('hex'); // Generate a random license key

        const result = await pool.query(`
            INSERT INTO society_license (society_id, license_key, valid_from, valid_until, max_residents, max_drivers, max_bins)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *;
        `, [societyId, licenseKey, validFrom, validUntil, maxResidents, maxDrivers, maxBins]);

        return res.status(201).json({message: "License generated successfully.", license: result.rows[0]});
    }
    catch (error) {
        console.error("Error generating license:", error);
        return res.status(500).json({message: "Internal server error."});
    }
}

const getAllLicenses = async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM society_license`);
        return res.status(200).json({
            licenses: result.rows
        });
    } catch (error) {
        console.error("Error fetching licenses:", error);
        return res.status(500).json({message: "Internal server error."});
    }
}

const renewLicense = async (req, res) => {
    const { id } = req.params;
    const { validUntil, maxResidents, maxDrivers, maxBins } = req.body;

    if (!validUntil || !maxResidents || !maxDrivers || !maxBins) {
        return res.status(400).json({message: "All fields are required."});
    }

    try {
        const result = await pool.query(`
            UPDATE society_license
            SET valid_until = $1, max_residents = $2, max_drivers = $3, max_bins = $4, updated_at = CURRENT_TIMESTAMP
            WHERE id = $5
            RETURNING *;
        `, [validUntil, maxResidents, maxDrivers, maxBins, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({message: "License not found."});
        }

        return res.status(200).json({
            message: "License renewed successfully.",
            license: result.rows[0]
        });
    } catch (error) {
        console.error("Error renewing license:", error);
        return res.status(500).json({message: "Internal server error."});
    }
}

module.exports = {
    generateLicense,
    getAllLicenses,
    renewLicense
};
